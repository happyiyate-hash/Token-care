import { BlockchainAdapter, AddressValidationResult } from '../baseAdapter';
import { OnChainTokenInspection, AssetStandard } from '../../types/tokenDetails';

const SOLANA_RPCS = [
  'https://api.mainnet-beta.solana.com',
  'https://solana-mainnet.rpc.extrnode.com',
  'https://rpc.ankr.com/solana',
];

export class SolanaAdapter implements BlockchainAdapter {
  readonly chainFamily = 'solana' as const;
  readonly canonicalName = 'Solana';
  readonly defaultStandard: AssetStandard = 'SPL';

  validateAddress(address: string): AddressValidationResult {
    const clean = (address || '').trim();
    if (!clean) {
      return { isValid: false, normalizedAddress: '', error: 'Solana token mint address is required' };
    }

    // Base58 regex between 32 and 44 characters (excluding 0, O, I, l)
    const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
    if (base58Regex.test(clean)) {
      return { isValid: true, normalizedAddress: clean };
    }

    return {
      isValid: false,
      normalizedAddress: clean,
      error: 'Invalid Solana mint address. Must be a valid Base58 public key (32-44 characters).',
    };
  }

  async inspectOnChain(address: string): Promise<OnChainTokenInspection | null> {
    const val = this.validateAddress(address);
    if (!val.isValid) return null;
    const mintAddress = val.normalizedAddress;

    for (const rpc of SOLANA_RPCS) {
      try {
        const body = {
          jsonrpc: '2.0',
          id: 1,
          method: 'getAccountInfo',
          params: [
            mintAddress,
            {
              encoding: 'jsonParsed',
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
        const value = data?.result?.value;

        if (!value) {
          return {
            isValidContract: false,
            hasBytecode: false,
            inspectedVia: `solana-rpc:${rpc}`,
          };
        }

        const parsedData = value.data?.parsed?.info;
        if (!parsedData && value.owner !== 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' && value.owner !== 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb') {
          return {
            isValidContract: false,
            hasBytecode: true,
            inspectedVia: `solana-rpc:${rpc}`,
          };
        }

        const decimals = typeof parsedData?.decimals === 'number' ? parsedData.decimals : 9;
        const rawSupply = parsedData?.supply ? String(parsedData.supply) : undefined;
        const mintAuthority = parsedData?.mintAuthority || null;
        const freezeAuthority = parsedData?.freezeAuthority || null;

        // In SPL tokens, if mintAuthority is null, ownership is renounced and no more tokens can ever be minted
        const isRenounced = mintAuthority === null;
        const canMint = mintAuthority !== null;
        const isBlacklistable = freezeAuthority !== null;

        return {
          isValidContract: true,
          hasBytecode: true,
          decimals,
          rawTotalSupply: rawSupply,
          totalSupply: rawSupply ? String(Number(rawSupply) / Math.pow(10, decimals)) : undefined,
          ownerAddress: mintAuthority,
          mintAuthority,
          freezeAuthority,
          isRenounced,
          canMint,
          isBlacklistable,
          inspectedVia: `solana-rpc:${rpc}`,
        };
      } catch (err) {
        continue;
      }
    }

    return null;
  }

  formatExplorerUrl(address: string): string {
    return `https://solscan.io/token/${address}`;
  }
}
