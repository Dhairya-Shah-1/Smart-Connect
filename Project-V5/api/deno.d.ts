// Deno type declarations for Supabase Edge Functions

interface DenoEnv {
  get(key: string): string | undefined;
}

declare const Deno: {
  env: DenoEnv;
};
