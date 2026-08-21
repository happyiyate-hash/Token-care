import { ChainId } from '../types';
import { RAW_EVM_CHAINS } from './chains';

export type TokenChainType = 'evm' | 'solana' | 'tron' | 'ton' | 'other';

export interface TokenChainDefinition {
  id: ChainId;
  name: string;
  symbol: string;
  type: TokenChainType;
  chainId?: number;
  supported: boolean;
  tokenStandard: string;
  trustWalletKey?: string;
  dexScreenerChain?: string;
  coingeckoPlatform?: string;
  logoUrl?: string;
  note?: string;
}

/**
 * TokenCare's single chain registry for manual token selection.
 *
 * EVM networks come from the existing chain registry. Non-EVM networks are
 * explicitly declared here so the selector can distinguish between an exact
 * supported token network and a known-but-not-yet-supported network.
 *
 * Trust Wallet's public asset repository covers many more ecosystems. We do
 * not mark a chain as supported merely because Trust Wallet has assets for it;
 * it must have a TokenCare token handler/provider path first.
 */
export const TOKEN_CHAINS: TokenChainDefinition[] = [
  ...Object.entries(RAW_EVM_CHAINS).map(([id, chain]) => ({
    id,
    name: chain.name,
    symbol: chain.symbol,
    type: 'evm' as const,
    chainId: chain.chainId,
    supported: true,
    tokenStandard: 'ERC-20 / EVM token',
    dexScreenerChain: chain.dexScreenerChain,
    coingeckoPlatform: chain.coingeckoPlatform,
    trustWalletKey: id === '56' ? 'smartchain' : undefined,
  })),

  {
    id: 'solana',
    name: 'Solana',
    symbol: 'SOL',
    type: 'solana',
    supported: true,
    tokenStandard: 'SPL / Token-2022',
    trustWalletKey: 'solana',
    dexScreenerChain: 'solana',
    coingeckoPlatform: 'solana',
    logoUrl: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/info/logo.png',
  },
  {
    id: 'tron',
    name: 'TRON',
    symbol: 'TRX',
    type: 'tron',
    supported: false,
    tokenStandard: 'TRC-10 / TRC-20',
    trustWalletKey: 'tron',
    dexScreenerChain: 'tron',
    logoUrl: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/tron/info/logo.png',
    note: 'Known token network; TokenCare token verification handler is not enabled yet.',
  },
  {
    id: 'ton',
    name: 'TON',
    symbol: 'TON',
    type: 'ton',
    supported: false,
    tokenStandard: 'Jetton',
    trustWalletKey: 'ton',
    dexScreenerChain: 'ton',
    logoUrl: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ton/info/logo.png',
    note: 'Known token network; TokenCare token verification handler is not enabled yet.',
  },
];

export const TOKEN_CHAIN_BY_ID: Record<string, TokenChainDefinition> = Object.fromEntries(
  TOKEN_CHAINS.map((chain) => [String(chain.id).toLowerCase(), chain])
);

export function getTokenChain(id: ChainId | string): TokenChainDefinition | undefined {
  return TOKEN_CHAIN_BY_ID[String(id).toLowerCase()];
}

export function getTokenChainsForSelector(): TokenChainDefinition[] {
  return [...TOKEN_CHAINS].sort((a, b) => a.name.localeCompare(b.name));
}
