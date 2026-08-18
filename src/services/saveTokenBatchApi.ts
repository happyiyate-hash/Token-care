import { getSupabase } from '../lib/supabase';

export const SAVE_TOKEN_BATCH_URL =
  'https://pqqomaveycjeorgurpev.supabase.co/functions/v1/save-token-batch';

export interface BatchSaveResult {
  success: boolean;
  saved?: Array<{
    tokenId: string;
    chainId: string;
    contractAddress: string;
    name: string;
    symbol: string;
    reward: number;
  }>;
  duplicates?: Array<{
    chainId: string;
    contractAddress: string;
    reason: string;
  }>;
  savedCount?: number;
  duplicateCount?: number;
  rewardEarned?: number;
  dailyUsed?: number;
  dailyRemaining?: number;
  error?: string;
  message?: string;
}

/**
 * New token-save boundary. The existing save implementation remains untouched
 * so the migration can be switched over without deleting the old path.
 */
export async function saveTokenBatchThroughEdgeFunction(
  tokens: unknown[],
): Promise<BatchSaveResult> {
  if (!Array.isArray(tokens) || tokens.length < 1 || tokens.length > 50) {
    return {
      success: false,
      error: 'BATCH_LIMIT_EXCEEDED',
      message: 'You can submit between 1 and 50 tokens per batch.',
    };
  }

  const supabase = getSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return {
      success: false,
      error: 'AUTH_REQUIRED',
      message: 'Please sign in before saving tokens.',
    };
  }

  try {
    const response = await fetch(SAVE_TOKEN_BATCH_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tokens }),
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      return {
        success: false,
        error: result.error || `HTTP_${response.status}`,
        message: result.message || 'Unable to save token batch.',
        ...result,
      };
    }

    return result as BatchSaveResult;
  } catch (error: any) {
    console.error('[SaveTokenBatch] Edge Function request failed:', error);
    return {
      success: false,
      error: 'NETWORK_ERROR',
      message: error?.message || 'Unable to reach token save service.',
    };
  }
}
