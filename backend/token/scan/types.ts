export interface TokenScanInput {
  blockchain?: string;
  blockchainId?: string | number;
  address: string;
  name?: string;
  symbol?: string;
}

export interface ProviderTokenData {
  name?: string | null;
  symbol?: string | null;
  decimals?: number | null;
  total_supply?: string | number | null;
  logo_url?: string | null;
  price_usd?: string | number | null;
  price_change_24h_pct?: number | null;
  liquidity_usd?: number | null;
  volume_24h_usd?: number | null;
  market_cap?: number | null;
  fdv?: number | null;
  pairs_count?: number | null;
  buys_24h?: number | null;
  sells_24h?: number | null;
  holders?: number | null;
  pair_url?: string | null;
  dexes?: string[];
  website?: string | null;
  description?: string | null;
  raw?: unknown;
}

export interface ProviderResult {
  provider: string;
  available: boolean;
  data?: ProviderTokenData;
}

export interface AggregatedTokenData {
  token: {
    name: string | null;
    symbol: string | null;
    decimals: number | null;
    total_supply: string | number | null;
    logo_url: string | null;
    logo_source: string | null;
  };
  market: {
    price_usd: string | number | null;
    price_change_24h_pct: number | null;
    liquidity_usd: number | null;
    volume_24h_usd: number | null;
    market_cap: number | null;
    fdv: number | null;
    pairs_count: number | null;
    buys_24h: number | null;
    sells_24h: number | null;
    dexes: string[];
    pair_url: string | null;
  };
  identity_verified: boolean;
  providerResults: ProviderResult[];
}
