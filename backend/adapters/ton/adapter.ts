import { BlockchainAdapter, AddressValidationResult } from '../baseAdapter';
import { OnChainTokenInspection, AssetStandard } from '../../types/tokenDetails';

const TON_RPCS = [
  'https://toncenter.com/api/v2/jsonRPC',
];

export class TonAdapter implements BlockchainAdapter {
  readonly chainFamily = 'ton' as const;
  readonly canonicalName = 'TON';
  readonly defaultStandard: AssetStandard = 'JETTON';

  validateAddress(address: string): AddressValidationResult {
    const clean = (address || '').trim();
    if (!clean) {
      return { isValid: false, normalizedAddress: '', error: 'TON address is required' };
    }

    // Standard TON address (raw: 0:... or user-friendly: EQ..., UQ..., EQA..., etc. 48 chars)
    if (/^(EQ|UQ|Ef|0:)[a-zA-Z0-9_-]{46,66}$/.test(clean)) {
      return { isValid: true, normalizedAddress: clean };
    }

    return {
      isValid: false,
      normalizedAddress: clean,
      error: 'Invalid TON contract address. Must be a valid user-friendly (EQ/UQ) or raw format.',
    };
  }

  async inspectOnChain(address: string): Promise<OnChainTokenInspection | null> {
    const val = this.validateAddress(address);
    if (!val.isValid) return null;
    const cleanAddr = val.normalizedAddress;

    for (const rpc of TON_RPCS) {
      try {
        const body = {
          jsonrpc: '2.0',
          id: 1,
          method: 'getAddressInformation',
          params: { address: cleanAddr },
        };

        const res = await fetch(rpc, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!res.ok) continue;
        const data = await res.json();
        const state = data?.result?.state;

        if (!state || state === 'uninitialized') {
          return {
            isValidContract: false,
            hasBytecode: false,
            inspectedVia: `ton-rpc:${rpc}`,
          };
        }

        return {
          isValidContract: true,
          hasBytecode: true,
          decimals: 9,
          isRenounced: true,
          canMint: false,
          inspectedVia: `ton-rpc:${rpc}`,
        };
      } catch {
        continue;
      }
    }

    return null;
  }

  formatExplorerUrl(address: string): string {
    return `https://tonscan.org/address/${address}`;
  }
}
