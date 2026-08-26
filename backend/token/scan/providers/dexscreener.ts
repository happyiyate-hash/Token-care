import { getJson, numberOrNull } from '../http';
import { ProviderResult, TokenScanInput } from '../types';

export async function fetchDexScreener(input: TokenScanInput): Promise<ProviderResult> {
  const chain = String(input.blockchain || '').toLowerCase();
  if (!chain || !input.address) return { provider: 'dexscreener', available: false };

  const url = `https://api.dexscreener.com/token-pairs/v1/${encodeURIComponent(chain)}/${encodeURIComponent(input.address)}`;
  const pairs = await getJson<any[]>(url);
  if (!Array.isArray(pairs) || pairs.length === 0) return { provider: 'dexscreener', available: false };

  const sorted = [...pairs].sort((a, b) => (Number(b?.liquidity?.usd) || 0) - (Number(a?.liquidity?.usd) || 0));
  const first = sorted[0] || {};
  const base = first.baseToken || {};
  const tx = first.txns?.h24 || {};

  return {
    provider: 'dexscreener',
    available: true,
    data: {
      name: base.name || null,
      symbol: base.symbol || null,
      price_usd: first.priceUsd ?? null,
      price_change_24h_pct: numberOrNull(first.priceChange?.h24),
      liquidity_usd: numberOrNull(first.liquidity?.usd),
      volume_24h_usd: numberOrNull(first.volume?.h24),
      market_cap: numberOrNull(first.marketCap),
      fdv: numberOrNull(first.fdv),
      pairs_count: pairs.length,
      buys_24h: numberOrNull(tx.buys),
      sells_24h: numberOrNull(tx.sells),
      dexes: [...new Set(pairs.map((p) => p?.dexId).filter(Boolean))],
      pair_url: first.url || null,
      logo_url: first.info?.imageUrl || null,
      raw: pairs,
    },
  };
}
