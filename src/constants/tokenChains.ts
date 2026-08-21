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

const TRUST_WALLET_RAW = 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains';

const twLogo = (key: string) => `${TRUST_WALLET_RAW}/${key}/info/logo.png`;

/**
 * Known blockchain ecosystems exposed by the TokenCare manual selector.
 *
 * This is deliberately a local registry: opening the selector does not make a
 * network request. Trust Wallet's public asset repository is used only as the
 * stable source for the blockchain logo URLs. Trust Wallet documents roughly
 * 188 blockchain directories in its current assets repository.
 *
 * `supported` means TokenCare currently has a real token-data path for the
 * network. A chain being present here does NOT imply that TokenCare can yet
 * verify/donate on it. Unsupported networks remain visible so a user can
 * explicitly identify the chain instead of the app guessing incorrectly.
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

  // Currently supported non-EVM token network.
  {
    id: 'solana', name: 'Solana', symbol: 'SOL', type: 'solana', supported: true,
    tokenStandard: 'SPL / Token-2022', trustWalletKey: 'solana',
    dexScreenerChain: 'solana', coingeckoPlatform: 'solana', logoUrl: twLogo('solana'),
  },

  // Known token ecosystems. These are visible for manual identification but
  // remain disabled until their TokenCare token handlers are implemented.
  { id: 'tron', name: 'TRON', symbol: 'TRX', type: 'tron', supported: false, tokenStandard: 'TRC-10 / TRC-20', trustWalletKey: 'tron', logoUrl: twLogo('tron') },
  { id: 'ton', name: 'TON', symbol: 'TON', type: 'ton', supported: false, tokenStandard: 'Jetton', trustWalletKey: 'ton', logoUrl: twLogo('ton') },

  // Cosmos / IBC ecosystem
  { id: 'cosmos', name: 'Cosmos', symbol: 'ATOM', type: 'other', supported: false, tokenStandard: 'Cosmos / IBC', trustWalletKey: 'cosmos', logoUrl: twLogo('cosmos') },
  { id: 'osmosis', name: 'Osmosis', symbol: 'OSMO', type: 'other', supported: false, tokenStandard: 'Cosmos / IBC', trustWalletKey: 'osmosis', logoUrl: twLogo('osmosis') },
  { id: 'akash', name: 'Akash', symbol: 'AKT', type: 'other', supported: false, tokenStandard: 'Cosmos / IBC', trustWalletKey: 'akash', logoUrl: twLogo('akash') },
  { id: 'axelar', name: 'Axelar', symbol: 'AXL', type: 'other', supported: false, tokenStandard: 'Cosmos / IBC', trustWalletKey: 'axelar', logoUrl: twLogo('axelar') },
  { id: 'band', name: 'Band Protocol', symbol: 'BAND', type: 'other', supported: false, tokenStandard: 'Cosmos / IBC', trustWalletKey: 'band', logoUrl: twLogo('band') },
  { id: 'juno', name: 'Juno', symbol: 'JUNO', type: 'other', supported: false, tokenStandard: 'Cosmos / IBC', trustWalletKey: 'juno', logoUrl: twLogo('juno') },
  { id: 'kava', name: 'Kava', symbol: 'KAVA', type: 'other', supported: false, tokenStandard: 'Cosmos / IBC', trustWalletKey: 'kava', logoUrl: twLogo('kava') },
  { id: 'secret', name: 'Secret Network', symbol: 'SCRT', type: 'other', supported: false, tokenStandard: 'Cosmos / IBC', trustWalletKey: 'secret', logoUrl: twLogo('secret') },
  { id: 'sei', name: 'Sei', symbol: 'SEI', type: 'other', supported: false, tokenStandard: 'Cosmos / IBC', trustWalletKey: 'sei', logoUrl: twLogo('sei') },
  { id: 'stargaze', name: 'Stargaze', symbol: 'STARS', type: 'other', supported: false, tokenStandard: 'Cosmos / IBC', trustWalletKey: 'stargaze', logoUrl: twLogo('stargaze') },
  { id: 'stride', name: 'Stride', symbol: 'STRD', type: 'other', supported: false, tokenStandard: 'Cosmos / IBC', trustWalletKey: 'stride', logoUrl: twLogo('stride') },
  { id: 'terra', name: 'Terra', symbol: 'LUNA', type: 'other', supported: false, tokenStandard: 'Cosmos', trustWalletKey: 'terra', logoUrl: twLogo('terra') },
  { id: 'terrav2', name: 'Terra Classic', symbol: 'LUNC', type: 'other', supported: false, tokenStandard: 'Cosmos', trustWalletKey: 'terrav2', logoUrl: twLogo('terrav2') },
  { id: 'umee', name: 'Umee', symbol: 'UMEE', type: 'other', supported: false, tokenStandard: 'Cosmos / IBC', trustWalletKey: 'umee', logoUrl: twLogo('umee') },

  // Major non-EVM token ecosystems
  { id: 'algorand', name: 'Algorand', symbol: 'ALGO', type: 'other', supported: false, tokenStandard: 'ASA', trustWalletKey: 'algorand', logoUrl: twLogo('algorand') },
  { id: 'aptos', name: 'Aptos', symbol: 'APT', type: 'other', supported: false, tokenStandard: 'Move', trustWalletKey: 'aptos', logoUrl: twLogo('aptos') },
  { id: 'sui', name: 'Sui', symbol: 'SUI', type: 'other', supported: false, tokenStandard: 'Move / Coin', trustWalletKey: 'sui', logoUrl: twLogo('sui') },
  { id: 'stellar', name: 'Stellar', symbol: 'XLM', type: 'other', supported: false, tokenStandard: 'Stellar Asset', trustWalletKey: 'stellar', logoUrl: twLogo('stellar') },
  { id: 'waves', name: 'Waves', symbol: 'WAVES', type: 'other', supported: false, tokenStandard: 'Waves Asset', trustWalletKey: 'waves', logoUrl: twLogo('waves') },
  { id: 'tezos', name: 'Tezos', symbol: 'XTZ', type: 'other', supported: false, tokenStandard: 'FA1.2 / FA2', trustWalletKey: 'tezos', logoUrl: twLogo('tezos') },
  { id: 'vechain', name: 'VeChain', symbol: 'VET', type: 'other', supported: false, tokenStandard: 'VIP-180', trustWalletKey: 'vechain', logoUrl: twLogo('vechain') },
  { id: 'thorchain', name: 'THORChain', symbol: 'RUNE', type: 'other', supported: false, tokenStandard: 'THORChain', trustWalletKey: 'thorchain', logoUrl: twLogo('thorchain') },
  { id: 'theta', name: 'Theta', symbol: 'THETA', type: 'other', supported: false, tokenStandard: 'Theta', trustWalletKey: 'theta', logoUrl: twLogo('theta') },
  { id: 'zilliqa', name: 'Zilliqa', symbol: 'ZIL', type: 'other', supported: false, tokenStandard: 'ZRC-2', trustWalletKey: 'zilliqa', logoUrl: twLogo('zilliqa') },
  { id: 'xdc', name: 'XDC Network', symbol: 'XDC', type: 'other', supported: false, tokenStandard: 'XRC-20', trustWalletKey: 'xdc', logoUrl: twLogo('xdc') },
  { id: 'waves', name: 'Waves', symbol: 'WAVES', type: 'other', supported: false, tokenStandard: 'Waves Asset', trustWalletKey: 'waves', logoUrl: twLogo('waves') },
  { id: 'polkadot', name: 'Polkadot', symbol: 'DOT', type: 'other', supported: false, tokenStandard: 'Substrate', trustWalletKey: 'polkadot', logoUrl: twLogo('polkadot') },
  { id: 'kusama', name: 'Kusama', symbol: 'KSM', type: 'other', supported: false, tokenStandard: 'Substrate', trustWalletKey: 'kusama', logoUrl: twLogo('kusama') },

  // UTXO / native-chain ecosystems represented by Trust Wallet assets.
  { id: 'bitcoin', name: 'Bitcoin', symbol: 'BTC', type: 'other', supported: false, tokenStandard: 'Bitcoin', trustWalletKey: 'bitcoin', logoUrl: twLogo('bitcoin') },
  { id: 'litecoin', name: 'Litecoin', symbol: 'LTC', type: 'other', supported: false, tokenStandard: 'UTXO', trustWalletKey: 'litecoin', logoUrl: twLogo('litecoin') },
  { id: 'dogecoin', name: 'Dogecoin', symbol: 'DOGE', type: 'other', supported: false, tokenStandard: 'UTXO', trustWalletKey: 'dogecoin', logoUrl: twLogo('dogecoin') },
  { id: 'bitcoin-cash', name: 'Bitcoin Cash', symbol: 'BCH', type: 'other', supported: false, tokenStandard: 'UTXO', trustWalletKey: 'bitcoincash', logoUrl: twLogo('bitcoincash') },
  { id: 'dash', name: 'Dash', symbol: 'DASH', type: 'other', supported: false, tokenStandard: 'UTXO', trustWalletKey: 'dash', logoUrl: twLogo('dash') },
  { id: 'zcash', name: 'Zcash', symbol: 'ZEC', type: 'other', supported: false, tokenStandard: 'UTXO', trustWalletKey: 'zcash', logoUrl: twLogo('zcash') },
  { id: 'ravencoin', name: 'Ravencoin', symbol: 'RVN', type: 'other', supported: false, tokenStandard: 'UTXO', trustWalletKey: 'ravencoin', logoUrl: twLogo('ravencoin') },
  { id: 'qtum', name: 'Qtum', symbol: 'QTUM', type: 'other', supported: false, tokenStandard: 'UTXO / EVM', trustWalletKey: 'qtum', logoUrl: twLogo('qtum') },

  // Additional Trust Wallet ecosystems commonly encountered in token lists.
  { id: 'acala', name: 'Acala', symbol: 'ACA', type: 'other', supported: false, tokenStandard: 'Substrate', trustWalletKey: 'acala', logoUrl: twLogo('acala') },
  { id: 'acalaevm', name: 'Acala EVM', symbol: 'ACA', type: 'evm', supported: false, tokenStandard: 'ERC-20 / EVM', trustWalletKey: 'acalaevm', logoUrl: twLogo('acalaevm') },
  { id: 'aeternity', name: 'Aeternity', symbol: 'AE', type: 'other', supported: false, tokenStandard: 'Aeternity', trustWalletKey: 'aeternity', logoUrl: twLogo('aeternity') },
  { id: 'agoric', name: 'Agoric', symbol: 'BLD', type: 'other', supported: false, tokenStandard: 'Cosmos / IBC', trustWalletKey: 'agoric', logoUrl: twLogo('agoric') },
  { id: 'aion', name: 'Aion', symbol: 'AION', type: 'other', supported: false, tokenStandard: 'Aion', trustWalletKey: 'aion', logoUrl: twLogo('aion') },
  { id: 'aptos', name: 'Aptos', symbol: 'APT', type: 'other', supported: false, tokenStandard: 'Move', trustWalletKey: 'aptos', logoUrl: twLogo('aptos') },
  { id: 'ark', name: 'ARK', symbol: 'ARK', type: 'other', supported: false, tokenStandard: 'ARK', trustWalletKey: 'ark', logoUrl: twLogo('ark') },
  { id: 'aurora', name: 'Aurora', symbol: 'AURORA', type: 'evm', supported: false, tokenStandard: 'ERC-20 / EVM', trustWalletKey: 'aurora', logoUrl: twLogo('aurora') },
  { id: 'avalanchex', name: 'Avalanche X-Chain', symbol: 'AVAX', type: 'other', supported: false, tokenStandard: 'Avalanche X-Chain', trustWalletKey: 'avalanchex', logoUrl: twLogo('avalanchex') },
  { id: 'axelar', name: 'Axelar', symbol: 'AXL', type: 'other', supported: false, tokenStandard: 'Cosmos / IBC', trustWalletKey: 'axelar', logoUrl: twLogo('axelar') },
  { id: 'hedera', name: 'Hedera', symbol: 'HBAR', type: 'other', supported: false, tokenStandard: 'HTS', trustWalletKey: 'hedera', logoUrl: twLogo('hedera') },
  { id: 'near', name: 'NEAR Protocol', symbol: 'NEAR', type: 'other', supported: false, tokenStandard: 'NEP-141', trustWalletKey: 'near', logoUrl: twLogo('near') },
  { id: 'near', name: 'NEAR Protocol', symbol: 'NEAR', type: 'other', supported: false, tokenStandard: 'NEP-141', trustWalletKey: 'near', logoUrl: twLogo('near') },
  { id: 'neo', name: 'NEO', symbol: 'NEO', type: 'other', supported: false, tokenStandard: 'NEP-5 / NEP-17', trustWalletKey: 'neo', logoUrl: twLogo('neo') },
  { id: 'ontology', name: 'Ontology', symbol: 'ONT', type: 'other', supported: false, tokenStandard: 'OEP-4', trustWalletKey: 'ontology', logoUrl: twLogo('ontology') },
  { id: 'icon', name: 'ICON', symbol: 'ICX', type: 'other', supported: false, tokenStandard: 'IRC-2', trustWalletKey: 'icon', logoUrl: twLogo('icon') },
  { id: 'iost', name: 'IOST', symbol: 'IOST', type: 'other', supported: false, tokenStandard: 'IOST', trustWalletKey: 'iost', logoUrl: twLogo('iost') },
  { id: 'kadena', name: 'Kadena', symbol: 'KDA', type: 'other', supported: false, tokenStandard: 'Kadena', trustWalletKey: 'kadena', logoUrl: twLogo('kadena') },
  { id: 'ontology', name: 'Ontology', symbol: 'ONT', type: 'other', supported: false, tokenStandard: 'Ontology', trustWalletKey: 'ontology', logoUrl: twLogo('ontology') },
  { id: 'ronin', name: 'Ronin', symbol: 'RON', type: 'evm', supported: false, tokenStandard: 'ERC-20 / EVM', trustWalletKey: 'ronin', logoUrl: twLogo('ronin') },
  { id: 'rootstock', name: 'Rootstock', symbol: 'RBTC', type: 'evm', supported: false, tokenStandard: 'ERC-20 / EVM', trustWalletKey: 'rootstock', logoUrl: twLogo('rootstock') },
  { id: 'sei', name: 'Sei', symbol: 'SEI', type: 'other', supported: false, tokenStandard: 'Cosmos / EVM', trustWalletKey: 'sei', logoUrl: twLogo('sei') },
  { id: 'theta', name: 'Theta', symbol: 'THETA', type: 'other', supported: false, tokenStandard: 'Theta', trustWalletKey: 'theta', logoUrl: twLogo('theta') },
  { id: 'tomochain', name: 'TomoChain', symbol: 'TOMO', type: 'evm', supported: false, tokenStandard: 'ERC-20 / EVM', trustWalletKey: 'tomochain', logoUrl: twLogo('tomochain') },
  { id: 'vechain', name: 'VeChain', symbol: 'VET', type: 'other', supported: false, tokenStandard: 'VIP-180', trustWalletKey: 'vechain', logoUrl: twLogo('vechain') },
  { id: 'verge', name: 'Verge', symbol: 'XVG', type: 'other', supported: false, tokenStandard: 'UTXO', trustWalletKey: 'verge', logoUrl: twLogo('verge') },
  { id: 'viacoin', name: 'Viacoin', symbol: 'VIA', type: 'other', supported: false, tokenStandard: 'UTXO', trustWalletKey: 'viacoin', logoUrl: twLogo('viacoin') },
  { id: 'wanchain', name: 'Wanchain', symbol: 'WAN', type: 'evm', supported: false, tokenStandard: 'ERC-20 / EVM', trustWalletKey: 'wanchain', logoUrl: twLogo('wanchain') },
  { id: 'wemix', name: 'WEMIX', symbol: 'WEMIX', type: 'evm', supported: false, tokenStandard: 'EVM', trustWalletKey: 'wemix', logoUrl: twLogo('wemix') },
  { id: 'xdc', name: 'XDC Network', symbol: 'XDC', type: 'other', supported: false, tokenStandard: 'XRC-20', trustWalletKey: 'xdc', logoUrl: twLogo('xdc') },
  { id: 'xrplevm', name: 'XRPL EVM', symbol: 'XRP', type: 'evm', supported: false, tokenStandard: 'EVM', trustWalletKey: 'xrplevm', logoUrl: twLogo('xrplevm') },
  { id: 'zetachain', name: 'ZetaChain', symbol: 'ZETA', type: 'evm', supported: false, tokenStandard: 'EVM', trustWalletKey: 'zetachain', logoUrl: twLogo('zetachain') },
  { id: 'zetaevm', name: 'ZetaChain EVM', symbol: 'ZETA', type: 'evm', supported: false, tokenStandard: 'ERC-20 / EVM', trustWalletKey: 'zetaevm', logoUrl: twLogo('zetaevm') },
  { id: 'zklink', name: 'zkLink', symbol: 'ZKL', type: 'evm', supported: false, tokenStandard: 'EVM', trustWalletKey: 'zklink', logoUrl: twLogo('zklink') },
  { id: 'zksync', name: 'zkSync', symbol: 'ZK', type: 'evm', supported: false, tokenStandard: 'ERC-20 / EVM', trustWalletKey: 'zksync', logoUrl: twLogo('zksync') },
];

export const TOKEN_CHAIN_BY_ID: Record<string, TokenChainDefinition> = Object.fromEntries(
  TOKEN_CHAINS.map((chain) => [String(chain.id).toLowerCase(), chain])
);

export function getTokenChain(id: ChainId | string): TokenChainDefinition | undefined {
  return TOKEN_CHAIN_BY_ID[String(id).toLowerCase()];
}

export function getTokenChainsForSelector(): TokenChainDefinition[] {
  const unique = new Map<string, TokenChainDefinition>();
  for (const chain of TOKEN_CHAINS) unique.set(String(chain.id).toLowerCase(), chain);
  return [...unique.values()].sort((a, b) => a.name.localeCompare(b.name));
}
