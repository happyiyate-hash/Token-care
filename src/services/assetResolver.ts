/**
 * Chain-agnostic asset identity resolver for the Donate flow.
 *
 * An unknown blockchain is not the same thing as an invalid asset. We keep the
 * original identifier intact and allow the rest of the Donate/verification
 * pipeline to continue even when TokenCare has no native adapter for that
 * blockchain yet.
 */
import { ChainId, TokenDiscovery } from '../types';
import { discoverToken, lookupBlockchainForToken } from './api';

export interface ResolvedAssetIdentity {
  identifier: string;
  blockchainType: string;
  blockchainName: string;
  chainId: string;
  tokenStandard: string;
  identifierType: string;
  source: string;
  confidence: 'high' | 'medium' | 'low';
}

const clean = (value: unknown) => String(value ?? '').trim();

/** Resolve chain identity first; discovery is enrichment, not a hard gate. */
export async function resolveAssetIdentity(
  identifier: string,
  preferredChainId: ChainId = '137'
): Promise<{ identity: ResolvedAssetIdentity; discovery: TokenDiscovery | null }> {
  const original = clean(identifier);
  if (!original) throw new Error('Asset identifier is empty');

  const lookup = await lookupBlockchainForToken(original, preferredChainId).catch(() => null) as any;
  const discovered = await discoverToken(
    original,
    clean(lookup?.chainId || lookup?.chain_id || preferredChainId) as ChainId,
  ).catch(() => null);

  const blockchainType = clean(
    lookup?.blockchainType || lookup?.blockchain_type || discovered?.blockchainType,
  ) || 'unknown';
  const blockchainName = clean(
    lookup?.blockchainName || lookup?.blockchain_name || discovered?.blockchainName,
  ) || (blockchainType === 'unknown' ? 'Unknown Blockchain' : blockchainType);
  const chainId = clean(
    lookup?.chainId || lookup?.chain_id || discovered?.chainId,
  ) || clean(preferredChainId);
  const tokenStandard = clean(
    lookup?.tokenStandard || lookup?.token_standard || discovered?.tokenStandard,
  ) || 'token';
  const identifierType = clean(
    lookup?.asset_identifier_type || lookup?.identifierType || discovered?.asset_identifier_type,
  ) || (tokenStandard === 'SPL' ? 'mint' : tokenStandard === 'issued_asset' ? 'issued_asset' : 'asset_identifier');

  return {
    identity: {
      identifier: original,
      blockchainType,
      blockchainName,
      chainId,
      tokenStandard,
      identifierType,
      source: clean(lookup?.source || discovered?.source) || 'provider-resolution',
      confidence: lookup?.blockchainType || lookup?.chainId
        ? 'high'
        : discovered?.blockchainType
          ? 'medium'
          : 'low',
    },
    discovery: discovered,
  };
}

/** Build a normalized discovery object without inventing an EVM contract address. */
export function identityToDiscovery(
  identity: ResolvedAssetIdentity,
  existing: TokenDiscovery | null,
): TokenDiscovery {
  if (existing) {
    return {
      ...existing,
      address: identity.identifier,
      blockchainType: identity.blockchainType || existing.blockchainType,
      blockchainName: identity.blockchainName || existing.blockchainName,
      chainId: identity.chainId || existing.chainId,
      tokenStandard: identity.tokenStandard || existing.tokenStandard,
      asset_identifier_type: identity.identifierType || existing.asset_identifier_type,
    };
  }

  return {
    address: identity.identifier,
    name: 'Detected Token',
    symbol: 'TOKEN',
    blockchainType: identity.blockchainType,
    blockchainName: identity.blockchainName,
    chainId: identity.chainId,
    tokenStandard: identity.tokenStandard,
    asset_identifier_type: identity.identifierType,
    source: identity.source,
  };
}
