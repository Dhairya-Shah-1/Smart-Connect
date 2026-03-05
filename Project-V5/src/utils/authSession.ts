import { supabase } from '../components/supabaseClient';

function getErrorMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message ?? '');
  }
  return '';
}

export function isInvalidRefreshTokenError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes('invalid refresh token') ||
    message.includes('refresh token not found') ||
    message.includes('refresh_token_not_found')
  );
}

export async function clearInvalidAuthSession(): Promise<void> {
  try {
    await supabase.auth.signOut({ scope: 'local' });
  } catch {
    // No-op: local cleanup below is the fallback path.
  }

  localStorage.removeItem('currentUser');
  localStorage.removeItem('reportHistory_cache');
}

export async function getValidSessionOrNull() {
  const { data, error } = await supabase.auth.getSession();

  if (error || !data.session) {
    if (isInvalidRefreshTokenError(error)) {
      await clearInvalidAuthSession();
    }
    return null;
  }

  return data.session;
}
