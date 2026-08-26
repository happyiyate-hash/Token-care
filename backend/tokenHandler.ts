/**
 * Unified Token Backend Handler
 * Handles token directory actions plus the provider-backed scan/verify gateway.
 */

import { BACKEND_CONFIG } from './config';
import { globalTokenStore } from './tokenStore';
import { handleTokenScanAction, handleTokenVerifyAction } from './token/scan/gateway';

export interface TokenBackendRequest {
  action?: string;
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
  source?: 'local_store' | 'upstream_vercel' | 'upstream_cloudflare';
  [key: string]: any;
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
  const action = body.action || 'getAllTokens';

  // Provider-backed token intelligence. These actions intentionally return only
  // the normalized TokenCare result; provider availability/aggregation stays internal.
  if (action === 'scan') return await handleTokenScanAction(body) as any;
  if (action === 'verify') return await handleTokenVerifyAction(body) as any;

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
