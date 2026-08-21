const TRUST_WALLET_RAW = 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains';

/** Trust Wallet uses a few historical directory names that differ from chain IDs / DEX names. */
const TRUST_WALLET_KEY_OVERRIDES: Record<string, string> = {
  '56': 'smartchain',
  '43114': 'avalanchec',
  '1101': 'polygonzkevm',
  '42170': 'arbitrumnova',
  '2020': 'ronin',
  '30': 'rootstock',
  '204': 'opbnb',
  '324': 'zksync',
  '8453': 'base',
  '59144': 'linea',
  '7777777': 'zora',
  '81457': 'blast',
  '80084': 'berachain',
  '60808': 'bob',
  '7000': 'zetachain',
  '34443': 'mode',
  '480': 'worldchain',
  '1514': 'story',
  '592': 'astar',
  '146': 'sonic',
  '5000': 'mantle',
  '534352': 'scroll',
  '1329': 'sei',
};

const slugify = (value: string) => value
  .trim()
  .toLowerCase()
  .replace(/&/g, 'and')
  .replace(/[^a-z0-9]+/g, '')
  .replace(/^the/, '');

/**
 * Returns the exact Trust Wallet blockchain coin-logo path for a known chain.
 * We never fall back to Ethereum: an unknown chain gets no URL and the UI can
 * render its symbol instead of displaying the wrong blockchain logo.
 */
export function getTrustWalletChainLogoUrl(chain: {
  id?: string | number;
  chainId?: number;
  name?: string;
  trustWalletKey?: string;
  logoUrl?: string;
  dexScreenerChain?: string;
}): string | undefined {
  if (chain.logoUrl) return chain.logoUrl;

  const id = String(chain.chainId ?? chain.id ?? '').trim();
  const key = chain.trustWalletKey || TRUST_WALLET_KEY_OVERRIDES[id] || chain.dexScreenerChain || (chain.name ? slugify(chain.name) : '');
  return key ? `${TRUST_WALLET_RAW}/${key}/info/logo.png` : undefined;
}
