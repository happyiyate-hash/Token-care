export interface DexScreenerPair {
  chainId?: string;
  dexId?: string;
  url?: string;
  pairAddress?: string;
  baseToken?: { address?: string; name?: string; symbol?: string };
  priceNative?: string;
  priceUsd?: string;
  priceChange?: { h24?: number };
  volume?: { h24?: number };
  liquidity?: { usd?: number };
  fdv?: number;
  marketCap?: number;
  info?: { imageUrl?: string; header?: string };
}

export interface DexScreenerResponse {
  pairs?: DexScreenerPair[];
}

export async function fetchDexScreenerToken(address: string): Promise<DexScreenerResponse | null> {
  const response = await fetch(
    `https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(address)}`,
  );
  if (!response.ok) return null;
  return response.json() as Promise<DexScreenerResponse>;
}

export function selectBestPair(pairs: DexScreenerPair[], chain?: string): DexScreenerPair | null {
  const filtered = chain
    ? pairs.filter((pair) => (pair.chainId || '').toLowerCase() === chain.toLowerCase())
    : pairs;

  return [...(filtered.length ? filtered : pairs)].sort(
    (a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0),
  )[0] || null;
}
