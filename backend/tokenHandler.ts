/**
 * Unified Token Backend Handler
 * Handles token directory actions plus provider-backed scan/verify and lightweight price requests.
 */

import { BACKEND_CONFIG } from './config';
import { globalTokenStore } from './tokenStore';
import { handleTokenScanAction, handleTokenVerifyAction } from './token/scan/gateway';

export interface TokenBackendRequest {
  action?: string;
  service?: string;
  key?: string;
  userId?: string;
  tokens?: any[];
  token?: any;
  blockchain?: string;
  contractAddress?: string;
  page?: number;
  limit?: number;
  [key: string]: any;
}

export interface TokenBackendResponse {
  success: boolean;
  message?: string;
  error?: string;
  tokens?: any[];
  token?: any;
  count?: number;
  userId?: string;
  saved?: any[];
  rejected?: any[];
  reward?: { amount: number; symbol: string; credited: boolean };
  notification?: { id: string; title: string; message: string; type: string; timestamp: string };
  source?: 'local_store' | 'upstream_vercel' | 'upstream_cloudflare' | 'dexscreener';
  [key: string]: any;
}

type PriceRequestToken = {
  contractAddress: string;
  blockchain?: string;
};

const PRICE_BATCH_MAX_TOKENS = 30;
const PRICE_BATCH_CREDIT_COST = 1;

function normalizePriceToken(value: any): PriceRequestToken | null {
  const contractAddress = String(
    value?.contractAddress ?? value?.contract_address ?? value?.address ?? value?.tokenAddress ?? '',
  ).trim();

  if (!contractAddress) return null;

  const blockchain = String(
    value?.blockchain ?? value?.chain ?? value?.chainId ?? '',
  ).trim().toLowerCase() || undefined;

  return { contractAddress, blockchain };
}

function normalizeChain(chain: unknown): string | undefined {
  const value = String(chain ?? '').trim().toLowerCase();
  if (!value) return undefined;

  const aliases: Record<string, string> = {
    eth: 'ethereum',
    ethereum: 'ethereum',
    polygon: 'polygon',
    matic: 'polygon',
    bsc: 'bsc',
    binance: 'bsc',
    sol: 'solana',
    solana: 'solana',
    arbitrum: 'arbitrum',
    base: 'base',
    optimism: 'optimism',
    avalanche: 'avalanche',
    avax: 'avalanche',
  };

  return aliases[value] || value;
}

function pickBestPair(pairs: any[], token: PriceRequestToken) {
  const address = token.contractAddress.toLowerCase();
  const chain = normalizeChain(token.blockchain);

  const matching = pairs.filter((pair) => {
    const pairChain = normalizeChain(pair?.chainId);
    const baseAddress = String(pair?.baseToken?.address || '').toLowerCase();
    const quoteAddress = String(pair?.quoteToken?.address || '').toLowerCase();
    const addressMatches = baseAddress === address || quoteAddress === address;
    return addressMatches && (!chain || pairChain === chain);
  });

  return matching.sort((a, b) => {
    const aLiquidity = Number(a?.liquidity?.usd || 0);
    const bLiquidity = Number(b?.liquidity?.usd || 0);
    return bLiquidity - aLiquidity;
  })[0] || null;
}

async function getSimpleTokenPrices(input: PriceRequestToken[]) {
  const unique = new Map<string, PriceRequestToken>();

  for (const token of input) {
    const normalized = normalizePriceToken(token);
    if (!normalized) continue;
    const key = `${normalizeChain(normalized.blockchain) || ''}:${normalized.contractAddress.toLowerCase()}`;
    unique.set(key, normalized);
  }

  const tokens = [...unique.values()];
  if (!tokens.length) {
    return { success: false, error: 'TOKENS_REQUIRED', message: 'Provide at least one token address.' };
  }

  if (tokens.length > PRICE_BATCH_MAX_TOKENS) {
    return {
      success: false,
      error: 'BATCH_LIMIT_EXCEEDED',
      message: `A price request supports at most ${PRICE_BATCH_MAX_TOKENS} tokens at once.`,
    };
  }

  const addresses = tokens.map((token) => token.contractAddress).join(',');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.min(BACKEND_CONFIG.requestTimeoutMs, 10000));

  try {
    const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(addresses)}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        success: false,
        error: 'PRICE_PROVIDER_FAILED',
        message: `Price provider returned HTTP ${response.status}.`,
      };
    }

    const payload = await response.json().catch(() => ({}));
    const pairs = Array.isArray(payload?.pairs) ? payload.pairs : [];

    const results = tokens.map((token) => {
      const pair = pickBestPair(pairs, token);
      if (!pair) {
        return {
          contract_address: token.contractAddress,
          blockchain: normalizeChain(token.blockchain) || null,
          found: false,
          price_usd: null,
          price_change_24h_pct: null,
        };
      }

      return {
        contract_address: token.contractAddress,
        blockchain: normalizeChain(pair.chainId) || normalizeChain(token.blockchain) || null,
        found: true,
        name: pair.baseToken?.name || null,
        symbol: pair.baseToken?.symbol || null,
        price_usd: pair.priceUsd == null ? null : Number(pair.priceUsd),
        price_change_24h_pct: pair.priceChange?.h24 == null ? null : Number(pair.priceChange.h24),
      };
    });

    return {
      success: true,
      service: 'token',
      action: 'price',
      credit_cost: PRICE_BATCH_CREDIT_COST,
      data: {
        type: tokens.length === 1 ? 'token' : 'batch',
        count: results.length,
        tokens: results,
      },
      source: 'dexscreener',
    };
  } catch (error: any) {
    const timedOut = error?.name === 'AbortError';
    return {
      success: false,
      error: timedOut ? 'PRICE_PROVIDER_TIMEOUT' : 'PRICE_PROVIDER_FAILED',
      message: timedOut ? 'Price provider request timed out.' : 'Unable to fetch token prices.',
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function tryForwardUpstream(payload: TokenBackendRequest): Promise<any | null> {
  if (!BACKEND_CONFIG.forwardToRemote && !BACKEND_CONFIG.vercelBackendUrl) return null;
  const targetUrl = BACKEND_CONFIG.vercelBackendUrl;
  try {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeout = setTimeout(() => controller?.abort(), BACKEND_CONFIG.requestTimeoutMs);
    const res = await fetch(targetUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: controller?.signal,
    });
    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json().catch(() => null);
      if (data && data.success !== false) return data;
    }
  } catch (err: any) {
    console.debug('[Backend Upstream Proxy] Remote call skipped/failed:', err?.message || err);
  }
  return null;
}

export async function handleTokenRequest(body: TokenBackendRequest): Promise<TokenBackendResponse> {
  const action = String(body.action || body.key || 'getAllTokens');

  // Provider-backed token intelligence. These actions intentionally return only
  // the normalized TokenCare result; provider availability/aggregation stays internal.
  if (action === 'scan') return await handleTokenScanAction(body) as any;
  if (action === 'verify') return await handleTokenVerifyAction(body) as any;

  // Lightweight price endpoint. This intentionally does not return charts,
  // supply, liquidity or other expensive market details. It supports one token
  // or a batch and is suitable for token lists and overview screens.
  if (action === 'price' || action === 'getTokenPrice' || action === 'getTokenPrices' || action === 'batchPrice') {
    const inputTokens = Array.isArray(body.tokens)
      ? body.tokens
      : body.contractAddress || body.contract_address || body.address
        ? [body]
        : [];

    return await getSimpleTokenPrices(inputTokens) as any;
  }

  if (action === 'health') {
    return {
      success: true,
      message: 'TokenCare Backend API is healthy and operational',
      service: 'tokencare-backend',
      timestamp: new Date().toISOString(),
      config: {
        forwardToRemote: BACKEND_CONFIG.forwardToRemote,
        vercelUrlConfigured: !!BACKEND_CONFIG.vercelBackendUrl,
        cloudflareUrlConfigured: !!BACKEND_CONFIG.cloudflareWorkerUrl,
      },
    };
  }

  if (action === 'getAllTokens') {
    if (BACKEND_CONFIG.forwardToRemote) {
      const remoteData = await tryForwardUpstream(body);
      if (remoteData && (remoteData.tokens || Array.isArray(remoteData))) {
        const tokens = remoteData.tokens || (Array.isArray(remoteData) ? remoteData : []);
        return { success: true, count: tokens.length, tokens, source: 'upstream_vercel' };
      }
    }
    const allTokens = globalTokenStore.getAll();
    return { success: true, count: allTokens.length, tokens: allTokens, source: 'local_store' };
  }

  if (action === 'getTokensByUser') {
    const userId = (body.userId || '').trim();
    if (!userId) return { success: true, userId: '', count: 0, tokens: [], source: 'local_store' };
    if (BACKEND_CONFIG.forwardToRemote) {
      const remoteData = await tryForwardUpstream(body);
      if (remoteData && (remoteData.tokens || Array.isArray(remoteData))) {
        const tokens = remoteData.tokens || (Array.isArray(remoteData) ? remoteData : []);
        return { success: true, userId, count: tokens.length, tokens, source: 'upstream_vercel' };
      }
    }
    const userTokens = globalTokenStore.getByUser(userId);
    return { success: true, userId, count: userTokens.length, tokens: userTokens, source: 'local_store' };
  }

  if (action === 'getTokenByAddress') {
    const { contractAddress, blockchain } = body;
    if (!contractAddress) return { success: false, error: 'contractAddress is required', message: 'Contract address is required for lookup' };
    const token = globalTokenStore.getByAddress(contractAddress, blockchain);
    return { success: !!token, found: !!token, token: token || null, source: 'local_store' };
  }

  if (action === 'verifyTokensBatch') {
    const inputTokens: Array<{ blockchain: string; contractAddress: string }> = Array.isArray(body.tokens)
      ? body.tokens
      : body.contractAddress ? [{ blockchain: body.blockchain || 'ethereum', contractAddress: body.contractAddress }] : [];
    const results = inputTokens.map((item) => {
      const targetChain = String(item.blockchain || 'ethereum').trim().toLowerCase();
      const targetAddress = String(item.contractAddress || '').trim().toLowerCase();
      const found = globalTokenStore.getByAddress(targetAddress, targetChain);
      return { blockchain: item.blockchain || 'ethereum', contractAddress: item.contractAddress, exists: !!found, ownedBy: null, error: found ? 'Token already exists' : null };
    });
    return {
      success: true, total: results.length,
      existed: results.filter((r) => r.exists).length,
      notExisted: results.filter((r) => !r.exists).length,
      results, source: 'local_store',
    };
  }

  if (action === 'saveToken' || action === 'batchSaveTokens' || action === 'save-token' || action === 'uploadTokens') {
    const userId = body.userId || (body as any).user_id || 'anonymous_user';
    let rawTokens: any[] = [];
    if (Array.isArray(body.tokens)) rawTokens = body.tokens;
    else if (body.token && typeof body.token === 'object') rawTokens = [body.token];
    else if (body.contractAddress || (body as any).address) rawTokens = [body];
    if (rawTokens.length === 0) return { success: false, error: 'No tokens provided', message: 'Please provide at least one token object in the tokens array.' };

    const normalizedTokens = rawTokens.map((t) => ({
      ...t,
      name: t.tokenName || t.name || t.symbol || 'Unknown Token',
      symbol: (t.tokenSymbol || t.symbol || 'TOK').toUpperCase(),
      contractAddress: String(t.contractAddress || t.address || t.tokenAddress || t.id || t.metadata?.address || '').trim(),
      blockchain: t.blockchain || t.chain || body.blockchain || 'Polygon',
      blockchainSymbol: t.blockchainSymbol || t.chainSymbol || 'MATIC',
      chainId: t.chainId ?? t.chain_id ?? 137,
      logoUrl: t.logoUrl || t.logo_url || t.metadata?.logoUrl || '',
    }));

    if (BACKEND_CONFIG.forwardToRemote) {
      const remoteData = await tryForwardUpstream({ ...body, tokens: normalizedTokens });
      if (remoteData && remoteData.success !== false) return { ...remoteData, source: 'upstream_vercel' };
    }

    const { saved, rejected } = globalTokenStore.saveTokens(userId, normalizedTokens);
    const isPartial = rejected.length > 0 && saved.length > 0;
    const isSuccess = saved.length > 0;
    return {
      success: isSuccess, partial: isPartial,
      message: isSuccess ? `Successfully registered ${saved.length} token(s) into the directory.` : 'Failed to save token(s).',
      saved, rejected,
      reward: isSuccess ? { amount: 50, symbol: 'CARE', credited: true } : undefined,
      notification: isSuccess ? {
        id: `notif-${Date.now()}`, title: 'Token Successfully Published',
        message: `Your token ${saved[0]?.symbol || ''} has been registered and verified for Web3 donations.`,
        type: 'token_saved', timestamp: new Date().toISOString(),
      } : undefined,
      source: 'local_store',
    };
  }

  return { success: false, error: `Unknown action: ${action}`, message: `The action "${action}" is not recognized.` };
}
