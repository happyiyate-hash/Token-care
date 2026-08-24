/**
 * User Token Cache Service
 *
 * Interacts through the central Vercel Token Backend API Gateway:
 * - getTokensByUser: POST /api
 * - save-token: POST /api/save-token
 */

import {
  fetchTokensByUserFromBackend,
  saveTokensToBackend,
  VERCEL_TOKEN_GATEWAY_URL,
  formatTokenForBackend,
  BackendTokenItem,
} from './vercelTokenBackend';

export const USER_TOKEN_CACHE_WORKER_URL = VERCEL_TOKEN_GATEWAY_URL;

export interface WorkerUserTokenItem {
  blockchain: string;
  chainId?: string | number;
  blockchainName?: string;
  blockchainSymbol?: string;
  tokenStandard?: string;
  id: string;
  contractAddress?: string;
  name?: string;
  tokenName?: string;
  symbol?: string;
  tokenSymbol?: string;
  logoUrl?: string;
  [key: string]: unknown;
}

export interface SaveUserTokensWorkerRequest {
  user_id: string;
  tokens: WorkerUserTokenItem[];
}

export interface SaveUserTokensWorkerResponse {
  success: boolean;
  user_id?: string;
  tokens?: WorkerUserTokenItem[];
  mode?: 'merge' | 'replace';
  error?: string;
  message?: string;
}

export interface GetUserTokensWorkerResponse {
  user_id: string;
  tokens: WorkerUserTokenItem[];
}

export async function saveUserTokensToWorker(
  userId: string,
  tokens: WorkerUserTokenItem[],
  merge: boolean = true
): Promise<SaveUserTokensWorkerResponse> {
  if (!userId || !userId.trim()) return { success: false, error: 'User ID is required.' };
  if (!Array.isArray(tokens) || tokens.length === 0) return { success: false, error: 'No tokens provided.' };

  try {
    const formatted: BackendTokenItem[] = tokens.map((t) => formatTokenForBackend(t));
    const res = await saveTokensToBackend(userId, formatted);

    return {
      success: res.success,
      user_id: userId,
      tokens,
      mode: merge ? 'merge' : 'replace',
      error: res.error || (res.success ? undefined : res.message),
      message: res.message,
    };
  } catch (err: any) {
    console.warn('[UserTokenCache] Failed to save tokens to backend:', err?.message || err);
    return { success: false, error: err?.message || 'Failed to save tokens.' };
  }
}

export async function getUserTokensFromWorker(userId: string): Promise<GetUserTokensWorkerResponse> {
  if (!userId || !userId.trim()) return { user_id: '', tokens: [] };

  try {
    const rawTokens = await fetchTokensByUserFromBackend(userId);
    const mapped: WorkerUserTokenItem[] = (rawTokens || []).map((t) => {
      const id = String(t.contractAddress || t.address || t.id || '').trim();
      const blockchain = String(t.blockchain || t.chainId || 'polygon').trim();
      return {
        id,
        contractAddress: id,
        blockchain,
        blockchainName: t.blockchainName || t.chainName || blockchain,
        blockchainSymbol: t.blockchainSymbol || t.chainSymbol || 'MATIC',
        name: t.tokenName || t.name || 'Token',
        tokenName: t.tokenName || t.name || 'Token',
        symbol: (t.tokenSymbol || t.symbol || 'TOK').toUpperCase(),
        tokenSymbol: (t.tokenSymbol || t.symbol || 'TOK').toUpperCase(),
        logoUrl: t.logoUrl || '',
        ...t,
      };
    });

    return { user_id: userId, tokens: mapped };
  } catch (err: any) {
    console.warn('[UserTokenCache] Failed to retrieve tokens for user:', userId, err?.message || err);
    return { user_id: userId, tokens: [] };
  }
}
