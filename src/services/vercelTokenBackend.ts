/** Token data gateway. Reads go directly from the Cloudflare Worker. */

import { getChainInfo } from '../constants/chains';
import { resolveChainLogo } from './chainLogos';

export const CLOUDFLARE_TOKEN_WORKER_URL =
  'https://rough-meadow-6435.happyiyate.workers.dev/';

// Kept as aliases so existing imports continue to compile while the app
// transitions away from the old Vercel/local token gateway naming.
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

  const result = await postCloudflare({
    action: 'getTokensByUser',
    userId: normalizedUserId,
  });
  if (!result.ok) return [];
  return Array.isArray(result.json?.tokens) ? result.json.tokens : [];
}

export async function saveTokensToBackend(userId: string, tokens: any[]): Promise<SaveTokenBackendResponse> {
  if (!tokens?.length) return { success: false, message: 'No tokens provided to save.' };

  const formattedTokens = tokens.map((t) => formatTokenForBackend(t));
  const result = await postCloudflare({
    action: 'batchSaveTokens',
    userId,
    tokens: formattedTokens.map((t) => ({
      name: t.tokenName,
      symbol: t.tokenSymbol,
      contractAddress: t.contractAddress,
      blockchain: t.blockchain,
      chainId: t.chainId,
      logoUrl: t.logoUrl,
    })),
  });

  if (!result.ok || result.json?.success === false) {
    return {
      success: false,
      message: result.json?.message || 'Cloudflare token service failed.',
      error: result.json?.error,
      ...result.json,
    };
  }

  return {
    success: true,
    message: result.json?.message || 'Tokens saved to Cloudflare.',
    saved: result.json?.saved,
    rejected: result.json?.rejected,
    ...result.json,
  };
}
