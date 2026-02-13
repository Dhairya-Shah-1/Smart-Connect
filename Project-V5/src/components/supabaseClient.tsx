import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://sbbfbzytpshfnlhymkss.supabase.co';
const supabaseKey = 'sb_publishable_US_0_m1eMLhIjq2DjGDpdA_z98L6FDQ';

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
