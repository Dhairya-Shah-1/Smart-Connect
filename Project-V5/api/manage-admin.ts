// api/manage-admin.ts
/// <reference types="./deno.d.ts" />

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function readServerEnv(key: string): string | undefined {
  const processValue = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[key];
  if (processValue) {
    return processValue;
  }

  try {
    return Deno.env.get(key);
  } catch {
    return undefined;
  }
}

function getOptionalEnv(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = readServerEnv(key);
    if (value) {
      return value;
    }
  }
  return undefined;
}

const supabaseUrl = getOptionalEnv('SUPABASE_URL', 'VITE_SUPABASE_URL');

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Canonical department names. Keep in sync with src/config/departments.ts
// (DEPARTMENT_OPTIONS) - this endpoint runs as a Vercel/Deno function and cannot
// import the front-end config module directly.
const DEPARTMENT_OPTIONS = [
  'Public Works Department',
  'Solid Waste Management',
  'Disaster Management',
  'Storm Water Drains',
  'Traffic Police',
  'Fire Department',
];

// Older free-text department names are still accepted (and mapped onto the
// canonical list) so admins created before the list existed keep working.
const LEGACY_DEPARTMENT_ALIASES: Record<string, string> = {
  'sanitation department': 'Solid Waste Management',
  'roads & infrastructure': 'Public Works Department',
  'road and infrastructure': 'Public Works Department',
  'water management': 'Storm Water Drains',
  'public works': 'Public Works Department',
};

function normalizeDepartmentName(value: string): string {
  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();
  const canonical = DEPARTMENT_OPTIONS.find((option) => option.toLowerCase() === lower);
  if (canonical) return canonical;
  return LEGACY_DEPARTMENT_ALIASES[lower] || trimmed;
}

// Finds an existing auth user by email. Used when the email is already
// registered (for example a normal user that is being promoted to admin) so we
// never surface a hard "user already registered" error.
async function findAuthUserByEmail(supabaseAdmin: SupabaseClient, email: string) {
  const target = email.toLowerCase();

  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      throw error;
    }

    const users = data?.users ?? [];
    const match = users.find((user) => (user.email || '').toLowerCase() === target);
    if (match) {
      return match;
    }

    if (users.length < 200) {
      return null;
    }
  }

  return null;
}

// The `admins` table has a few legacy columns (station, district, ...) whose
// nullability we cannot read from the client. When a "not null" constraint is
// hit we fill in an empty value for that column instead of failing the request.
function parseMissingColumns(message?: string): string[] {
  if (!message) return [];

  const columns: string[] = [];
  const matcher = /null value in column "([^"]+)" of relation "([^"]+)"/g;
  let result: RegExpExecArray | null;

  while ((result = matcher.exec(message)) !== null) {
    if (result[2] === 'admins') {
      columns.push(result[1]);
    }
  }

  return columns;
}

async function insertAdminRow(supabaseAdmin: SupabaseClient, baseRow: Record<string, unknown>) {
  const row: Record<string, unknown> = { ...baseRow };

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const { data, error } = await supabaseAdmin.from('admins').insert([row]).select().maybeSingle();
    if (!error) {
      return { data, error: null as { message?: string } | null };
    }

    const missing = parseMissingColumns(error.message).filter((column) => !(column in row));
    if (missing.length === 0) {
      return { data: null, error: error as { message?: string } };
    }

    missing.forEach((column) => {
      row[column] = '';
    });
  }

  return { data: null, error: { message: 'Could not determine the required columns of the admins table.' } };
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    const serviceRoleKey = getOptionalEnv('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY');

    if (!supabaseUrl) {
      return json({ error: 'Server is missing SUPABASE_URL / VITE_SUPABASE_URL.' }, 500);
    }

    // Creating auth users requires the service role key. The anon key cannot
    // call the admin API, so we fail loudly instead of producing a broken row.
    if (!serviceRoleKey) {
      return json(
        {
          error:
            'Server is missing SUPABASE_SERVICE_ROLE_KEY. Add it to your .env (and Vercel environment variables) to allow super admins to create admin accounts.',
        },
        500,
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // -----------------------------
    // 1. Authenticate the caller
    // -----------------------------
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.toLowerCase().startsWith('bearer ')
      ? authHeader.slice(7).trim()
      : '';

    if (!token) {
      return json({ error: 'Missing authorization token.' }, 401);
    }

    const { data: callerData, error: callerError } = await supabaseAdmin.auth.getUser(token);
    if (callerError || !callerData?.user) {
      return json({ error: 'Your session is invalid or has expired. Please log in again.' }, 401);
    }

    // -----------------------------
    // 2. Make sure the caller is a super admin
    // -----------------------------
    const { data: superAdmin, error: superAdminError } = await supabaseAdmin
      .from('super_admins')
      .select('sa_id')
      .eq('sa_id', callerData.user.id)
      .maybeSingle();

    if (superAdminError) {
      throw superAdminError;
    }

    if (!superAdmin) {
      return json({ error: 'Only a super admin can add admins.' }, 403);
    }

    // -----------------------------
    // 3. Validate the submitted values
    // -----------------------------
    const body = (await req.json().catch(() => ({}))) as {
      email?: string;
      password?: string;
      name?: string;
      department_name?: string;
      location?: string;
    };

    const email = (body.email || '').trim().toLowerCase();
    const password = (body.password || '').trim();
    const name = (body.name || '').trim();
    const departmentName = normalizeDepartmentName(body.department_name || '');
    const location = (body.location || '').trim();

    if (!email || !EMAIL_PATTERN.test(email)) {
      return json({ error: 'Please enter a valid email address.' }, 400);
    }

    if (password && password.length < 6) {
      return json({ error: 'Password must be at least 6 characters, or leave it blank.' }, 400);
    }

    if (!name) {
      return json({ error: "Admin's name is required." }, 400);
    }

    if (!departmentName) {
      return json({ error: "Admin's department name is required." }, 400);
    }

    if (!DEPARTMENT_OPTIONS.includes(departmentName)) {
      return json(
        { error: `Department must be one of: ${DEPARTMENT_OPTIONS.join(', ')}.` },
        400,
      );
    }

    if (!location) {
      return json({ error: 'Location is required.' }, 400);
    }

    // -----------------------------
    // 4. Reject duplicates
    // -----------------------------
    const { data: existingAdmin, error: existingAdminError } = await supabaseAdmin
      .from('admins')
      .select('a_id, a_email')
      .eq('a_email', email)
      .maybeSingle();

    if (existingAdminError) {
      throw existingAdminError;
    }

    if (existingAdmin) {
      return json({ error: 'An admin with this email already exists.' }, 409);
    }

    // -----------------------------
    // 5. Create (or reuse) the auth user
    // -----------------------------
    // email_confirm: true is what keeps Google sign-in working later: Supabase
    // automatically links a Google identity to this confirmed email, so the
    // admin keeps the SAME user id (and therefore the same admins.a_id).
    const attributes: Record<string, unknown> = {
      email,
      email_confirm: true,
      user_metadata: { full_name: name },
    };
    if (password) {
      attributes.password = password;
    }

    let userId: string;
    let createdAuthUser = false;
    let reusedAuthUser = false;

    const { data: createdUser, error: createError } = await supabaseAdmin.auth.admin.createUser(attributes as any);

    if (!createError && createdUser?.user) {
      userId = createdUser.user.id;
      createdAuthUser = true;
    } else {
      const existingUser = await findAuthUserByEmail(supabaseAdmin, email);
      if (!existingUser) {
        return json({ error: createError?.message || 'Failed to create the admin account.' }, 400);
      }

      userId = existingUser.id;
      reusedAuthUser = true;

      if (password) {
        const { error: passwordError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
          password,
          email_confirm: true,
          user_metadata: { ...(existingUser.user_metadata || {}), full_name: name },
        } as any);

        if (passwordError) {
          return json({ error: passwordError.message }, 400);
        }
      }
    }

    // -----------------------------
    // 6. Ensure the public.users profile row exists
    // -----------------------------
    // admins.a_id has a foreign key to users.u_id (verified: admins_a_id_fkey).
    // Auth users created here - and existing Google users who never logged in
    // before - do not have a profile row yet, so the admins insert below would
    // fail the FK. Only insert when missing; never overwrite an existing
    // profile (sign-up/login may already have created one).
    const { data: existingProfile, error: profileLookupError } = await supabaseAdmin
      .from('users')
      .select('u_id')
      .eq('u_id', userId)
      .maybeSingle();

    if (profileLookupError) {
      return json({ error: `Failed to check the admin profile: ${profileLookupError.message}` }, 500);
    }

    if (!existingProfile) {
      const { error: profileInsertError } = await supabaseAdmin
        .from('users')
        .insert([{ u_id: userId, u_name: name, u_email: email }]);

      if (profileInsertError) {
        return json({ error: `Failed to save the admin profile: ${profileInsertError.message}` }, 500);
      }
    }

    // -----------------------------
    // 7. Link the auth user to the admins table
    // -----------------------------
    // `admins.location` is a PostGIS geography(Point,4326) column, so a plain
    // text value like "Vadodara, Gujarat" is rejected by PostGIS with
    // "parse error - invalid geometry". The free-text place the super admin
    // enters is stored in the `station` text column instead: that is what the
    // dashboard renders (AdminList's MapPin line and the incident location
    // fallback in SuperAdminDashboard) and it matches how every existing admin
    // row is stored. The geography column stays NULL.
    const { data: adminRow, error: insertError } = await insertAdminRow(supabaseAdmin, {
      a_id: userId,
      a_email: email,
      a_name: name,
      department_name: departmentName,
      station: location,
    });

    if (insertError) {
      return json({ error: `Failed to save the admin record: ${insertError.message}` }, 500);
    }

    const message = createdAuthUser
      ? password
        ? 'Admin created. They can sign in with the password you set.'
        : 'Admin added. They can sign in with Google using this email.'
      : 'Admin added to an existing account.';

    return json({
      success: true,
      message,
      admin: adminRow,
      createdAuthUser,
      reusedAuthUser,
    });
  } catch (err: any) {
    console.error('manage-admin failed:', err);
    return json({ error: err?.message || 'Unexpected server error.' }, 500);
  }
}
