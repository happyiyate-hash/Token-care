import { BACKEND_CONFIG } from './config';

type Asset = {
  type: 'token' | 'blockchain';
  contract_address?: string;
  contractAddress?: string;
  blockchain?: string;
  chain_id?: string | number;
  chainId?: string | number;
  name?: string;
  symbol?: string;
};

const MAX_BATCH = 30;
const CREDIT_COST = 1;

const NATIVE_ASSETS: Record<string, { chain: string; name: string; symbol: string; coingeckoId: string }> = {
  '1': { chain: 'ethereum', name: 'Ethereum', symbol: 'ETH', coingeckoId: 'ethereum' },
  ethereum: { chain: 'ethereum', name: 'Ethereum', symbol: 'ETH', coingeckoId: 'ethereum' },
  bitcoin: { chain: 'bitcoin', name: 'Bitcoin', symbol: 'BTC', coingeckoId: 'bitcoin' },
  btc: { chain: 'bitcoin', name: 'Bitcoin', symbol: 'BTC', coingeckoId: 'bitcoin' },
  solana: { chain: 'solana', name: 'Solana', symbol: 'SOL', coingeckoId: 'solana' },
  '137': { chain: 'polygon', name: 'Polygon', symbol: 'POL', coingeckoId: 'polygon-ecosystem-token' },
  polygon: { chain: 'polygon', name: 'Polygon', symbol: 'POL', coingeckoId: 'polygon-ecosystem-token' },
  '56': { chain: 'bnb', name: 'BNB', symbol: 'BNB', coingeckoId: 'binancecoin' },
  bnb: { chain: 'bnb', name: 'BNB', symbol: 'BNB', coingeckoId: 'binancecoin' },
  '43114': { chain: 'avalanche', name: 'Avalanche', symbol: 'AVAX', coingeckoId: 'avalanche-2' },
  avalanche: { chain: 'avalanche', name: 'Avalanche', symbol: 'AVAX', coingeckoId: 'avalanche-2' },
  '42161': { chain: 'arbitrum', name: 'Arbitrum', symbol: 'ETH', coingeckoId: 'ethereum' },
  arbitrum: { chain: 'arbitrum', name: 'Arbitrum', symbol: 'ETH', coingeckoId: 'ethereum' },
  '8453': { chain: 'base', name: 'Base', symbol: 'ETH', coingeckoId: 'ethereum' },
  base: { chain: 'base', name: 'Base', symbol: 'ETH', coingeckoId: 'ethereum' },
  '10': { chain: 'optimism', name: 'Optimism', symbol: 'ETH', coingeckoId: 'ethereum' },
  optimism: { chain: 'optimism', name: 'Optimism', symbol: 'ETH', coingeckoId: 'ethereum' },
};

function normalizeChain(value: unknown) {
  const raw = String(value ?? '').trim().toLowerCase();
  const aliases: Record<string, string> = { eth: 'ethereum', matic: 'polygon', bsc: 'bnb', binance: 'bnb', sol: 'solana', avax: 'avalanche' };
  return aliases[raw] || raw;
}

function timeoutSignal() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.min(BACKEND_CONFIG.requestTimeoutMs, 10000));
  return { controller, timeout };
}

function normalizeAssets(body: any): Asset[] {
  if (Array.isArray(body?.assets)) return body.assets;
  if (body?.asset && typeof body.asset === 'object') return [body.asset];
  if (Array.isArray(body?.tokens)) return body.tokens.map((item: any) => ({ ...item, type: 'token' }));
  if (body?.contract_address || body?.contractAddress || body?.address) return [{ ...body, type: 'token' }];
  if (body?.type === 'blockchain' || (body?.blockchain && (body?.chain_id != null || body?.chainId != null))) return [{ ...body, type: 'blockchain' }];
  return [];
}

function validateNative(asset: Asset) {
  const chainId = String(asset.chain_id ?? asset.chainId ?? '').trim();
  const chain = normalizeChain(asset.blockchain);
  const byId = NATIVE_ASSETS[chainId];
  const byChain = NATIVE_ASSETS[chain];
  const resolved = byId || byChain;
  if (!resolved) return { error: 'UNSUPPORTED_BLOCKCHAIN' as const };
  if (byId && byChain && byId.chain !== byChain.chain) return { error: 'CHAIN_MISMATCH' as const };
  if (!chainId || !asset.name?.trim() || !asset.symbol?.trim()) return { error: 'BLOCKCHAIN_IDENTIFICATION_REQUIRED' as const };
  if (asset.name.trim().toLowerCase() !== resolved.name.toLowerCase() || asset.symbol.trim().toUpperCase() !== resolved.symbol) return { error: 'BLOCKCHAIN_IDENTIFICATION_MISMATCH' as const };
  return { value: resolved, chainId };
}

async function getTokenResults(tokens: Asset[]) {
  const addresses = tokens.map((asset) => String(asset.contract_address ?? asset.contractAddress ?? '').trim()).filter(Boolean);
  if (!addresses.length) return new Map<string, any>();
  const { controller, timeout } = timeoutSignal();
  try {
    const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(addresses.join(','))}`, { headers: { Accept: 'application/json' }, signal: controller.signal });
    if (!response.ok) throw new Error(`DexScreener HTTP ${response.status}`);
    const payload = await response.json();
    const pairs = Array.isArray(payload?.pairs) ? payload.pairs : [];
    const result = new Map<string, any>();
    for (const asset of tokens) {
      const address = String(asset.contract_address ?? asset.contractAddress ?? '').trim().toLowerCase();
      const chain = normalizeChain(asset.blockchain);
      const pair = pairs.filter((p: any) => {
        const base = String(p?.baseToken?.address ?? '').toLowerCase();
        const quote = String(p?.quoteToken?.address ?? '').toLowerCase();
        return (base === address || quote === address) && (!chain || normalizeChain(p?.chainId) === chain);
      }).sort((a: any, b: any) => Number(b?.liquidity?.usd ?? 0) - Number(a?.liquidity?.usd ?? 0))[0];
      result.set(address, pair ? {
        found: true,
        name: pair.baseToken?.name ?? null,
        symbol: pair.baseToken?.symbol ?? null,
        price_usd: pair.priceUsd == null ? null : Number(pair.priceUsd),
        price_change_24h_pct: pair.priceChange?.h24 == null ? null : Number(pair.priceChange.h24),
      } : { found: false, price_usd: null, price_change_24h_pct: null });
    }
    return result;
  } finally { clearTimeout(timeout); }
}

async function getNativeResults(ids: string[]) {
  const unique = [...new Set(ids)];
  if (!unique.length) return {} as Record<string, any>;
  const { controller, timeout } = timeoutSignal();
  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(unique.join(','))}&vs_currencies=usd&include_24hr_change=true`;
    const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
    if (!response.ok) throw new Error(`CoinGecko HTTP ${response.status}`);
    return await response.json();
  } finally { clearTimeout(timeout); }
}

export async function handlePriceRequest(body: any) {
  const assets = normalizeAssets(body);
  if (!assets.length) return { success: false, error: 'ASSETS_REQUIRED', message: 'Provide asset or assets.' };
  if (assets.length > MAX_BATCH) return { success: false, error: 'BATCH_LIMIT_EXCEEDED', message: `A price request supports at most ${MAX_BATCH} assets.` };

  const tokenAssets = assets.filter((asset) => asset.type === 'token');
  const nativeChecks = assets.filter((asset) => asset.type === 'blockchain').map((asset) => ({ asset, resolved: validateNative(asset) }));
  const invalid = nativeChecks.find((item) => 'error' in item.resolved);
  if (invalid) return { success: false, error: invalid.resolved.error, message: 'Blockchain assets require an exact supported chain_id, name and symbol.' };
  if (tokenAssets.some((asset) => !String(asset.contract_address ?? asset.contractAddress ?? '').trim())) return { success: false, error: 'CONTRACT_ADDRESS_REQUIRED', message: 'Each token asset requires contract_address.' };

  try {
    const tokenResults = await getTokenResults(tokenAssets);
    const nativeData = await getNativeResults(nativeChecks.map((item: any) => item.resolved.value.coingeckoId));
    const results = assets.map((asset) => {
      if (asset.type === 'token') {
        const address = String(asset.contract_address ?? asset.contractAddress).trim();
        const data = tokenResults.get(address.toLowerCase()) || { found: false, price_usd: null, price_change_24h_pct: null };
        return { type: 'token', contract_address: address, blockchain: normalizeChain(asset.blockchain) || null, chain_id: asset.chain_id ?? asset.chainId ?? null, ...data };
      }
      const check: any = nativeChecks.find((item) => item.asset === asset);
      const native = check.resolved.value;
      const data = nativeData[native.coingeckoId] || {};
      return { type: 'blockchain', blockchain: native.chain, chain_id: check.resolved.chainId, name: native.name, symbol: native.symbol, found: data.usd != null, price_usd: data.usd ?? null, price_change_24h_pct: data.usd_24h_change ?? null };
    });
    return { success: true, service: 'token', action: 'price', credit_cost: CREDIT_COST, data: { type: results.length === 1 ? results[0].type : 'batch', count: results.length, assets: results }, source: 'price_providers' };
  } catch (error: any) {
    const timedOut = error?.name === 'AbortError';
    return { success: false, error: timedOut ? 'PRICE_PROVIDER_TIMEOUT' : 'PRICE_PROVIDER_FAILED', message: timedOut ? 'Price provider request timed out.' : 'Unable to fetch asset prices.' };
  }
}
