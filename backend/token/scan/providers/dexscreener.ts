import { getJson, numberOrNull } from '../http';
import { ProviderResult, TokenScanInput } from '../types';

export async function fetchDexScreener(input: TokenScanInput): Promise<ProviderResult> {
  const chain = String(input.blockchain || '').toLowerCase();
  if (!chain || !input.address) return { provider: 'dexscreener', available: false };
  const pairs = await getJson<any[]>(`https://api.dexscreener.com/token-pairs/v1/${encodeURIComponent(chain)}/${encodeURIComponent(input.address)}`);
  if (!Array.isArray(pairs) || pairs.length === 0) {
    const query = input.name || input.symbol;
    if (query) return fetchDexScreenerByQuery(query, chain);
    return { provider: 'dexscreener', available: false };
  }
  return normalizePairs(pairs);
}

export async function fetchDexScreenerByQuery(query: string, preferredChain?: string): Promise<ProviderResult> {
  const result = await getJson<any>(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(query)}`);
  const pairs = Array.isArray(result?.pairs) ? result.pairs : [];
  const filtered = preferredChain ? pairs.filter((p: any) => String(p?.chainId || '').toLowerCase() === preferredChain.toLowerCase()) : pairs;
  const usable = filtered.length ? filtered : pairs;
  if (!usable.length) return { provider: 'dexscreener', available: false };
  return normalizePairs(usable);
}

function normalizePairs(pairs: any[]): ProviderResult {
  const sorted = [...pairs].sort((a, b) => (Number(b?.liquidity?.usd) || 0) - (Number(a?.liquidity?.usd) || 0));
  const first = sorted[0] || {};
  const base = first.baseToken || {};
  const tx = first.txns?.h24 || {};
  return {
    provider: 'dexscreener', available: true,
    data: {
      name: base.name || null, symbol: base.symbol || null, price_usd: first.priceUsd ?? null,
      price_change_24h_pct: numberOrNull(first.priceChange?.h24), liquidity_usd: numberOrNull(first.liquidity?.usd),
      volume_24h_usd: numberOrNull(first.volume?.h24), market_cap: numberOrNull(first.marketCap), fdv: numberOrNull(first.fdv),
      pairs_count: pairs.length, buys_24h: numberOrNull(tx.buys), sells_24h: numberOrNull(tx.sells),
      dexes: [...new Set(pairs.map((p) => p?.dexId).filter(Boolean))], pair_url: first.url || null,
      logo_url: first.info?.imageUrl || null, raw: pairs,
    },
  };
}
