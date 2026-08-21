import { AssetStandard, OnChainTokenInspection } from '../types/tokenDetails';

export interface AddressValidationResult {
  isValid: boolean;
  normalizedAddress: string;
  error?: string;
}

export interface BlockchainAdapter {
  readonly chainFamily: 'evm' | 'solana' | 'xrpl' | 'ton' | 'other';
  readonly canonicalName: string;
  readonly defaultStandard: AssetStandard;

  validateAddress(address: string): AddressValidationResult;

  inspectOnChain(
    address: string,
    chainIdentifier?: string | number
  ): Promise<OnChainTokenInspection | null>;

  formatExplorerUrl?(address: string, chainIdentifier?: string | number): string;
}
