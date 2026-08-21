import {
  isSolanaAddress,
  isTronAddress,
  isTonAddress,
  isXrplAddress,
} from '../constants/chains';

export type ChainDetectionSource = 'address-format' | 'dexscreener' | 'geckoterminal';

export interface DetectedChain {
  blockchain: string;
  chainId: string;
  name: string;
  tokenStandard: string;
  source: ChainDetectionSource;
  confidence: 'high' | 'medium';
  supportedByTokenCare?: boolean;
}

const EVM_CHAIN_MAP: Record<string, DetectedChain> = {
  ethereum: { blockchain: 'evm', chainId: '1', name: 'Ethereum', tokenStandard: 'ERC-20', source: 'dexscreener', confidence: 'high', supportedByTokenCare: true },
  polygon: { blockchain: 'evm', chainId: '137', name: 'Polygon', tokenStandard: 'ERC-20', source: 'dexscreener', confidence: 'high', supportedByTokenCare: true },
  polygon_pos: { blockchain: 'evm', chainId: '137', name: 'Polygon', tokenStandard: 'ERC-20', source: 'dexscreener', confidence: 'high', supportedByTokenCare: true },
  base: { blockchain: 'evm', chainId: '8453', name: 'Base', tokenStandard: 'ERC-20', source: 'dexscreener', confidence: 'high', supportedByTokenCare: true },
  arbitrum: { blockchain: 'evm', chainId: '42161', name: 'Arbitrum One', tokenStandard: 'ERC-20', source: 'dexscreener', confidence: 'high', supportedByTokenCare: true },
  optimism: { blockchain: 'evm', chainId: '10', name: 'Optimism', tokenStandard: 'ERC-20', source: 'dexscreener', confidence: 'high', supportedByTokenCare: true },
  bsc: { blockchain: 'evm', chainId: '56', name: 'BNB Smart Chain', tokenStandard: 'BEP-20', source: 'dexscreener', confidence: 'high', supportedByTokenCare: true },
  avalanche: { blockchain: 'evm', chainId: '43114', name: 'Avalanche', tokenStandard: 'ERC-20', source: 'dexscreener', confidence: 'high', supportedByTokenCare: true },
  linea: { blockchain: 'evm', chainId: '59144', name: 'Linea', tokenStandard: 'ERC-20', source: 'dexscreener', confidence: 'high', supportedByTokenCare: true },
  zksync: { blockchain: 'evm', chainId: '324', name: 'zkSync Era', tokenStandard: 'ERC-20', source: 'dexscreener', confidence: 'high', supportedByTokenCare: true },
  scroll: { blockchain: 'evm', chainId: '534352', name: 'Scroll', tokenStandard: 'ERC-20', source: 'dexscreener', confidence: 'high', supportedByTokenCare: true },
  fantom: { blockchain: 'evm', chainId: '250', name: 'Fantom', tokenStandard: 'ERC-20', source: 'dexscreener', confidence: 'high', supportedByTokenCare: true },
  celo: { blockchain: 'evm', chainId: '42220', name: 'Celo', tokenStandard: 'ERC-20', source: 'dexscreener', confidence: 'high', supportedByTokenCare: true },
  blast: { blockchain: 'evm', chainId: '81457', name: 'Blast', tokenStandard: 'ERC-20', source: 'dexscreener', confidence: 'high', supportedByTokenCare: true },
  mantle: { blockchain: 'evm', chainId: '5000', name: 'Mantle', tokenStandard: 'ERC-20', source: 'dexscreener', confidence: 'high', supportedByTokenCare: true },
  sonic: { blockchain: 'evm', chainId: '146', name: 'Sonic', tokenStandard: 'ERC-20', source: 'dexscreener', confidence: 'high', supportedByTokenCare: true },
  zora: { blockchain: 'evm', chainId: '7777777', name: 'Zora', tokenStandard: 'ERC-20', source: 'dexscreener', confidence: 'high', supportedByTokenCare: true },
  monad: { blockchain: 'evm', chainId: '143', name: 'Monad', tokenStandard: 'ERC-20', source: 'dexscreener', confidence: 'high', supportedByTokenCare: true },
  plasma: { blockchain: 'evm', chainId: '9745', name: 'Plasma', tokenStandard: 'ERC-20', source: 'dexscreener', confidence: 'high', supportedByTokenCare: true },
};

const STATIC_ALIASES: Record<string, DetectedChain> = {
  solana: { blockchain: 'solana', chainId: 'solana', name: 'Solana', tokenStandard: 'SPL', source: 'address-format', confidence: 'high', supportedByTokenCare: true },
  sol: { blockchain: 'solana', chainId: 'solana', name: 'Solana', tokenStandard: 'SPL', source: 'address-format', confidence: 'high', supportedByTokenCare: true },
  metadata: { blockchain: 'solana', chainId: 'solana', name: 'Solana', tokenStandard: 'SPL', source: 'address-format', confidence: 'high', supportedByTokenCare: true },
  'solana-mainnet': { blockchain: 'solana', chainId: 'solana', name: 'Solana', tokenStandard: 'SPL', source: 'address-format', confidence: 'high', supportedByTokenCare: true },
  'mainnet-beta': { blockchain: 'solana', chainId: 'solana', name: 'Solana', tokenStandard: 'SPL', source: 'address-format', confidence: 'high', supportedByTokenCare: true },
  tron: { blockchain: 'tron', chainId: 'tron', name: 'TRON', tokenStandard: 'TRC-20', source: 'address-format', confidence: 'high' },
  trx: { blockchain: 'tron', chainId: 'tron', name: 'TRON', tokenStandard: 'TRC-20', source: 'address-format', confidence: 'high' },
  ton: { blockchain: 'ton', chainId: 'ton', name: 'TON', tokenStandard: 'Jetton', source: 'address-format', confidence: 'high' },
  'ton-network': { blockchain: 'ton', chainId: 'ton', name: 'TON', tokenStandard: 'Jetton', source: 'address-format', confidence: 'high' },
  xrpl: { blockchain: 'xrpl', chainId: 'xrpl', name: 'XRP Ledger', tokenStandard: 'Issued Asset', source: 'address-format', confidence: 'high' },
  xrp: { blockchain: 'xrpl', chainId: 'xrpl', name: 'XRP Ledger', tokenStandard: 'Issued Asset', source: 'address-format', confidence: 'high' },
  ripple: { blockchain: 'xrpl', chainId: 'xrpl', name: 'XRP Ledger', tokenStandard: 'Issued Asset', source: 'address-format', confidence: 'high' },
  ...EVM_CHAIN_MAP,
};

function normalizeProviderChain(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/[\s_]+/g, '-');
}

function humanizeChainId(chainId: string): string {
  return chainId.split('-').map(part => part ? part[0].toUpperCase() + part.slice(1) : part).join(' ');
}

function dynamicChain(chainId: string, source: ChainDetectionSource): DetectedChain {
  return {
    blockchain: chainId,
    chainId,
    name: humanizeChainId(chainId),
    tokenStandard: /^0x/i.test('0x') ? 'Unknown' : 'Unknown',
    source,
    confidence: 'high',
    supportedByTokenCare: false,
  };
}

export function detectChainFromAddressFormat(address: string): DetectedChain | null {
  const value = address.trim();
  if (!value) return null;
  if (isTonAddress(value)) return STATIC_ALIASES.ton;
  if (isXrplAddress(value)) return STATIC_ALIASES.xrpl;
  if (isTronAddress(value)) return STATIC_ALIASES.tron;
  if (isSolanaAddress(value)) return STATIC_ALIASES.solana;
  return null;
}

function resolveKnownChain(chainId: string, source: ChainDetectionSource): DetectedChain {
  const normalized = normalizeProviderChain(chainId);
  const known = STATIC_ALIASES[normalized];
  if (known) return { ...known, source };
  return dynamicChain(normalized, source);
}

async function detectWithDexScreener(address: string): Promise<DetectedChain | null> {
  try {
    const urls = [
      `https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(address)}`,
      `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(address)}`,
    ];
    for (const url of urls) {
      const response = await fetch(url);
      if (!response.ok) continue;
      const data = await response.json();
      const pairs = Array.isArray(data?.pairs) ? data.pairs : [];
      const exact = pairs.filter((pair: any) =>
        String(pair?.baseToken?.address || '').toLowerCase() === address.toLowerCase() ||
        String(pair?.quoteToken?.address || '').toLowerCase() === address.toLowerCase()
      );
      const candidates = exact.length ? exact : pairs;
      if (!candidates.length) continue;
      const pair = [...candidates].sort((a, b) => Number(b?.liquidity?.usd || 0) - Number(a?.liquidity?.usd || 0))[0];
      const chainId = String(pair?.chainId || '').trim();
      if (chainId) return resolveKnownChain(chainId, 'dexscreener');
    }
  } catch {
    // Fall through to the independent discovery provider.
  }
  return null;
}

/** GeckoTerminal global pool search is used as an independent fallback.
 * It searches across the networks indexed by GeckoTerminal instead of requiring
 * TokenCare to know the network in advance. */
async function detectWithGeckoTerminal(address: string): Promise<DetectedChain | null> {
  try {
    const response = await fetch(`https://api.geckoterminal.com/api/v2/search/pools?query=${encodeURIComponent(address)}`, {
      headers: { Accept: 'application/json;version=20230203' },
    });
    if (!response.ok) return null;
    const data = await response.json();
    const rows = Array.isArray(data?.data) ? data.data : [];
    const exact = rows.filter((row: any) => {
      const attrs = row?.attributes || {};
      const text = JSON.stringify(attrs).toLowerCase();
      return text.includes(address.toLowerCase());
    });
    const row = (exact.length ? exact : rows)[0];
    const networkId = String(row?.relationships?.network?.data?.id || '').trim();
    if (!networkId) return null;
    return resolveKnownChain(networkId, 'geckoterminal');
  } catch {
    return null;
  }
}

/**
 * ONLY identifies the blockchain. It does not verify token safety or market data.
 * Detection is deliberately independent from the hardcoded selector registry.
 * Unknown networks are returned as detected-but-unsupported instead of being
 * discarded merely because TokenCare has not added them to its selector yet.
 */
export async function detectTokenBlockchain(address: string): Promise<DetectedChain | null> {
  const clean = address.trim();
  if (!clean) return null;

  const byFormat = detectChainFromAddressFormat(clean);
  if (byFormat) return byFormat;

  // Providers can discover EVM networks that cannot be inferred from 0x alone.
  if (/^0x[a-fA-F0-9]{40}$/.test(clean)) {
    const dex = await detectWithDexScreener(clean);
    if (dex) return dex;
    const gecko = await detectWithGeckoTerminal(clean);
    if (gecko) return gecko;
  }

  // GeckoTerminal can also identify non-EVM addresses when they are indexed.
  const gecko = await detectWithGeckoTerminal(clean);
  if (gecko) return gecko;

  return null;
}

export function chainIdToSelectorId(chainId: string): string {
  return chainId === 'solana-mainnet' ? 'solana' : chainId;
}
