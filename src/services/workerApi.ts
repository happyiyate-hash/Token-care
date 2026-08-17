/**
 * TokenCare backend client.
 * All token data requests go through the dedicated Vercel backend.
 */

export const TOKENCARE_BACKEND_URL = 'https://token-care-mwv9.vercel.app';

async function postBackend(path: string, payload: Record<string, any>): Promise<any> {
  const response = await fetch(`${TOKENCARE_BACKEND_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  let data: any;
  try {
    data = await response.json();
  } catch {
    data = await response.text();
  }

  if (!response.ok) {
    return {
      success: false,
      error: data?.message || data?.error || `Backend request failed (${response.status})`,
      raw: data,
    };
  }

  return data?.data || data;
}

/** Fetch full token metadata/market data by contract address and chain. */
export async function getTokenDetailsFromWorker(
  chain: string,
  contractAddress: string
): Promise<{ success: boolean; token?: any; raw?: any; error?: string }> {
  const payload = {
    chain: (chain || 'ethereum').toLowerCase(),
    contractAddress: (contractAddress || '').trim().toLowerCase(),
  };

  try {
    const result = await postBackend('/api/token/details', payload);
    return {
      success: result?.success !== false,
      token: result?.token || result,
      raw: result,
    };
  } catch (error: any) {
    return { success: false, error: error?.message || 'Token details backend request failed.' };
  }
}

/** Fetch live token price through the Vercel backend. */
export async function getTokenPriceFromWorker(
  chain: string,
  contractAddress: string
): Promise<{ success: boolean; chain?: string; contractAddress?: string; priceUsd?: number; change24h?: number; updatedAt?: string; raw?: any; error?: string }> {
  const payload = {
    chain: (chain || 'ethereum').toLowerCase(),
    contractAddress: (contractAddress || '').trim().toLowerCase(),
  };

  try {
    const result = await postBackend('/api/token/price', payload);
    return {
      success: result?.success !== false,
      chain: result?.chain,
      contractAddress: result?.contractAddress,
      priceUsd: result?.priceUsd,
      change24h: result?.priceChange24h,
      updatedAt: result?.timestamp ? new Date(result.timestamp * 1000).toISOString() : undefined,
      raw: result,
      error: result?.error,
    };
  } catch (error: any) {
    return { success: false, error: error?.message || 'Token price backend request failed.' };
  }
}

/** Batch token prices through the Vercel backend. */
export async function getTokenPricesBatchFromWorker(
  tokens: Array<{ chain: string; contractAddress: string }>
): Promise<{ success: boolean; prices?: any[]; raw?: any; error?: string }> {
  try {
    const result = await postBackend('/api/tokens/prices', {
      tokens: (tokens || []).map((t) => ({
        chain: (t.chain || 'ethereum').toLowerCase(),
        contractAddress: (t.contractAddress || '').trim().toLowerCase(),
      })),
    });

    return {
      success: result?.success !== false,
      prices: result?.results || result?.prices || [],
      raw: result,
      error: result?.error,
    };
  } catch (error: any) {
    return { success: false, error: error?.message || 'Batch price backend request failed.' };
  }
}

/**
 * Token inspection currently uses the Vercel token-details endpoint.
 * The backend's configured provider router supplies metadata and market data
 * from DexScreener, CoinGecko, GeckoTerminal and EVM RPC.
 */
export async function inspectTokenFromWorker(
  chain: string,
  contractAddress: string
): Promise<{ success: boolean; chain?: string; contractAddress?: string; inspection?: any; raw?: any; error?: string }> {
  try {
    const result = await postBackend('/api/token/details', {
      chain: (chain || 'ethereum').toLowerCase(),
      contractAddress: (contractAddress || '').trim().toLowerCase(),
    });

    return {
      success: result?.success !== false,
      chain: result?.chain,
      contractAddress: result?.contractAddress,
      inspection: result,
      raw: result,
      error: result?.error,
    };
  } catch (error: any) {
    return { success: false, error: error?.message || 'Token inspection backend request failed.' };
  }
}

/**
 * Compatibility helper retained for existing callers.
 * The old Cloudflare Worker action proxy has been removed; callers now use
 * explicit Vercel backend endpoints.
 */
export async function executeWorkerGenericAction(payload: Record<string, any>): Promise<any> {
  switch (payload?.action) {
    case 'getTokenDetails':
      return getTokenDetailsFromWorker(payload.chain, payload.contractAddress);
    case 'getTokenPrice':
      return getTokenPriceFromWorker(payload.chain, payload.contractAddress);
    case 'getTokenPrices':
      return getTokenPricesBatchFromWorker(payload.tokens || []);
    case 'inspectToken':
      return inspectTokenFromWorker(payload.chain, payload.contractAddress);
    default:
      return {
        success: false,
        error: `Unsupported backend action: ${String(payload?.action || 'unknown')}`,
      };
  }
}

export interface WorkerTokenPayload {
  name: string;
  symbol: string;
  contractAddress: string;
  logoUrl?: string;
  verified?: boolean;
}

export interface WorkerTokenLookupResult {
  exists: boolean;
  token?: WorkerTokenPayload | null;
  raw?: any;
  error?: string;
}

/** Resolve a token by address through the Vercel token-details endpoint. */
export async function getTokenByAddressFromWorker(
  blockchain: string,
  contractAddress: string
): Promise<WorkerTokenLookupResult> {
  if (!contractAddress || !contractAddress.trim()) return { exists: false };

  try {
    const result = await postBackend('/api/token/details', {
      chain: (blockchain || 'polygon').trim().toLowerCase(),
      contractAddress: contractAddress.trim().toLowerCase(),
    });

    const token = result?.token || result;
    const exists = !!(
      result?.success !== false &&
      (token?.contractAddress || token?.address || result?.found !== false)
    );

    return {
      exists,
      token: token || null,
      raw: result,
      error: result?.error,
    };
  } catch (error: any) {
    return { exists: false, error: error?.message || 'Token lookup backend request failed.' };
  }
}

/**
 * The Vercel backend currently exposes token lookup/price/batch/chart APIs,
 * not a global token-directory endpoint. Keep this function explicit so the
 * Developer Console cannot silently call the removed Cloudflare Worker.
 */
export async function getAllTokensFromWorker(
  _page: number = 1,
  _limit: number = 100
): Promise<{ success: boolean; tokens?: any[]; raw?: any; error?: string }> {
  return {
    success: false,
    tokens: [],
    error: 'The Vercel backend does not currently expose a global get-all-tokens endpoint.',
  };
}

/**
 * Token uploads are intentionally disabled here because the dedicated Vercel
 * backend currently exposes read/price/chart APIs only; no Cloudflare fallback
 * is used anymore.
 */
export async function uploadTokensToWorker(
  _tokens: WorkerTokenPayload[],
  _blockchain: string = 'polygon'
): Promise<{ success: boolean; result?: any; error?: string }> {
  return {
    success: false,
    error: 'Token upload is not exposed by the current Vercel backend.',
  };
}
