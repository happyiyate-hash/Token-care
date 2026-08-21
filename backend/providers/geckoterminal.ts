import { NormalizedTokenDetails } from '../types/tokenDetails';

export const CHAIN_MAP_GECKOTERMINAL: Record<string, string> = {
  '1': 'eth',
  '137': 'polygon_pos',
  '56': 'bsc',
  '42161': 'arbitrum',
  '10': 'optimism',
  '8453': 'base',
  '43114': 'avax',
  'solana': 'solana',
  'ethereum': 'eth',
  'polygon': 'polygon_pos',
};

export async function fetchGeckoTerminalToken(
  chain: string,
  contractAddress: string
): Promise<NormalizedTokenDetails | null> {
  const cleanAddr = contractAddress.trim().toLowerCase();
  if (!cleanAddr) return null;

  try {
    const network = CHAIN_MAP_GECKOTERMINAL[chain.toLowerCase()] || 'eth';
    const url = `https://api.geckoterminal.com/api/v2/networks/${network}/tokens/${cleanAddr}`;

    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' },
    });

    if (!res.ok) return null;
    const json = await res.json();
    const data = json.data?.attributes;
    if (!data) return null;

    const isSolana = network === 'solana';

    const normalized: NormalizedTokenDetails = {
      name: data.name || 'Unknown Token',
      symbol: (data.symbol || 'TOKEN').toUpperCase(),
      decimals: Number(data.decimals) || (isSolana ? 9 : 18),
      contractAddress: cleanAddr,
      chain: chain,
      chainId: chain,
      blockchain: isSolana ? 'Solana' : 'EVM',
      assetStandard: isSolana ? 'SPL' : 'ERC20',
      logoUrl: data.image_url || undefined,
      priceUsd: Number(data.price_usd) || undefined,
      fdvUsd: Number(data.fdv_usd) || undefined,
      marketCapUsd: Number(data.market_cap_usd) || Number(data.fdv_usd) || undefined,
      volume24hUsd: Number(data.volume_usd?.h24) || 0,
      totalSupply: data.total_supply,
      resolvedVia: 'geckoterminal',
    };

    return normalized;
  } catch (err) {
    console.error('[GeckoTerminal Provider Error]:', err);
    return null;
  }
}
