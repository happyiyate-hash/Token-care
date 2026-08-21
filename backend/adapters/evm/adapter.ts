import { ethers } from 'ethers';
import { BlockchainAdapter, AddressValidationResult } from '../baseAdapter';
import { OnChainTokenInspection, AssetStandard } from '../../types/tokenDetails';
import { resolveEvmChainConfig, EvmChainConfig } from './chains';

// ERC20 Function Selectors
const SELECTORS = {
  name: '0x06fdde03',
  symbol: '0x95d89b41',
  decimals: '0x313ce567',
  totalSupply: '0x18160ddd',
  owner: '0x8da5cb5b',
  getOwner: '0x893d20e8',
};

// EIP-1967 Implementation Slot
const EIP1967_IMPLEMENTATION_SLOT =
  '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';

export class EvmAdapter implements BlockchainAdapter {
  readonly chainFamily = 'evm' as const;
  readonly canonicalName = 'EVM';
  readonly defaultStandard: AssetStandard = 'ERC20';

  validateAddress(address: string): AddressValidationResult {
    const clean = (address || '').trim();
    if (!clean) {
      return { isValid: false, normalizedAddress: '', error: 'Contract address is required' };
    }

    try {
      // ethers getAddress validates 20-byte hex and checksum
      const checksummed = ethers.getAddress(clean);
      return { isValid: true, normalizedAddress: checksummed };
    } catch {
      // Fallback regex test
      if (/^0x[a-fA-F0-9]{40}$/.test(clean)) {
        return { isValid: true, normalizedAddress: clean.toLowerCase() };
      }
      return {
        isValid: false,
        normalizedAddress: clean,
        error: 'Invalid EVM contract address. Must be a 42-character hex string starting with 0x.',
      };
    }
  }

  async inspectOnChain(
    address: string,
    chainIdentifier?: string | number
  ): Promise<OnChainTokenInspection | null> {
    const val = this.validateAddress(address);
    if (!val.isValid) return null;
    const targetAddr = val.normalizedAddress;

    const chainConfig: EvmChainConfig = resolveEvmChainConfig(chainIdentifier);
    const rpcUrls = chainConfig.publicRpcs;

    // Try RPC providers sequentially until one responds
    for (const rpc of rpcUrls) {
      try {
        const provider = new ethers.JsonRpcProvider(rpc, undefined, { staticNetwork: true });

        // 1. Check if contract has bytecode
        const code = await provider.getCode(targetAddr);
        if (!code || code === '0x' || code === '0x0') {
          return {
            isValidContract: false,
            hasBytecode: false,
            inspectedVia: `rpc:${rpc}`,
          };
        }

        // 2. Perform low-level eth_calls to avoid crashing on non-standard ERC20
        const [rawName, rawSymbol, rawDecimals, rawTotalSupply, rawOwner, rawGetOwner, proxySlot] =
          await Promise.allSettled([
            provider.call({ to: targetAddr, data: SELECTORS.name }),
            provider.call({ to: targetAddr, data: SELECTORS.symbol }),
            provider.call({ to: targetAddr, data: SELECTORS.decimals }),
            provider.call({ to: targetAddr, data: SELECTORS.totalSupply }),
            provider.call({ to: targetAddr, data: SELECTORS.owner }),
            provider.call({ to: targetAddr, data: SELECTORS.getOwner }),
            provider.getStorage(targetAddr, EIP1967_IMPLEMENTATION_SLOT),
          ]);

        const name =
          rawName.status === 'fulfilled' ? this.decodeStringOrBytes32(rawName.value) : undefined;
        const symbol =
          rawSymbol.status === 'fulfilled' ? this.decodeStringOrBytes32(rawSymbol.value) : undefined;
        const decimals =
          rawDecimals.status === 'fulfilled' ? this.decodeNumber(rawDecimals.value) : 18;
        const totalSupply =
          rawTotalSupply.status === 'fulfilled'
            ? this.decodeBigNumber(rawTotalSupply.value, decimals)
            : undefined;

        let ownerAddress: string | null = null;
        if (rawOwner.status === 'fulfilled') {
          ownerAddress = this.decodeAddress(rawOwner.value);
        } else if (rawGetOwner.status === 'fulfilled') {
          ownerAddress = this.decodeAddress(rawGetOwner.value);
        }

        // Check if owner is zero address (renounced)
        const isRenounced =
          ownerAddress === '0x0000000000000000000000000000000000000000' ||
          ownerAddress === '0x000000000000000000000000000000000000dead';

        // Check Proxy Implementation
        let isProxy = false;
        let implementationAddress: string | null = null;
        if (proxySlot.status === 'fulfilled' && proxySlot.value) {
          const implAddr = this.decodeAddress(proxySlot.value);
          if (implAddr && implAddr !== '0x0000000000000000000000000000000000000000') {
            isProxy = true;
            implementationAddress = implAddr;
          }
        }

        return {
          isValidContract: true,
          hasBytecode: true,
          name: name || undefined,
          symbol: symbol || undefined,
          decimals: typeof decimals === 'number' ? decimals : 18,
          totalSupply: totalSupply?.formatted,
          rawTotalSupply: totalSupply?.raw,
          ownerAddress: ownerAddress || undefined,
          isRenounced,
          canMint: !isRenounced,
          isProxy,
          implementationAddress,
          inspectedVia: `rpc:${rpc}`,
        };
      } catch (rpcErr) {
        // Continue to next fallback RPC
        continue;
      }
    }

    return null;
  }

  formatExplorerUrl(address: string, chainIdentifier?: string | number): string {
    const config = resolveEvmChainConfig(chainIdentifier);
    return `${config.explorer}/token/${address}`;
  }

  private decodeStringOrBytes32(hexData?: string): string | null {
    if (!hexData || hexData === '0x') return null;
    try {
      // Attempt ABI string decode
      const abiCoder = ethers.AbiCoder.defaultAbiCoder();
      return abiCoder.decode(['string'], hexData)[0];
    } catch {
      try {
        // Attempt bytes32 decode (e.g. MakerDAO MKR symbol)
        return ethers.decodeBytes32String(hexData).replace(/\0/g, '').trim();
      } catch {
        return null;
      }
    }
  }

  private decodeNumber(hexData?: string): number | null {
    if (!hexData || hexData === '0x') return null;
    try {
      const bn = BigInt(hexData);
      return Number(bn);
    } catch {
      return null;
    }
  }

  private decodeBigNumber(
    hexData?: string,
    decimals = 18
  ): { formatted: string; raw: string } | null {
    if (!hexData || hexData === '0x') return null;
    try {
      const bn = BigInt(hexData);
      const formatted = ethers.formatUnits(bn, decimals);
      return { formatted, raw: bn.toString() };
    } catch {
      return null;
    }
  }

  private decodeAddress(hexData?: string): string | null {
    if (!hexData || hexData === '0x' || hexData.length < 42) return null;
    try {
      const addrHex = '0x' + hexData.slice(-40);
      return ethers.getAddress(addrHex);
    } catch {
      return null;
    }
  }
}
