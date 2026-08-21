export interface EvmChainConfig {
  name: string;
  symbol: string;
  chainId: number;
  publicRpcs: string[];
  explorer: string;
  dexScreenerChain: string;
  geckoTerminalChain: string;
  coingeckoPlatform: string;
}

export const EVM_CHAINS: Record<string, EvmChainConfig> = {
  '1': {
    name: 'Ethereum',
    symbol: 'ETH',
    chainId: 1,
    publicRpcs: [
      'https://cloudflare-eth.com',
      'https://rpc.ankr.com/eth',
      'https://eth.llamarpc.com',
    ],
    explorer: 'https://etherscan.io',
    dexScreenerChain: 'ethereum',
    geckoTerminalChain: 'eth',
    coingeckoPlatform: 'ethereum',
  },
  '137': {
    name: 'Polygon',
    symbol: 'POL',
    chainId: 137,
    publicRpcs: [
      'https://polygon-rpc.com',
      'https://rpc.ankr.com/polygon',
      'https://polygon.llamarpc.com',
    ],
    explorer: 'https://polygonscan.com',
    dexScreenerChain: 'polygon',
    geckoTerminalChain: 'polygon_pos',
    coingeckoPlatform: 'polygon-pos',
  },
  '8453': {
    name: 'Base',
    symbol: 'ETH',
    chainId: 8453,
    publicRpcs: [
      'https://mainnet.base.org',
      'https://base.llamarpc.com',
      'https://rpc.ankr.com/base',
    ],
    explorer: 'https://basescan.org',
    dexScreenerChain: 'base',
    geckoTerminalChain: 'base',
    coingeckoPlatform: 'base',
  },
  '56': {
    name: 'BNB Smart Chain',
    symbol: 'BNB',
    chainId: 56,
    publicRpcs: [
      'https://bsc-dataseed.binance.org',
      'https://rpc.ankr.com/bsc',
      'https://binance.llamarpc.com',
    ],
    explorer: 'https://bscscan.com',
    dexScreenerChain: 'bsc',
    geckoTerminalChain: 'bsc',
    coingeckoPlatform: 'binance-smart-chain',
  },
  '42161': {
    name: 'Arbitrum One',
    symbol: 'ETH',
    chainId: 42161,
    publicRpcs: [
      'https://arb1.arbitrum.io/rpc',
      'https://arbitrum.llamarpc.com',
      'https://rpc.ankr.com/arbitrum',
    ],
    explorer: 'https://arbiscan.io',
    dexScreenerChain: 'arbitrum',
    geckoTerminalChain: 'arbitrum',
    coingeckoPlatform: 'arbitrum-one',
  },
  '10': {
    name: 'Optimism',
    symbol: 'ETH',
    chainId: 10,
    publicRpcs: [
      'https://mainnet.optimism.io',
      'https://optimism.llamarpc.com',
      'https://rpc.ankr.com/optimism',
    ],
    explorer: 'https://optimistic.etherscan.io',
    dexScreenerChain: 'optimism',
    geckoTerminalChain: 'optimism',
    coingeckoPlatform: 'optimistic-ethereum',
  },
  '43114': {
    name: 'Avalanche C-Chain',
    symbol: 'AVAX',
    chainId: 43114,
    publicRpcs: [
      'https://api.avax.network/ext/bc/C/rpc',
      'https://avalanche.llamarpc.com',
      'https://rpc.ankr.com/avalanche',
    ],
    explorer: 'https://snowtrace.io',
    dexScreenerChain: 'avalanche',
    geckoTerminalChain: 'avax',
    coingeckoPlatform: 'avalanche',
  },
  '59144': {
    name: 'Linea',
    symbol: 'ETH',
    chainId: 59144,
    publicRpcs: [
      'https://rpc.linea.build',
      'https://linea.llamarpc.com',
    ],
    explorer: 'https://lineascan.build',
    dexScreenerChain: 'linea',
    geckoTerminalChain: 'linea',
    coingeckoPlatform: 'linea',
  },
  '81457': {
    name: 'Blast',
    symbol: 'ETH',
    chainId: 81457,
    publicRpcs: [
      'https://rpc.blast.io',
      'https://blast.llamarpc.com',
    ],
    explorer: 'https://blastscan.io',
    dexScreenerChain: 'blast',
    geckoTerminalChain: 'blast',
    coingeckoPlatform: 'blast',
  },
};

export const EVM_NAME_ALIAS_MAP: Record<string, string> = {
  ethereum: '1',
  eth: '1',
  mainnet: '1',
  polygon: '137',
  matic: '137',
  pol: '137',
  base: '8453',
  bsc: '56',
  binance: '56',
  bnb: '56',
  'binance-smart-chain': '56',
  arbitrum: '42161',
  'arbitrum-one': '42161',
  arb: '42161',
  optimism: '10',
  op: '10',
  avalanche: '43114',
  avax: '43114',
  linea: '59144',
  blast: '81457',
};

export function resolveEvmChainConfig(identifier?: string | number): EvmChainConfig {
  if (!identifier) return EVM_CHAINS['137']; // Default to Polygon
  const rawKey = String(identifier).trim().toLowerCase();
  
  if (EVM_CHAINS[rawKey]) {
    return EVM_CHAINS[rawKey];
  }
  
  const mappedId = EVM_NAME_ALIAS_MAP[rawKey];
  if (mappedId && EVM_CHAINS[mappedId]) {
    return EVM_CHAINS[mappedId];
  }

  // Dynamic fallback for any EVM chain ID or custom network passed from the frontend
  const numericChainId = /^\d+$/.test(rawKey) ? parseInt(rawKey, 10) : 137;
  return {
    name: isNaN(numericChainId) ? rawKey.toUpperCase() : `EVM Chain ${numericChainId}`,
    symbol: 'ETH',
    chainId: numericChainId,
    publicRpcs: [
      `https://rpc.ankr.com/${rawKey}`,
      `https://${rawKey}.rpc.thirdweb.com`,
      `https://1rpc.io/${rawKey}`,
      'https://polygon-rpc.com',
    ],
    explorer: 'https://etherscan.io',
    dexScreenerChain: rawKey,
    geckoTerminalChain: rawKey,
    coingeckoPlatform: rawKey,
  };
}
