export interface GeckoTerminalMarketData {
  priceUsd?: number;
  volume24h?: number;
  reserveUsd?: number;
  marketCapUsd?: number;
  fdvUsd?: number;
}

export async function fetchGeckoTerminalToken(
  network: string,
  address: string,
): Promise<GeckoTerminalMarketData | null> {
  const response = await fetch(
    `https://api.geckoterminal.com/api/v2/networks/${encodeURIComponent(network)}/tokens/${encodeURIComponent(address)}`,
  );
  if (!response.ok) return null;

  const body = await response.json();
  const attributes = body?.data?.attributes;
  if (!attributes) return null;

  return {
    priceUsd: Number(attributes.price_usd) || undefined,
    volume24h: Number(attributes.volume_usd?.h24) || undefined,
    reserveUsd: Number(attributes.total_reserve_in_usd) || undefined,
    marketCapUsd: Number(attributes.market_cap_usd) || undefined,
    fdvUsd: Number(attributes.fdv_usd) || undefined,
  };
}
