import {
  isSolanaAddress,
  isTronAddress,
  isTonAddress,
  isXrplAddress,
  isPolkadotAddress,
} from '../constants/chains';
import { getCachedChainLogo, fetchChainLogoInBackground } from './chainLogoService';

export type ChainDetectionSource = 'address-format' | 'dexscreener' | 'geckoterminal' | 'manual' | 'unknown';

export interface DetectedChain {
  blockchain: string;
  chainId: string;
  name: string;
  tokenStandard: string;
  source: ChainDetectionSource;
  confidence: 'high' | 'medium' | 'low';
  supportedByTokenCare?: boolean;
  symbol?: string;
  logoUrl?: string;
  isUnknown?: boolean;
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
  tron: { blockchain: 'tron', chainId: 'tron', name: 'TRON', tokenStandard: 'TRC-20', source: 'address-format', confidence: 'high', supportedByTokenCare: false },
  trx: { blockchain: 'tron', chainId: 'tron', name: 'TRON', tokenStandard: 'TRC-20', source: 'address-format', confidence: 'high', supportedByTokenCare: false },
  ton: { blockchain: 'ton', chainId: 'ton', name: 'TON', tokenStandard: 'Jetton', source: 'address-format', confidence: 'high', supportedByTokenCare: false },
  'ton-network': { blockchain: 'ton', chainId: 'ton', name: 'TON', tokenStandard: 'Jetton', source: 'address-format', confidence: 'high', supportedByTokenCare: false },
  xrpl: { blockchain: 'xrpl', chainId: 'xrpl', name: 'XRP Ledger', tokenStandard: 'Issued Asset', source: 'address-format', confidence: 'high', supportedByTokenCare: false },
  xrp: { blockchain: 'xrpl', chainId: 'xrpl', name: 'XRP Ledger', tokenStandard: 'Issued Asset', source: 'address-format', confidence: 'high', supportedByTokenCare: false },
  ripple: { blockchain: 'xrpl', chainId: 'xrpl', name: 'XRP Ledger', tokenStandard: 'Issued Asset', source: 'address-format', confidence: 'high', supportedByTokenCare: false },
  polkadot: { blockchain: 'polkadot', chainId: 'polkadot', name: 'Polkadot Network', tokenStandard: 'Substrate Asset', source: 'address-format', confidence: 'high', supportedByTokenCare: false },
  dot: { blockchain: 'polkadot', chainId: 'polkadot', name: 'Polkadot Network', tokenStandard: 'Substrate Asset', source: 'address-format', confidence: 'high', supportedByTokenCare: false },
  kusama: { blockchain: 'polkadot', chainId: 'kusama', name: 'Kusama Network', tokenStandard: 'Substrate Asset', source: 'address-format', confidence: 'high', supportedByTokenCare: false },
  ksm: { blockchain: 'polkadot', chainId: 'kusama', name: 'Kusama Network', tokenStandard: 'Substrate Asset', source: 'address-format', confidence: 'high', supportedByTokenCare: false },
  ...EVM_CHAIN_MAP,
};

function normalizeProviderChain(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/[\s_]+/g, '-');
}

function unknownChain(): DetectedChain {
  return {
    blockchain: 'unknown', chainId: 'unknown', name: 'Unknown Blockchain', tokenStandard: 'Unknown',
    source: 'unknown', confidence: 'low', supportedByTokenCare: false, isUnknown: true,
  };
}

function resolveKnownChain(chainId: string, source: ChainDetectionSource, symbolCandidate?: string, logoCandidate?: string): DetectedChain {
  const normalized = normalizeProviderChain(chainId);
  const known = STATIC_ALIASES[normalized];
  if (!known) return { ...unknownChain(), source };
  const cached = getCachedChainLogo(normalized) || known.logoUrl || logoCandidate;
  if (!cached) void fetchChainLogoInBackground(normalized, known.name, known.symbol);
  return { ...known, source, logoUrl: cached, supportedByTokenCare: true, symbol: symbolCandidate || known.symbol };
}

export function detectChainFromAddressFormat(address: string): DetectedChain | null {
  const value = address.trim();
  if (!value) return null;
  if (isPolkadotAddress(value)) return STATIC_ALIASES.polkadot;
  if (isTonAddress(value)) return STATIC_ALIASES.ton;
  if (isTronAddress(value)) return STATIC_ALIASES.tron;
  if (isXrplAddress(value)) return STATIC_ALIASES.xrpl;
  if (isSolanaAddress(value)) return STATIC_ALIASES.solana;
  return null;
}

async function detectWithDexScreener(address: string): Promise<DetectedChain | null> {
  try {
    const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(address)}`);
    if (!response.ok) return null;
    const data = await response.json();
    const pairs = Array.isArray(data?.pairs) ? data.pairs : [];
    const exact = pairs.filter((pair: any) =>
      String(pair?.baseToken?.address || '').toLowerCase() === address.toLowerCase() ||
      String(pair?.quoteToken?.address || '').toLowerCase() === address.toLowerCase()
    );
    if (!exact.length) return null;
    const chains = exact
      .map((pair: any) => ({ pair, chainId: String(pair?.chainId || '').trim() }))
      .filter((x: any) => x.chainId);
    if (!chains.length) return null;
    const supported = chains
      .map((x: any) => ({ ...x, resolved: resolveKnownChain(x.chainId, 'dexscreener', x.pair?.baseToken?.symbol, x.pair?.info?.imageUrl) }))
      .filter((x: any) => !x.resolved.isUnknown);
    if (!supported.length) return null;
    const uniqueChainIds = [...new Set(supported.map((x: any) => x.resolved.chainId))];
    if (uniqueChainIds.length > 1) return null;
    const best = supported.sort((a: any, b: any) => Number(b.pair?.liquidity?.usd || 0) - Number(a.pair?.liquidity?.usd || 0))[0];
    return best.resolved;
  } catch {
    return null;
  }
}

async function detectWithGeckoTerminal(address: string): Promise<DetectedChain | null> {
  try {
    const response = await fetch(`https://api.geckoterminal.com/api/v2/search/pools?query=${encodeURIComponent(address)}`, {
      headers: { Accept: 'application/json;version=20230203' },
    });
    if (!response.ok) return null;
    const data = await response.json();
    const rows = Array.isArray(data?.data) ? data.data : [];
    const needle = address.toLowerCase();
    const exact = rows.filter((row: any) => {
      const attrs = row?.attributes || {};
      const rel = row?.relationships || {};
      const poolAddress = String(attrs?.address || '').toLowerCase();
      const baseAddress = String(rel?.base_token?.data?.id || '').toLowerCase();
      const quoteAddress = String(rel?.quote_token?.data?.id || '').toLowerCase();
      return poolAddress === needle || baseAddress.endsWith(`_${needle}`) || quoteAddress.endsWith(`_${needle}`) || baseAddress === needle || quoteAddress === needle;
    });
    if (!exact.length) return null;
    const networks = exact
      .map((row: any) => String(row?.relationships?.network?.data?.id || '').trim())
      .filter(Boolean)
      .map((id: string) => resolveKnownChain(id, 'geckoterminal'))
      .filter((chain: DetectedChain) => !chain.isUnknown);
    const unique = [...new Map(networks.map((c) => [c.chainId, c])).values()];
    return unique.length === 1 ? unique[0] : null;
  } catch {
    return null;
  }
}

export async function detectTokenBlockchain(address: string): Promise<DetectedChain> {
  const clean = address.trim();
  if (!clean) return unknownChain();
  const byFormat = detectChainFromAddressFormat(clean);
  if (byFormat) return byFormat;
  if (/^0x[a-fA-F0-9]{40}$/.test(clean)) {
    const dex = await detectWithDexScreener(clean);
    if (dex) return dex;
    const gecko = await detectWithGeckoTerminal(clean);
    if (gecko) return gecko;
    return unknownChain();
  }
  const gecko = await detectWithGeckoTerminal(clean);
  return gecko || unknownChain();
}

export function chainIdToSelectorId(chainId: string): string {
  const clean = String(chainId || '').toLowerCase().trim();
  if (['solana-mainnet', 'mainnet-beta', 'mainnet_beta', 'spl', 'sol', 'metadata'].includes(clean)) return 'solana';
  return chainId;
}
