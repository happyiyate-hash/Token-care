/** Token data gateway. Reads go directly from the Cloudflare Worker. */

import { getChainInfo } from '../constants/chains';
import { resolveChainLogo } from './chainLogos';
import { removeLocalSavedToken } from './tokenBatchVerificationService';
import { batchSaveTokensLocal, readLocalTokens, normalizeTokenKey } from './localTokenStore';
import { getSupabase, ensureValidUUID, createNotificationInSupabase } from '../lib/supabase';

export const CLOUDFLARE_TOKEN_WORKER_URL =
  'https://rough-meadow-6435.happyiyate.workers.dev/';

export const VERCEL_TOKEN_GATEWAY_URL = CLOUDFLARE_TOKEN_WORKER_URL;
export const VERCEL_SAVE_TOKEN_URL = CLOUDFLARE_TOKEN_WORKER_URL;
export const LOCAL_TOKEN_GATEWAY_URL = CLOUDFLARE_TOKEN_WORKER_URL;
export const LOCAL_PROXY_GATEWAY_URL = CLOUDFLARE_TOKEN_WORKER_URL;
export const LOCAL_PROXY_SAVE_URL = CLOUDFLARE_TOKEN_WORKER_URL;

export interface BackendTokenItem {
  blockchain: string;
  blockchainSymbol: string;
  chainId: number;
  contractAddress: string;
  tokenName: string;
  tokenSymbol: string;
  logoUrl: string;
}

export interface BackendSavePayload { userId: string; tokens: BackendTokenItem[]; }

export interface SaveTokenBackendResponse {
  success: boolean;
  partial?: boolean;
  message?: string;
  error?: string;
  saved?: any[];
  rejected?: any[];
  reward?: { amount: number; symbol: string; credited?: boolean; [key: string]: unknown };
  notification?: any;
  offlineSaved?: boolean;
  [key: string]: unknown;
}

export function formatTokenForBackend(token: any, fallbackChainId?: string | number): BackendTokenItem {
  const chainIdInput = token.chainId ?? token.metadata?.chainId ?? fallbackChainId ?? '137';
  const chainMeta = getChainInfo(String(chainIdInput));
  const chainNetwork = resolveChainLogo(
    token.blockchain ?? token.metadata?.blockchainName ?? chainMeta.name,
    String(chainIdInput)
  );
  const blockchain = token.blockchain || token.metadata?.blockchainName || token.metadata?.chainName || chainMeta.name || chainNetwork.name || 'Polygon';
  const blockchainSymbol = token.blockchainSymbol || token.metadata?.chainSymbol || chainMeta.symbol || chainNetwork.symbol || 'MATIC';
  let numericChainId = Number(token.chainId ?? chainMeta.id ?? chainIdInput ?? chainNetwork.id ?? 137);
  if (!Number.isFinite(numericChainId) || numericChainId <= 0) numericChainId = 137;
  const contractAddress = String(token.contractAddress ?? token.address ?? token.id ?? token.metadata?.address ?? '').trim();
  const tokenName = token.tokenName || token.name || token.metadata?.name || 'Unknown Token';
  const tokenSymbol = String(token.tokenSymbol || token.symbol || token.metadata?.symbol || 'TOK').toUpperCase();
  const logoUrl = token.logoUrl || token.metadata?.logoUrl || '';
  return { blockchain, blockchainSymbol, chainId: numericChainId, contractAddress, tokenName, tokenSymbol, logoUrl };
}

async function postCloudflare(payload: any, timeoutMs = 8000): Promise<{ status: number; ok: boolean; json: any }> {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await fetch(CLOUDFLARE_TOKEN_WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller?.signal,
    });
    const json = await res.json().catch(() => null);
    return { status: res.status, ok: res.ok, json };
  } catch {
    return {
      status: 0,
      ok: false,
      json: { success: false, error: 'OFFLINE_MODE', message: 'Cloudflare token service unreachable.' },
    };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export async function fetchExploreTokensFromBackend(): Promise<any[]> {
  const result = await postCloudflare({ action: 'getAllTokens' });
  if (!result.ok) return [];
  return Array.isArray(result.json?.tokens) ? result.json.tokens : [];
}

export async function fetchTokensByUserFromBackend(userId: string): Promise<any[]> {
  const normalizedUserId = userId?.trim();
  if (!normalizedUserId) return [];

  const result = await postCloudflare({ action: 'getTokensByUser', userId: normalizedUserId });
  if (!result.ok) return [];
  return Array.isArray(result.json?.tokens) ? result.json.tokens : [];
}

/**
 * Direct device save boundary.
 * Runs directly on the user's device:
 * 1. Cloudflare is written directly from the user's device with the user's ID.
 * 2. TC reward is calculated (15 TC per newly saved token).
 * 3. User balance is credited in the database.
 * 4. A database notification is created in Supabase with icon 💰.
 */
export async function saveTokensToBackend(userId: string, tokens: any[]): Promise<SaveTokenBackendResponse> {
  if (!tokens?.length) return { success: false, message: 'No tokens provided to save.' };

  const formattedTokens = tokens.map((t) => formatTokenForBackend(t));

  // Saving requires a verified logo.
  const missingLogo = formattedTokens.find((t) => !t.logoUrl.trim());
  if (missingLogo) {
    return { success: false, error: 'VERIFIED_LOGO_REQUIRED', message: 'A verified token logo is required before saving.' };
  }

  try {
    // 1. Save directly to Cloudflare Worker with userId
    const cfPayload = {
      action: 'batchSaveTokens',
      userId: userId || 'anonymous_user',
      tokens: formattedTokens.map((t) => ({
        name: t.tokenName,
        symbol: t.tokenSymbol,
        contractAddress: t.contractAddress,
        blockchain: t.blockchain,
        chainId: t.chainId,
        logoUrl: t.logoUrl,
        verified: true,
      })),
    };
    await postCloudflare(cfPayload);

    // 2. Save into local device store
    const localRes = batchSaveTokensLocal(
      userId,
      formattedTokens.map((t) => ({
        name: t.tokenName,
        symbol: t.tokenSymbol,
        contractAddress: t.contractAddress,
        blockchain: t.blockchain,
        chainId: t.chainId,
        logoUrl: t.logoUrl,
      }))
    );
    const saved = localRes.saved;
    const rejected = localRes.rejected;

    // 3. Calculate exact TC reward (15 TC per token)
    const newlySavedCount = saved.length;
    const rewardAmount = newlySavedCount * 15;

    // 4. Credit balance in database and create real database notification
    if (newlySavedCount > 0 && userId && userId !== 'anonymous_user') {
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
              total_reward_balance: currentTot + rewardAmount,
              unclaimed_reward_balance: currentUnclaimed + rewardAmount,
              updated_at: new Date().toISOString(),
            })
            .eq('id', validUuid);
        }

        // Create database notification for each newly saved token with 💰 icon
        for (const t of saved) {
          await createNotificationInSupabase({
            userId,
            type: 'token_saved',
            title: 'Token Saved (+15 TC)',
            message: `💰 Token "${t.symbol || t.name}" on ${t.blockchain} was successfully saved. You earned 15 TC tokens!`,
            icon: '💰',
            status: 'completed',
            actionUrl: '/dashboard',
            metadata: {
              contractAddress: t.contractAddress,
              blockchain: t.blockchain,
              symbol: t.symbol,
              name: t.name,
              rewardEarnedTokens: 15,
            },
          });
        }
      } catch (dbErr) {
        console.warn('[vercelTokenBackend] Database profile update or notification note:', dbErr);
      }
    }

    return {
      success: true,
      message: rewardAmount > 0 ? `Token saved. You received ${rewardAmount} TC.` : 'Token saved.',
      saved,
      rejected,
      reward: {
        amount: rewardAmount,
        symbol: 'TC',
        credited: rewardAmount > 0,
      },
    };
  } catch (error: any) {
    for (const token of formattedTokens) {
      removeLocalSavedToken(token.contractAddress, token.blockchain, userId);
    }
    throw error;
  }
}
