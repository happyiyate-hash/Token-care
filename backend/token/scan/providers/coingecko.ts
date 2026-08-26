import { getJson, numberOrNull } from '../http';
import { ProviderResult, TokenScanInput } from '../types';

export async function fetchCoinGecko(input: TokenScanInput): Promise<ProviderResult> {
  const key = process.env.COINGECKO_API_KEY || process.env.COINGECKO_PRO_API_KEY;
  const platform = normalizePlatform(input.blockchain);
  if (!key || !platform || !input.address) return { provider: 'coingecko', available: false };
  const url = `https://pro-api.coingecko.com/api/v3/onchain/networks/${encodeURIComponent(platform)}/tokens/${encodeURIComponent(input.address)}`;
  const result = await getJson<any>(url, { headers: { 'x-cg-pro-api-key': key } });
  const a = result?.data?.attributes;
  if (!a) return { provider: 'coingecko', available: false };
  return { provider: 'coingecko', available: true, data: {
    name: a.name || null, symbol: a.symbol || null, decimals: numberOrNull(a.decimals), total_supply: a.total_supply ?? null,
    logo_url: a.image_url || null, price_usd: a.price_usd ?? null, liquidity_usd: numberOrNull(a.total_reserve_in_usd),
    volume_24h_usd: numberOrNull(a.volume_usd?.h24), market_cap: numberOrNull(a.market_cap_usd), fdv: numberOrNull(a.fdv_usd), raw: result,
  }};
}

function normalizePlatform(value?: string): string | null {
  const v = String(value || '').trim().toLowerCase();
  const map: Record<string, string> = { ethereum: 'eth', eth: 'eth', polygon: 'polygon_pos', bsc: 'bsc', arbitrum: 'arbitrum', optimism: 'optimism', avalanche: 'avax', base: 'base', solana: 'solana' };
  return map[v] || (v || null);
}
