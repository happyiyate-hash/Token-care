/**
 * Token Batch Verification & Local Saved List Service
 *
 * Handles:
 * 1. Local saved-tokens management (limit: 20 tokens max)
 * 2. verifyTokensBatch Edge Function & Backend Gateway calls
 * 3. batchSaveTokens backend requests
 */

import { ChainId, SubmittedToken } from '../types';
import { getChainInfo } from '../constants/chains';
import { extractBackendErrorMessage, notifyBackendError } from './toastManager';
import { getRewardWallet, recordBatchTokenSubmissionReward } from './storage';
import { createNotificationInSupabase, getSupabase, ensureValidUUID } from '../lib/supabase';
import {
  verifyTokensBatchLocal,
  batchSaveTokensLocal,
  submitSingleTokenLocal,
  getAllTokensLocal,
  getTokensByUserLocal,
  storedTokenToSubmittedToken,
  StoredLocalToken,
} from './localTokenStore';

export interface SavedTokenItem {
  id: string;
  name: string;
  symbol: string;
  blockchain: string;
  chainId: string | number;
  contractAddress: string;
  logoUrl?: string;
  decimals?: number;
  priceUsd?: number;
  trustScore?: number;
  safetyRating?: string;
  savedAt: string;
  // Verification status returned by Edge Function / verifyTokensBatch
  verificationStatus?: 'unverified' | 'checking' | 'exists' | 'available' | 'error';
  verificationDetails?: {
    exists: boolean;
    ownedBy?: string | null;
    error?: string | null;
    verifiedAt?: string;
  };
}

export interface VerifyTokensBatchRequest {
  action: 'verifyTokensBatch';
  tokens: Array<{
    blockchain: string;
    contractAddress: string;
  }>;
}

export interface VerifyTokenResultItem {
  blockchain: string;
  contractAddress: string;
  exists: boolean;
  ownedBy?: string | null;
  error?: string | null;
}

export interface VerifyTokensBatchResponse {
  success: boolean;
  total?: number;
  existed?: number;
  notExisted?: number;
  results?: VerifyTokenResultItem[];
  error?: string;
  message?: string;
}

export interface BatchSaveTokensRequest {
  action: 'batchSaveTokens';
  userId: string;
  tokens: Array<{
    name: string;
    symbol: string;
    contractAddress: string;
    blockchain: string;
    logoUrl: string;
    chainId?: number | string;
  }>;
}

export const MAX_SAVED_TOKENS = 20;

// Storage key helpers
const PRIMARY_SAVED_TOKENS_KEY = 'tokencare_saved_tokens_v1';

function getAllPossibleKeys(userId?: string): string[] {
  const keys = [PRIMARY_SAVED_TOKENS_KEY, 'tokencare_saved_list_default_user'];
  if (userId) {
    keys.push(`tokencare_saved_list_${userId}`);
  }
  return keys;
}

/**
 * Get current saved tokens list from local storage (unified across sessions)
 */
export function getLocalSavedTokens(userId?: string): SavedTokenItem[] {
  try {
    // 1. Try primary key first
    const primaryRaw = localStorage.getItem(PRIMARY_SAVED_TOKENS_KEY);
    if (primaryRaw) {
      try {
        const parsed = JSON.parse(primaryRaw);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      } catch {}
    }

    // 2. Check fallback/legacy keys
    const fallbackKeys = getAllPossibleKeys(userId);
    for (const key of fallbackKeys) {
      if (key === PRIMARY_SAVED_TOKENS_KEY) continue;
      const raw = localStorage.getItem(key);
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            // Migrate to primary key
            localStorage.setItem(PRIMARY_SAVED_TOKENS_KEY, JSON.stringify(parsed));
            return parsed;
          }
        } catch {}
      }
    }

    return [];
  } catch (err) {
    console.warn('[SavedTokensService] Error reading saved list:', err);
    return [];
  }
}

/**
 * Broadcast update event across window & tabs
 */
function broadcastTokensUpdate(tokens: SavedTokenItem[]) {
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(
        new CustomEvent('tokencare_saved_tokens_updated', {
          detail: { tokens, count: tokens.length },
        })
      );
    } catch {}
  }
}

/**
 * Save updated tokens list to local storage
 */
export function saveLocalSavedTokens(tokens: SavedTokenItem[], userId?: string): void {
  try {
    const trimmed = (tokens || []).slice(0, MAX_SAVED_TOKENS);
    const jsonStr = JSON.stringify(trimmed);
    localStorage.setItem(PRIMARY_SAVED_TOKENS_KEY, jsonStr);
    if (userId) {
      localStorage.setItem(`tokencare_saved_list_${userId}`, jsonStr);
    }
    localStorage.setItem('tokencare_saved_list_default_user', jsonStr);
    broadcastTokensUpdate(trimmed);
  } catch (err) {
    console.warn('[SavedTokensService] Error saving local tokens list:', err);
  }
}

/**
 * Add a token to the local saved list (max 20 tokens)
 */
export function addLocalSavedToken(
  token: Partial<SavedTokenItem> & { name: string; symbol: string; contractAddress?: string; blockchain?: string },
  userId?: string
): { success: boolean; error?: string; list: SavedTokenItem[]; token?: SavedTokenItem; isFull?: boolean } {
  const currentList = getLocalSavedTokens(userId);

  // Check max limit (strictly up to 20 tokens)
  if (currentList.length >= MAX_SAVED_TOKENS) {
    return {
      success: false,
      error: `You have reached the maximum limit of ${MAX_SAVED_TOKENS} saved tokens in your list.`,
      list: currentList,
      isFull: true,
    };
  }

  const rawAddress = (token.contractAddress || (token as any).address || '').trim();
  const rawChain = (token.blockchain || (token as any).chainName || 'Ethereum').trim();
  const cleanAddress = rawAddress.toLowerCase();
  const cleanChain = rawChain.toLowerCase();

  // Check duplicate only when meaningful address exists, otherwise compare symbol and blockchain
  const existingIdx = currentList.findIndex((t) => {
    const tAddr = (t.contractAddress || '').trim().toLowerCase();
    const tChain = (t.blockchain || '').trim().toLowerCase();
    if (cleanAddress && tAddr) {
      return tAddr === cleanAddress && tChain === cleanChain;
    }
    return (t.symbol || '').toUpperCase() === (token.symbol || '').toUpperCase() && tChain === cleanChain;
  });

  if (existingIdx >= 0) {
    return {
      success: false,
      error: `"${token.symbol || token.name}" is already in your saved list.`,
      list: currentList,
    };
  }

  const newItem: SavedTokenItem = {
    id: token.id && token.id !== 'token-pending' ? token.id : `saved-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: token.name || 'Unknown Token',
    symbol: (token.symbol || 'TOK').toUpperCase(),
    blockchain: rawChain || 'Ethereum',
    chainId: token.chainId || 1,
    contractAddress: rawAddress,
    logoUrl: token.logoUrl || (token as any).chainLogoUrl || '',
    decimals: token.decimals || 18,
    priceUsd: token.priceUsd ?? (token as any).marketData?.priceUsd ?? 0,
    trustScore: token.trustScore ?? (token as any).verificationReport?.trustScore ?? (token as any).safety?.score ?? 85,
    safetyRating: token.safetyRating || (token as any).safety?.rating || 'SAFE',
    savedAt: new Date().toISOString(),
    verificationStatus: 'unverified',
  };

  const updated = [newItem, ...currentList.filter((item) => item.id !== newItem.id)];
  saveLocalSavedTokens(updated, userId);

  return {
    success: true,
    list: updated,
    token: newItem,
  };
}

/**
 * Remove a token from the local saved list
 */
export function removeLocalSavedToken(contractAddress: string, blockchain: string, userId?: string): SavedTokenItem[] {
  const current = getLocalSavedTokens(userId);
  const cleanAddress = (contractAddress || '').trim().toLowerCase();
  const cleanChain = (blockchain || '').trim().toLowerCase();

  const updated = current.filter((t) => {
    const tAddr = (t.contractAddress || '').trim().toLowerCase();
    const tChain = (t.blockchain || '').trim().toLowerCase();
    if (cleanAddress && tAddr) {
      return !(tAddr === cleanAddress && tChain === cleanChain);
    }
    return true;
  });

  saveLocalSavedTokens(updated, userId);
  return updated;
}

/**
 * Clear all saved tokens in local storage
 */
export function clearLocalSavedTokens(userId?: string): void {
  try {
    const keys = getAllPossibleKeys(userId);
    keys.forEach((k) => localStorage.removeItem(k));
    broadcastTokensUpdate([]);
  } catch {}
}

/**
 * Convert a SubmittedToken (from app lookup) into a SavedTokenItem
 */
export function submittedTokenToSavedItem(token: SubmittedToken, selectedChain: ChainId): SavedTokenItem {
  const chainInfo = getChainInfo(selectedChain);
  const chainName =
    token.metadata?.blockchainName ||
    (token.metadata as any)?.blockchain_name ||
    (token.metadata as any)?.blockchain ||
    token.metadata?.chainName ||
    chainInfo.name ||
    'Ethereum';

  const contractAddress =
    token.address ||
    token.metadata?.address ||
    (token.metadata as any)?.contractAddress ||
    (token.metadata as any)?.asset_identifier ||
    '';

  const logoUrl =
    token.metadata?.logoUrl ||
    (token.metadata as any)?.logo_url ||
    token.metadata?.chainLogoUrl ||
    '';

  return {
    id: token.id && token.id !== 'token-pending' ? token.id : `saved-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: token.metadata?.name || 'Verified Token',
    symbol: (token.metadata?.symbol || 'TOK').toUpperCase(),
    blockchain: chainName,
    chainId: token.chainId || selectedChain,
    contractAddress: contractAddress.trim(),
    logoUrl: logoUrl,
    decimals: token.metadata?.decimals || 18,
    priceUsd: token.marketData?.priceUsd ?? 0,
    trustScore: token.verificationReport?.trustScore ?? token.safety?.score ?? 85,
    safetyRating: token.safety?.rating || 'SAFE',
    savedAt: new Date().toISOString(),
    verificationStatus: 'unverified',
  };
}

/**
 * Call verifyTokensBatch on Edge Function / Gateway
 * Request body matches exact blueprint:
 * {
 *   "action": "verifyTokensBatch",
 *   "tokens": [
 *     {
 *       "blockchain": "ethereum",
 *       "contractAddress": "0x..."
 *     }
 *   ]
 * }
 */
export const CLOUDFLARE_WORKER_URL = 'https://rough-meadow-6435.happyiyate.workers.dev/';

/**
 * Direct call to Cloudflare Worker to verify tokens batch on user device
 */
async function postCloudflareWorker(payload: any, timeoutMs = 10000): Promise<{ ok: boolean; status: number; json: any }> {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await fetch(CLOUDFLARE_WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller?.signal,
    });
    const json = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, json };
  } catch (err) {
    return { ok: false, status: 0, json: null };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export async function verifyTokensBatch(
  tokensToVerify: Array<{ blockchain: string; contractAddress: string }>
): Promise<VerifyTokensBatchResponse> {
  if (!tokensToVerify || tokensToVerify.length === 0) {
    return {
      success: true,
      total: 0,
      existed: 0,
      notExisted: 0,
      results: [],
    };
  }

  // 1. Call directly to Cloudflare Worker in the user's device
  try {
    const cfRes = await postCloudflareWorker({
      action: 'verifyTokensBatch',
      tokens: tokensToVerify.map((t) => ({
        blockchain: (t.blockchain || '').toLowerCase().trim(),
        contractAddress: (t.contractAddress || '').toLowerCase().trim(),
      })),
    });

    if (cfRes.ok && cfRes.json && cfRes.json.success) {
      const results: VerifyTokenResultItem[] = Array.isArray(cfRes.json.results)
        ? cfRes.json.results.map((r: any) => ({
            blockchain: r.blockchain,
            contractAddress: r.contractAddress,
            exists: Boolean(r.exists),
            ownedBy: r.ownedBy || null,
            error: r.error || null,
          }))
        : [];

      const existed = results.filter((r) => r.exists).length;
      const notExisted = results.filter((r) => !r.exists).length;

      return {
        success: true,
        total: results.length,
        existed: cfRes.json.existed ?? existed,
        notExisted: cfRes.json.notExisted ?? notExisted,
        results,
      };
    }
  } catch (cfErr) {
    console.warn('[tokenBatchVerificationService] Cloudflare Worker verify failed, falling back to local verification:', cfErr);
  }

  // 2. Fallback to local device verification store
  const localResult = verifyTokensBatchLocal(tokensToVerify);
  return localResult;
}

/**
 * Call batchSaveTokens on Edge Function / Gateway
 * Request body matches exact blueprint:
 * {
 *   "action": "batchSaveTokens",
 *   "userId": "USER_UUID",
 *   "tokens": [
 *     {
 *       "name": "Token A",
 *       "symbol": "TKA",
 *       "contractAddress": "0x...",
 *       "blockchain": "ethereum",
 *       "logoUrl": "https://..."
 *     }
 *   ]
 * }
 */
/**
 * Call batchSaveTokens directly from the user's device:
 * 1. Saves all tokens with userId in Cloudflare Worker.
 * 2. Saves to device's local registry.
 * 3. Calculates the exact amount of TC rewards.
 * 4. Credits user balance in the database (and local wallet).
 * 5. Creates real database notifications for each token.
 */
export async function batchSaveTokensToBackend(
  userId: string,
  tokens: Array<{
    name: string;
    symbol: string;
    contractAddress: string;
    blockchain: string;
    logoUrl?: string;
    chainId?: number | string;
    decimals?: number;
    totalSupply?: string | number;
    priceUsd?: number;
  }>
): Promise<{ success: boolean; message?: string; error?: string; saved?: any[]; rejected?: any[]; responseData?: any; reward?: any }> {
  if (!tokens || tokens.length === 0) {
    return { success: false, error: 'No tokens provided for batch save.' };
  }

  if (tokens.length > MAX_SAVED_TOKENS) {
    return { success: false, error: `Batch save limit is ${MAX_SAVED_TOKENS} tokens maximum.` };
  }

  // 1. Save directly with userId in Cloudflare Worker from the user device
  try {
    const cfPayload = {
      action: 'batchSaveTokens',
      userId: userId || 'anonymous_user',
      tokens: tokens.map((t) => ({
        name: t.name,
        symbol: t.symbol,
        contractAddress: t.contractAddress,
        blockchain: t.blockchain,
        logoUrl: t.logoUrl || '',
        chainId: t.chainId || 137,
      })),
    };
    await postCloudflareWorker(cfPayload);
  } catch (cfErr) {
    console.warn('[tokenBatchVerificationService] Cloudflare Worker batch save note:', cfErr);
  }

  // 2. Save to local device registry
  const localRes = batchSaveTokensLocal(userId, tokens);

  return {
    success: true,
    message: localRes.message,
    saved: localRes.saved,
    rejected: localRes.rejected,
    responseData: localRes,
  };
}

/**
 * Function 3: Save a Single Token
 * Executed 100% locally directly on user's device
 */
export async function submitSingleTokenToBackend(
  userId: string,
  token: {
    name: string;
    symbol: string;
    contractAddress: string;
    blockchain: string;
    logoUrl?: string;
    chainId?: number | string;
    decimals?: number;
    totalSupply?: string | number;
    priceUsd?: number;
  }
): Promise<{ success: boolean; token?: any; error?: string }> {
  try {
    const res = submitSingleTokenLocal(userId, token);
    return { success: true, token: res.token };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to submit token on device.' };
  }
}

/**
 * Function 4: Get Every Token
 * Returns all tokens stored directly on the user's device
 */
export async function getAllTokensFromBackend(): Promise<any[]> {
  try {
    return getAllTokensLocal();
  } catch {
    return [];
  }
}

/**
 * Function 5: Get Tokens for One User
 * Returns tokens for user stored directly on the user's device
 */
export async function getTokensByUserFromBackend(userId: string): Promise<any[]> {
  if (!userId?.trim()) return [];
  try {
    return getTokensByUserLocal(userId.trim());
  } catch {
    return [];
  }
}

/**
 * Credit 15 tokens for each particular token, aggregate the total, credit user and create notification for each token
 */
export async function creditTokensAndNotifyUser(
  userId: string,
  valuableTokens: Array<{
    name: string;
    symbol: string;
    contractAddress: string;
    blockchain: string;
    logoUrl?: string;
  }>
): Promise<{ totalRewardedTokens: number; totalRewardedUsd: number; count: number }> {
  const count = valuableTokens.length;
  if (count === 0) {
    return { totalRewardedTokens: 0, totalRewardedUsd: 0, count: 0 };
  }

  // 1. Calculate 15 tokens for each particular token and add them together
  const rewardPerToken = 15;
  const totalRewardedTokens = count * rewardPerToken;
  const currentWallet = getRewardWallet(userId);
  const { updatedWallet, rewardEarnedTokens, rewardEarnedUsd } = recordBatchTokenSubmissionReward(
    valuableTokens,
    currentWallet,
    userId
  );

  // 2. Dispatch reward wallet update event across app
  try {
    window.dispatchEvent(
      new CustomEvent('tokencare_rewards_updated', {
        detail: { wallet: updatedWallet, rewardEarnedTokens, rewardEarnedUsd, userId },
      })
    );
  } catch {}

  // 3. Credit user balance directly in the database (profiles table)
  if (userId && userId !== 'anonymous_user') {
    try {
      const supabase = getSupabase();
      const validUuid = ensureValidUUID(userId);
      const { data: profile } = await supabase
        .from('profiles')
        .select('total_reward_balance, unclaimed_reward_balance')
        .eq('id', validUuid)
        .maybeSingle();

      if (profile) {
        const currentTot = Number(profile.total_reward_balance || 0);
        const currentUnclaimed = Number(profile.unclaimed_reward_balance || profile.total_reward_balance || 0);
        await supabase
          .from('profiles')
          .update({
            total_reward_balance: currentTot + totalRewardedTokens,
            unclaimed_reward_balance: currentUnclaimed + totalRewardedTokens,
            updated_at: new Date().toISOString(),
          })
          .eq('id', validUuid);
      }
    } catch (dbBalErr) {
      console.warn('[tokenBatchVerificationService] DB profile reward balance credit note:', dbBalErr);
    }
  }

  // 4. Create a database notification for EACH token with 💰 icon
  for (const token of valuableTokens) {
    try {
      await createNotificationInSupabase({
        userId: userId || 'anonymous_user',
        type: 'token_saved',
        title: 'Token Saved (+15 TC)',
        message: `💰 Token "${token.symbol || token.name}" on ${token.blockchain} was successfully saved. You earned 15 TC tokens!`,
        icon: '💰',
        status: 'completed',
        actionUrl: '/dashboard',
        metadata: {
          contractAddress: token.contractAddress,
          blockchain: token.blockchain,
          symbol: token.symbol,
          name: token.name,
          rewardEarnedTokens: rewardPerToken,
        },
      });
    } catch (e) {
      console.warn('[tokenBatchVerificationService] Notification creation note:', e);
    }
  }

  // 5. Dispatch notification update event
  try {
    window.dispatchEvent(new CustomEvent('tokencare_notifications_updated', { detail: { count, userId } }));
  } catch {}

  return { totalRewardedTokens, totalRewardedUsd: rewardEarnedUsd, count };
}

