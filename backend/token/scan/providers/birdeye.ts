import { getJson, numberOrNull } from '../http';
import { ProviderResult, TokenScanInput } from '../types';

export async function fetchBirdeye(input: TokenScanInput): Promise<ProviderResult> {
  const key = process.env.BIRDEYE_API_KEY;
  if (!key || !input.address) return { provider: 'birdeye', available: false };
  const chain = normalizeChain(input.blockchain);
  if (!chain) return { provider: 'birdeye', available: false };

  const url = `https://public-api.birdeye.so/defi/token_overview?address=${encodeURIComponent(input.address)}`;
  const result = await getJson<any>(url, { headers: { 'X-API-KEY': key, 'x-chain': chain } });
  const d = result?.data;
  if (!d) return { provider: 'birdeye', available: false };
  return { provider: 'birdeye', available: true, data: {
    name: d.name || null, symbol: d.symbol || null, decimals: numberOrNull(d.decimals), total_supply: d.supply ?? d.totalSupply ?? null,
    logo_url: d.logoURI || d.logo || null, price_usd: d.price ?? null,
    price_change_24h_pct: numberOrNull(d.priceChange24hPercent), liquidity_usd: numberOrNull(d.liquidity),
    volume_24h_usd: numberOrNull(d.v24hUSD ?? d.volume24hUSD), market_cap: numberOrNull(d.mc ?? d.marketCap),
    fdv: numberOrNull(d.fdv), holders: numberOrNull(d.holder ?? d.holders), raw: result,
  }};
}

function normalizeChain(value?: string): string | null {
  const v = String(value || '').trim().toLowerCase();
  const map: Record<string, string> = { polygon: 'polygon', ethereum: 'ethereum', eth: 'ethereum', base: 'base', bsc: 'bsc', solana: 'solana', arbitrum: 'arbitrum', optimism: 'optimism', avalanche: 'avalanche' };
  return map[v] || null;
}
