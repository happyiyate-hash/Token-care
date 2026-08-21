import { NormalizedTokenDetails } from '../types/tokenDetails';

export const CHAIN_MAP_COINGECKO: Record<string, string> = {
  '1': 'ethereum',
  '137': 'polygon-pos',
  '56': 'binance-smart-chain',
  '42161': 'arbitrum-one',
  '10': 'optimistic-ethereum',
  '8453': 'base',
  '43114': 'avalanche',
  'solana': 'solana',
  'ethereum': 'ethereum',
  'polygon': 'polygon-pos',
};

export async function fetchCoinGeckoToken(
  chain: string,
  contractAddress: string
): Promise<NormalizedTokenDetails | null> {
  const cleanAddr = contractAddress.trim().toLowerCase();
  if (!cleanAddr) return null;

  try {
    const platform = CHAIN_MAP_COINGECKO[chain.toLowerCase()] || 'ethereum';
    const url = `https://api.coingecko.com/api/v3/coins/${platform}/contract/${cleanAddr}`;

    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' },
    });

    if (!res.ok) return null;
    const data = await res.json();
    if (!data || !data.name) return null;

    const marketData = data.market_data;
    const isSolana = platform === 'solana';

    const normalized: NormalizedTokenDetails = {
      name: data.name || 'Unknown Token',
      symbol: (data.symbol || 'TOKEN').toUpperCase(),
      decimals: isSolana ? 9 : 18,
      contractAddress: cleanAddr,
      chain: chain,
      chainId: chain,
      blockchain: isSolana ? 'Solana' : 'EVM',
      assetStandard: isSolana ? 'SPL' : 'ERC20',
      logoUrl: data.image?.large || data.image?.small || undefined,
      websiteUrl: data.links?.homepage?.[0] || undefined,
      twitterUrl: data.links?.twitter_screen_name ? `https://twitter.com/${data.links.twitter_screen_name}` : undefined,
      telegramUrl: data.links?.telegram_channel_identifier ? `https://t.me/${data.links.telegram_channel_identifier}` : undefined,
      priceUsd: marketData?.current_price?.usd || undefined,
      fdvUsd: marketData?.fully_diluted_valuation?.usd || undefined,
      marketCapUsd: marketData?.market_cap?.usd || marketData?.fully_diluted_valuation?.usd || undefined,
      volume24hUsd: marketData?.total_volume?.usd || 0,
      priceChange24h: marketData?.price_change_percentage_24h || 0,
      totalSupply: marketData?.total_supply ? String(marketData.total_supply) : undefined,
      resolvedVia: 'coingecko',
    };

    return normalized;
  } catch (err) {
    console.error('[CoinGecko Provider Error]:', err);
    return null;
  }
}
