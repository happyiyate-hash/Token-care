import {
  isSolanaAddress,
  isTronAddress,
  isTonAddress,
  isXrplAddress,
} from '../constants/chains';

export interface DetectedChain {
  blockchain: string;
  chainId: string;
  name: string;
  tokenStandard: string;
  source: 'address-format' | 'dexscreener';
}

const EVM_CHAIN_MAP: Record<string, DetectedChain> = {
  ethereum: { blockchain: 'evm', chainId: '1', name: 'Ethereum', tokenStandard: 'ERC-20', source: 'dexscreener' },
  polygon: { blockchain: 'evm', chainId: '137', name: 'Polygon', tokenStandard: 'ERC-20', source: 'dexscreener' },
  polygon_pos: { blockchain: 'evm', chainId: '137', name: 'Polygon', tokenStandard: 'ERC-20', source: 'dexscreener' },
  base: { blockchain: 'evm', chainId: '8453', name: 'Base', tokenStandard: 'ERC-20', source: 'dexscreener' },
  arbitrum: { blockchain: 'evm', chainId: '42161', name: 'Arbitrum One', tokenStandard: 'ERC-20', source: 'dexscreener' },
  optimism: { blockchain: 'evm', chainId: '10', name: 'Optimism', tokenStandard: 'ERC-20', source: 'dexscreener' },
  bsc: { blockchain: 'evm', chainId: '56', name: 'BNB Smart Chain', tokenStandard: 'BEP-20', source: 'dexscreener' },
  avalanche: { blockchain: 'evm', chainId: '43114', name: 'Avalanche', tokenStandard: 'ERC-20', source: 'dexscreener' },
  linea: { blockchain: 'evm', chainId: '59144', name: 'Linea', tokenStandard: 'ERC-20', source: 'dexscreener' },
  zksync: { blockchain: 'evm', chainId: '324', name: 'zkSync Era', tokenStandard: 'ERC-20', source: 'dexscreener' },
  scroll: { blockchain: 'evm', chainId: '534352', name: 'Scroll', tokenStandard: 'ERC-20', source: 'dexscreener' },
  fantom: { blockchain: 'evm', chainId: '250', name: 'Fantom', tokenStandard: 'ERC-20', source: 'dexscreener' },
  celo: { blockchain: 'evm', chainId: '42220', name: 'Celo', tokenStandard: 'ERC-20', source: 'dexscreener' },
  blast: { blockchain: 'evm', chainId: '81457', name: 'Blast', tokenStandard: 'ERC-20', source: 'dexscreener' },
  mantle: { blockchain: 'evm', chainId: '5000', name: 'Mantle', tokenStandard: 'ERC-20', source: 'dexscreener' },
  sonic: { blockchain: 'evm', chainId: '146', name: 'Sonic', tokenStandard: 'ERC-20', source: 'dexscreener' },
  zora: { blockchain: 'evm', chainId: '7777777', name: 'Zora', tokenStandard: 'ERC-20', source: 'dexscreener' },
  monad: { blockchain: 'evm', chainId: '143', name: 'Monad', tokenStandard: 'ERC-20', source: 'dexscreener' },
  plasma: { blockchain: 'evm', chainId: '9745', name: 'Plasma', tokenStandard: 'ERC-20', source: 'dexscreener' },
};

const PROVIDER_ALIASES: Record<string, DetectedChain> = {
  solana: { blockchain: 'solana', chainId: 'solana', name: 'Solana', tokenStandard: 'SPL', source: 'dexscreener' },
  sol: { blockchain: 'solana', chainId: 'solana', name: 'Solana', tokenStandard: 'SPL', source: 'dexscreener' },
  metadata: { blockchain: 'solana', chainId: 'solana', name: 'Solana', tokenStandard: 'SPL', source: 'dexscreener' },
  'solana-mainnet': { blockchain: 'solana', chainId: 'solana', name: 'Solana', tokenStandard: 'SPL', source: 'dexscreener' },
  'mainnet-beta': { blockchain: 'solana', chainId: 'solana', name: 'Solana', tokenStandard: 'SPL', source: 'dexscreener' },
  tron: { blockchain: 'tron', chainId: 'tron', name: 'TRON', tokenStandard: 'TRC-20', source: 'dexscreener' },
  trx: { blockchain: 'tron', chainId: 'tron', name: 'TRON', tokenStandard: 'TRC-20', source: 'dexscreener' },
  ton: { blockchain: 'ton', chainId: 'ton', name: 'TON', tokenStandard: 'Jetton', source: 'dexscreener' },
  'ton-network': { blockchain: 'ton', chainId: 'ton', name: 'TON', tokenStandard: 'Jetton', source: 'dexscreener' },
  xrpl: { blockchain: 'xrpl', chainId: 'xrpl', name: 'XRP Ledger', tokenStandard: 'Issued Asset', source: 'dexscreener' },
  xrp: { blockchain: 'xrpl', chainId: 'xrpl', name: 'XRP Ledger', tokenStandard: 'Issued Asset', source: 'dexscreener' },
  ripple: { blockchain: 'xrpl', chainId: 'xrpl', name: 'XRP Ledger', tokenStandard: 'Issued Asset', source: 'dexscreener' },
  ...EVM_CHAIN_MAP,
};

function normalizeProviderChain(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/[\s_]+/g, '-');
}

export function detectChainFromAddressFormat(address: string): DetectedChain | null {
  const value = address.trim();
  if (!value) return null;
  if (isTonAddress(value)) return PROVIDER_ALIASES.ton;
  if (isXrplAddress(value)) return PROVIDER_ALIASES.xrpl;
  if (isTronAddress(value)) return PROVIDER_ALIASES.tron;
  if (isSolanaAddress(value)) return PROVIDER_ALIASES.solana;
  return null;
}

/**
 * Detects the exact network without defaulting an unknown address to Polygon.
 * Provider chain labels are normalized, including the observed `metadata` label
 * used for Solana token metadata responses.
 */
export async function detectTokenBlockchain(address: string): Promise<DetectedChain | null> {
  const clean = address.trim();
  const byFormat = detectChainFromAddressFormat(clean);
  if (byFormat) return byFormat;

  if (!/^0x[a-fA-F0-9]{40}$/.test(clean)) return null;

  try {
    const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(clean)}`);
    if (!response.ok) return null;
    const data = await response.json();
    const pairs = Array.isArray(data?.pairs) ? data.pairs : [];
    if (!pairs.length) return null;

    const pair = [...pairs].sort((a, b) => Number(b?.liquidity?.usd || 0) - Number(a?.liquidity?.usd || 0))[0];
    const chainKey = normalizeProviderChain(pair?.chainId);
    const resolved = PROVIDER_ALIASES[chainKey];
    if (resolved) return resolved;

    // Some providers expose a numeric EVM chain id instead of a DexScreener name.
    const numeric = String(pair?.chainId ?? '').trim();
    const numericMap: Record<string, DetectedChain> = {
      '1': EVM_CHAIN_MAP.ethereum,
      '10': EVM_CHAIN_MAP.optimism,
      '56': EVM_CHAIN_MAP.bsc,
      '137': EVM_CHAIN_MAP.polygon,
      '250': EVM_CHAIN_MAP.fantom,
      '324': EVM_CHAIN_MAP.zksync,
      '8453': EVM_CHAIN_MAP.base,
      '42161': EVM_CHAIN_MAP.arbitrum,
      '43114': EVM_CHAIN_MAP.avalanche,
      '42220': EVM_CHAIN_MAP.celo,
      '59144': EVM_CHAIN_MAP.linea,
      '5000': EVM_CHAIN_MAP.mantle,
      '534352': EVM_CHAIN_MAP.scroll,
      '81457': EVM_CHAIN_MAP.blast,
      '7777777': EVM_CHAIN_MAP.zora,
      '146': EVM_CHAIN_MAP.sonic,
      '143': EVM_CHAIN_MAP.monad,
      '9745': EVM_CHAIN_MAP.plasma,
    };
    return numericMap[numeric] || null;
  } catch {
    return null;
  }
}

export function chainIdToSelectorId(chainId: string): string {
  return chainId === 'solana-mainnet' ? 'solana' : chainId;
}
