import { getJson, numberOrNull } from '../http';
import { ProviderResult, TokenScanInput } from '../types';

export async function fetchCoinMarketCap(input: TokenScanInput): Promise<ProviderResult> {
  const key = process.env.COINMARKETCAP_API_KEY;
  if (!key || !input.address) return { provider: 'coinmarketcap', available: false };

  const infoUrl = `https://pro-api.coinmarketcap.com/v2/cryptocurrency/info?address=${encodeURIComponent(input.address)}`;
  const info = await getJson<any>(infoUrl, { headers: { 'X-CMC_PRO_API_KEY': key } });
  const first = info?.data ? Object.values(info.data as Record<string, any>)[0] as any : null;

  let quote: any = null;
  const symbol = first?.symbol || input.symbol;
  if (symbol) {
    const quoteUrl = `https://pro-api.coinmarketcap.com/v2/cryptocurrency/quotes/latest?symbol=${encodeURIComponent(symbol)}&convert=USD`;
    const q = await getJson<any>(quoteUrl, { headers: { 'X-CMC_PRO_API_KEY': key } });
    quote = q?.data?.[symbol]?.[0] || null;
  }

  if (!first && !quote) return { provider: 'coinmarketcap', available: false };
  return { provider: 'coinmarketcap', available: true, data: {
    name: first?.name || null, symbol: first?.symbol || null,
    logo_url: first?.logo || null,
    price_usd: quote?.quote?.USD?.price ?? null,
    price_change_24h_pct: numberOrNull(quote?.quote?.USD?.percent_change_24h),
    market_cap: numberOrNull(quote?.quote?.USD?.market_cap),
    volume_24h_usd: numberOrNull(quote?.quote?.USD?.volume_24h),
    fdv: numberOrNull(quote?.quote?.USD?.fully_diluted_market_cap),
    raw: { info, quote },
  }};
}
