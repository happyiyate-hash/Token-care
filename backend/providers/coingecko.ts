export interface CoinGeckoTokenData {
  name?: string;
  symbol?: string;
  logoUrl?: string;
  priceUsd?: number;
  priceChange24h?: number;
  marketCapUsd?: number;
  circulatingSupply?: number;
  totalSupply?: number;
  maxSupply?: number;
}

export async function fetchCoinGeckoToken(
  address: string,
  platform = 'ethereum',
): Promise<CoinGeckoTokenData | null> {
  const response = await fetch(
    `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(platform)}/contract/${encodeURIComponent(address.toLowerCase())}`,
  );
  if (!response.ok) return null;

  const data = await response.json();
  const market = data.market_data;

  return {
    name: data.name,
    symbol: data.symbol?.toUpperCase(),
    logoUrl: data.image?.large || data.image?.small,
    priceUsd: market?.current_price?.usd,
    priceChange24h: market?.price_change_percentage_24h,
    marketCapUsd: market?.market_cap?.usd,
    circulatingSupply: market?.circulating_supply,
    totalSupply: market?.total_supply,
    maxSupply: market?.max_supply,
  };
}
