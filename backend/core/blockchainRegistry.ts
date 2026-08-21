import { BlockchainAdapter } from '../adapters/baseAdapter';
import { EvmAdapter } from '../adapters/evm/adapter';
import { SolanaAdapter } from '../adapters/solana/adapter';
import { XrplAdapter } from '../adapters/xrpl/adapter';
import { TonAdapter } from '../adapters/ton/adapter';
import { EVM_NAME_ALIAS_MAP, EVM_CHAINS } from '../adapters/evm/chains';

export interface ResolvedBlockchainContext {
  adapter: BlockchainAdapter;
  canonicalBlockchainName: string;
  chainIdentifier: string | number;
  chainFamily: 'evm' | 'solana' | 'xrpl' | 'ton' | 'other';
}

export class BlockchainRegistry {
  private evmAdapter = new EvmAdapter();
  private solanaAdapter = new SolanaAdapter();
  private xrplAdapter = new XrplAdapter();
  private tonAdapter = new TonAdapter();

  /**
   * Resolves the proper BlockchainAdapter dynamically without needing
   * the verification engine to know any network-specific details.
   */
  resolve(
    blockchainNameOrId?: string | number,
    contractAddress?: string
  ): ResolvedBlockchainContext {
    const rawKey = String(blockchainNameOrId || '').trim().toLowerCase();
    const addr = (contractAddress || '').trim();

    // 1. Explicit Solana match
    if (rawKey === 'solana' || rawKey === 'sol' || rawKey === 'spl') {
      return {
        adapter: this.solanaAdapter,
        canonicalBlockchainName: 'Solana',
        chainIdentifier: 'solana',
        chainFamily: 'solana',
      };
    }

    // 2. Explicit XRPL match
    if (rawKey === 'xrpl' || rawKey === 'xrp' || rawKey === 'ripple') {
      return {
        adapter: this.xrplAdapter,
        canonicalBlockchainName: 'XRPL',
        chainIdentifier: 'xrpl',
        chainFamily: 'xrpl',
      };
    }

    // 3. Explicit TON match
    if (rawKey === 'ton' || rawKey === 'toncoin' || rawKey === 'the-open-network') {
      return {
        adapter: this.tonAdapter,
        canonicalBlockchainName: 'TON',
        chainIdentifier: 'ton',
        chainFamily: 'ton',
      };
    }

    // 4. EVM Chain ID or Name Alias Match
    if (EVM_CHAINS[rawKey]) {
      const chainConfig = EVM_CHAINS[rawKey];
      return {
        adapter: this.evmAdapter,
        canonicalBlockchainName: chainConfig.name,
        chainIdentifier: chainConfig.chainId,
        chainFamily: 'evm',
      };
    }

    if (EVM_NAME_ALIAS_MAP[rawKey]) {
      const chainId = EVM_NAME_ALIAS_MAP[rawKey];
      const chainConfig = EVM_CHAINS[chainId];
      return {
        adapter: this.evmAdapter,
        canonicalBlockchainName: chainConfig.name,
        chainIdentifier: chainConfig.chainId,
        chainFamily: 'evm',
      };
    }

    // 5. Automatic detection fallback based on address pattern if blockchain wasn't strictly recognized
    if (addr) {
      if (this.solanaAdapter.validateAddress(addr).isValid && addr.length > 40 && !addr.startsWith('0x')) {
        return {
          adapter: this.solanaAdapter,
          canonicalBlockchainName: 'Solana',
          chainIdentifier: 'solana',
          chainFamily: 'solana',
        };
      }

      if (this.tonAdapter.validateAddress(addr).isValid && (addr.startsWith('EQ') || addr.startsWith('UQ') || addr.startsWith('Ef'))) {
        return {
          adapter: this.tonAdapter,
          canonicalBlockchainName: 'TON',
          chainIdentifier: 'ton',
          chainFamily: 'ton',
        };
      }

      if (this.xrplAdapter.validateAddress(addr).isValid && (addr.startsWith('r') || addr.includes('.'))) {
        return {
          adapter: this.xrplAdapter,
          canonicalBlockchainName: 'XRPL',
          chainIdentifier: 'xrpl',
          chainFamily: 'xrpl',
        };
      }
    }

    // 6. Generic/Dynamic EVM resolution using frontend provided blockchain name and chain ID
    const customName = String(blockchainNameOrId || 'Polygon').trim();
    return {
      adapter: this.evmAdapter,
      canonicalBlockchainName: customName.charAt(0).toUpperCase() + customName.slice(1),
      chainIdentifier: rawKey || 137,
      chainFamily: 'evm',
    };
  }
}

export const blockchainRegistry = new BlockchainRegistry();
