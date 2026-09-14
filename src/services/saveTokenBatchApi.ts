import { getSupabase } from '../lib/supabase';
import { extractBackendErrorMessage } from './toastManager';

export const SAVE_TOKEN_BATCH_URL =
  'https://pqqomaveycjeorgurpev.supabase.co/functions/v1/save-token-batch-v4';

export interface BatchSaveResult {
  success: boolean;
  saved?: Array<{ tokenId: string; chainId: string; contractAddress: string; name: string; symbol: string; reward: number }>;
  duplicates?: Array<{ chainId: string; contractAddress: string; reason: string }>;
  savedCount?: number;
  duplicateCount?: number;
  rewardEarned?: number;
  dailyUsed?: number;
  dailyRemaining?: number;
  notification?: { type: string; title: string; message: string } | null;
  error?: string;
  message?: string;
  [key: string]: unknown;
}

export async function saveTokenBatchThroughEdgeFunction(tokens: unknown[]): Promise<BatchSaveResult> {
  if (!Array.isArray(tokens) || tokens.length < 1 || tokens.length > 50) {
    return { success: false, error: 'BATCH_LIMIT_EXCEEDED', message: 'You can submit between 1 and 50 tokens per batch.' };
  }

  const supabase = getSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token || !session.user?.id) {
    return { success: false, error: 'AUTH_REQUIRED', message: 'Please sign in before saving tokens.' };
  }

  // Send the authenticated user's ID explicitly as an integrity check.
  // The Edge Function still obtains the authoritative ID from the bearer token;
  // it must reject this value if it does not match the authenticated user.
  const authenticatedUserId = session.user.id;

  try {
    const response = await fetch(SAVE_TOKEN_BATCH_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId: authenticatedUserId, tokens }),
    });

    const rawText = await response.text();
    let result: any = null;
    try { result = rawText ? JSON.parse(rawText) : null; } catch { result = null; }

    if (!response.ok || result?.success === false) {
      const exactError = extractBackendErrorMessage(response.status, result || rawText);
      // Preserve the server's exact error/message so the UI can display it.
      return {
        success: false,
        error: result?.error || exactError,
        message: result?.message || exactError,
        ...(result || {}),
      };
    }

    return result as BatchSaveResult;
  } catch (error: any) {
    console.error('[SaveTokenBatch] Edge Function request failed:', error);
    const message = error?.message || 'Unable to reach token save service.';
    return { success: false, error: 'EDGE_FUNCTION_UNREACHABLE', message };
  }
}
