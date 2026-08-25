/**
 * Unified Token Backend Handler
 * Handles getAllTokens, getTokensByUser, getTokenByAddress, and saveToken
 * with optional upstream proxying to Vercel/Cloudflare.
 */

import { BACKEND_CONFIG } from './config';
import { globalTokenStore, TokenRecord } from './tokenStore';

export interface TokenBackendRequest {
  action?: 'getAllTokens' | 'getTokensByUser' | 'getTokenByAddress' | 'saveToken' | 'health' | string;
  userId?: string;
  tokens?: any[];
  blockchain?: string;
  contractAddress?: string;
  page?: number;
  limit?: number;
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
  reward?: {
    amount: number;
    symbol: string;
    credited: boolean;
  };
  notification?: {
    id: string;
    title: string;
    message: string;
    type: string;
    timestamp: string;
  };
  source?: 'local_store' | 'upstream_vercel' | 'upstream_cloudflare';
  [key: string]: any;
}

/**
 * Forward request to upstream Vercel or Cloudflare endpoint if configured
 */
async function tryForwardUpstream(payload: TokenBackendRequest): Promise<any | null> {
  if (!BACKEND_CONFIG.forwardToRemote && !BACKEND_CONFIG.vercelBackendUrl) {
    return null;
  }

  const targetUrl = BACKEND_CONFIG.vercelBackendUrl;
  try {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeout = setTimeout(() => controller?.abort(), BACKEND_CONFIG.requestTimeoutMs);

    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller?.signal,
    });

    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json().catch(() => null);
      if (data && data.success !== false) {
        return data;
      }
    }
  } catch (err: any) {
    console.debug('[Backend Upstream Proxy] Remote call skipped/failed, using local handler:', err?.message || err);
  }

  return null;
}

/**
 * Main Token Backend Dispatcher
 */
export async function handleTokenRequest(body: TokenBackendRequest): Promise<TokenBackendResponse> {
  const action = body.action || 'getAllTokens';

  // 1. Health check
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

  // 2. Action: getAllTokens (Explore Directory)
  if (action === 'getAllTokens') {
    // If configured to proxy, try remote first
    if (BACKEND_CONFIG.forwardToRemote) {
      const remoteData = await tryForwardUpstream(body);
      if (remoteData && (remoteData.tokens || Array.isArray(remoteData))) {
        const tokens = remoteData.tokens || (Array.isArray(remoteData) ? remoteData : []);
        return {
          success: true,
          count: tokens.length,
          tokens,
          source: 'upstream_vercel',
        };
      }
    }

    // Return from local store
    const allTokens = globalTokenStore.getAll();
    return {
      success: true,
      count: allTokens.length,
      tokens: allTokens,
      source: 'local_store',
    };
  }

  // 3. Action: getTokensByUser (Tokens / Portfolio Page)
  if (action === 'getTokensByUser') {
    const userId = (body.userId || '').trim();
    if (!userId) {
      return {
        success: true,
        userId: '',
        count: 0,
        tokens: [],
        source: 'local_store',
      };
    }

    if (BACKEND_CONFIG.forwardToRemote) {
      const remoteData = await tryForwardUpstream(body);
      if (remoteData && (remoteData.tokens || Array.isArray(remoteData))) {
        const tokens = remoteData.tokens || (Array.isArray(remoteData) ? remoteData : []);
        return {
          success: true,
          userId,
          count: tokens.length,
          tokens,
          source: 'upstream_vercel',
        };
      }
    }

    const userTokens = globalTokenStore.getByUser(userId);
    return {
      success: true,
      userId,
      count: userTokens.length,
      tokens: userTokens,
      source: 'local_store',
    };
  }

  // 4. Action: getTokenByAddress (Quick Lookup / Validation)
  if (action === 'getTokenByAddress') {
    const { contractAddress, blockchain } = body;
    if (!contractAddress) {
      return {
        success: false,
        error: 'contractAddress is required',
        message: 'Contract address is required for lookup',
      };
    }

    const token = globalTokenStore.getByAddress(contractAddress, blockchain);
    return {
      success: !!token,
      found: !!token,
      token: token || null,
      source: 'local_store',
    };
  }

  // 5. Action: saveToken / save-token (Donation Setup & Campaign Submission)
  if (action === 'saveToken' || action === 'save-token') {
    const userId = body.userId || 'anonymous_user';
    const rawTokens = Array.isArray(body.tokens) ? body.tokens : [];

    if (rawTokens.length === 0) {
      return {
        success: false,
        error: 'No tokens provided',
        message: 'Please provide at least one token object in the tokens array.',
      };
    }

    // Try remote if enabled
    if (BACKEND_CONFIG.forwardToRemote) {
      const remoteData = await tryForwardUpstream(body);
      if (remoteData && remoteData.success !== false) {
        return {
          ...remoteData,
          source: 'upstream_vercel',
        };
      }
    }

    // Save to local store
    const { saved, rejected } = globalTokenStore.saveTokens(userId, rawTokens);

    const isPartial = rejected.length > 0 && saved.length > 0;
    const isSuccess = saved.length > 0;

    return {
      success: isSuccess,
      partial: isPartial,
      message: isSuccess
        ? `Successfully registered ${saved.length} token(s) into the directory.`
        : 'Failed to save token(s).',
      saved,
      rejected,
      reward: isSuccess
        ? {
            amount: 50,
            symbol: 'CARE',
            credited: true,
          }
        : undefined,
      notification: isSuccess
        ? {
            id: `notif-${Date.now()}`,
            title: 'Token Successfully Published',
            message: `Your token ${saved[0]?.symbol || ''} has been registered and verified for Web3 donations.`,
            type: 'token_saved',
            timestamp: new Date().toISOString(),
          }
        : undefined,
      source: 'local_store',
    };
  }

  return {
    success: false,
    error: `Unknown action: ${action}`,
    message: `The action "${action}" is not recognized. Supported actions: getAllTokens, getTokensByUser, getTokenByAddress, saveToken, health.`,
  };
}
