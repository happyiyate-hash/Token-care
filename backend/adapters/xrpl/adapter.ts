import { BlockchainAdapter, AddressValidationResult } from '../baseAdapter';
import { OnChainTokenInspection, AssetStandard } from '../../types/tokenDetails';

const XRPL_RPCS = [
  'https://xrplcluster.com',
  'https://s1.ripple.com:51234',
];

export class XrplAdapter implements BlockchainAdapter {
  readonly chainFamily = 'xrpl' as const;
  readonly canonicalName = 'XRPL';
  readonly defaultStandard: AssetStandard = 'XRPL_ISSUED';

  validateAddress(address: string): AddressValidationResult {
    const clean = (address || '').trim();
    if (!clean) {
      return { isValid: false, normalizedAddress: '', error: 'XRPL asset or issuer address is required' };
    }

    // Handles "CURRENCY.rIssuerAddress" or classic address "r..."
    if (clean.includes('.')) {
      const [, issuer] = clean.split('.');
      if (/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(issuer)) {
        return { isValid: true, normalizedAddress: clean };
      }
    } else if (/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(clean)) {
      return { isValid: true, normalizedAddress: clean };
    }

    return {
      isValid: false,
      normalizedAddress: clean,
      error: 'Invalid XRPL address format. Must be an XRPL classic account address (r...) or CURRENCY.rIssuerAddress.',
    };
  }

  async inspectOnChain(address: string): Promise<OnChainTokenInspection | null> {
    const val = this.validateAddress(address);
    if (!val.isValid) return null;

    let account = val.normalizedAddress;
    let currency = 'XRP';

    if (account.includes('.')) {
      const parts = account.split('.');
      currency = parts[0];
      account = parts[1];
    }

    for (const rpc of XRPL_RPCS) {
      try {
        const body = {
          method: 'account_info',
          params: [
            {
              account,
              strict: true,
              ledger_index: 'validated',
            },
          ],
        };

        const res = await fetch(rpc, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!res.ok) continue;
        const data = await res.json();
        const accData = data?.result?.account_data;

        if (!accData) {
          return {
            isValidContract: false,
            hasBytecode: false,
            inspectedVia: `xrpl-rpc:${rpc}`,
          };
        }

        return {
          isValidContract: true,
          hasBytecode: true,
          name: currency,
          symbol: currency,
          decimals: 6,
          ownerAddress: account,
          isRenounced: false,
          canMint: true,
          inspectedVia: `xrpl-rpc:${rpc}`,
        };
      } catch {
        continue;
      }
    }

    return null;
  }

  formatExplorerUrl(address: string): string {
    const clean = address.includes('.') ? address.split('.')[1] : address;
    return `https://xrpscan.com/account/${clean}`;
  }
}
