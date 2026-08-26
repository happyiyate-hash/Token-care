import { getJson, numberOrNull } from '../http';
import { ProviderResult, TokenScanInput } from '../types';

export async function fetchGeckoTerminal(input: TokenScanInput): Promise<ProviderResult> {
  const network = normalizeNetwork(input.blockchain);
  if (!network || !input.address) return { provider: 'geckoterminal', available: false };
  const url = `https://api.geckoterminal.com/api/v2/networks/${encodeURIComponent(network)}/tokens/${encodeURIComponent(input.address)}?include=top_pools`;
  const result = await getJson<any>(url, { headers: { Accept: 'application/json;version=20230203' } });
  const a = result?.data?.attributes;
  if (!a) return { provider: 'geckoterminal', available: false };
  return {
    provider: 'geckoterminal', available: true,
    data: {
      name: a.name || null, symbol: a.symbol || null, decimals: numberOrNull(a.decimals), total_supply: a.total_supply ?? null,
      logo_url: a.image_url || null, price_usd: a.price_usd ?? null, liquidity_usd: numberOrNull(a.total_reserve_in_usd),
      volume_24h_usd: numberOrNull(a.volume_usd?.h24), market_cap: numberOrNull(a.market_cap_usd), fdv: numberOrNull(a.fdv_usd), raw: result,
    },
  };
}

function normalizeNetwork(value?: string): string | null {
  const v = String(value || '').trim().toLowerCase();
  const map: Record<string, string> = {
    ethereum: 'eth', eth: 'eth', polygon: 'polygon_pos', 'polygon-pos': 'polygon_pos', bsc: 'bsc', 'binance-smart-chain': 'bsc',
    arbitrum: 'arbitrum', optimism: 'optimism', avalanche: 'avax', base: 'base', solana: 'solana', fantom: 'ftm', cronos: 'cronos',
  };
  return map[v] || (v || null);
}
