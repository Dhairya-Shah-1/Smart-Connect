function getRequiredEnv(name: string): string {
  const value = import.meta.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export const env = {
  supabaseUrl: getRequiredEnv("VITE_SUPABASE_URL"),
  supabaseAnonKey: getRequiredEnv("VITE_SUPABASE_ANON_KEY"),
};

export const appAssetBaseUrl = `${env.supabaseUrl}/storage/v1/object/public/app-assets`;
