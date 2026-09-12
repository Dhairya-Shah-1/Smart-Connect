/// <reference types="./deno.d.ts" />

import { createClient } from '@supabase/supabase-js';

function readServerEnv(key: string): string | undefined {
  const processValue = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[key];
  if (processValue) return processValue;
  try { return Deno.env.get(key); } catch { return undefined; }
}

function getRequiredServerEnv(...keys: string[]): string {
  for (const key of keys) {
    const value = readServerEnv(key);
    if (value) return value;
  }
  throw new Error(`Missing required environment variable. Expected one of: ${keys.join(', ')}`);
}

const supabaseUrl = getRequiredServerEnv('SUPABASE_URL', 'VITE_SUPABASE_URL');
const supabaseAnonKey = getRequiredServerEnv('SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY');
const supabaseServiceRoleKey = getRequiredServerEnv('SUPABASE_SERVICE_ROLE_KEY');
const authClient = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } });
const storageClient = createClient(supabaseUrl, supabaseServiceRoleKey, { auth: { persistSession: false } });

export default async function handler(req: Request): Promise<Response> {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
  };

  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });

  try {
    const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (!token) throw new Error('Your login session is missing. Please sign in again.');

    const { data: authData, error: authError } = await authClient.auth.getUser(token);
    if (authError || !authData.user) throw new Error('Your login session has expired. Please sign in again.');

    const formData = await req.formData();
    const file = formData.get('file');
    if (!(file instanceof File) || !file.type.startsWith('image/')) {
      throw new Error('Please provide an image file.');
    }
    if (file.size > 10 * 1024 * 1024) throw new Error('Image must be 10 MB or smaller.');

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_') || 'evidence-image';
    const path = `reports/${authData.user.id}/${crypto.randomUUID()}-${safeName}`;
    const { error: uploadError } = await storageClient.storage
      .from('incident-images')
      .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type });
    if (uploadError) throw new Error(`Evidence upload failed: ${uploadError.message}`);

    const { data } = storageClient.storage.from('incident-images').getPublicUrl(path);
    return new Response(JSON.stringify({ success: true, publicUrl: data.publicUrl }), { headers });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || 'Evidence upload failed' }), { status: 400, headers });
  }
}
