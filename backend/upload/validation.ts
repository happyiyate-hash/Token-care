import { TokenUploadRequest, ValidationResult } from '../types/upload';

/**
 * Validates the token submission input.
 * Ensures that required fields (blockchain, chainId, contractAddress, name, symbol) are present.
 */
export function validateTokenSubmission(payload: any): ValidationResult {
  if (!payload || typeof payload !== 'object') {
    return {
      isValid: false,
      error: 'Request body must be a valid JSON object',
    };
  }

  const blockchain = String(payload.blockchain || payload.chain || '').trim();
  const chainId = payload.chainId ?? payload.chain_id;
  const contractAddress = String(payload.contractAddress || payload.address || '').trim();
  const name = String(payload.name || '').trim();
  const symbol = String(payload.symbol || '').trim();

  if (!contractAddress) {
    return {
      isValid: false,
      error: 'Missing required field: "contractAddress"',
    };
  }

  if (!blockchain) {
    return {
      isValid: false,
      error: 'Missing required field: "blockchain"',
    };
  }

  if (chainId === undefined || chainId === null || chainId === '') {
    return {
      isValid: false,
      error: 'Missing required field: "chainId"',
    };
  }

  const token: TokenUploadRequest = {
    blockchain,
    chainId,
    contractAddress,
    name: name || 'Unknown Token',
    symbol: symbol.toUpperCase() || 'TOKEN',
    decimals: typeof payload.decimals === 'number' ? payload.decimals : 18,
    totalSupply: payload.totalSupply ? String(payload.totalSupply) : undefined,
    logoUrl: payload.logoUrl ? String(payload.logoUrl) : undefined,
    websiteUrl: payload.websiteUrl ? String(payload.websiteUrl) : undefined,
    twitterUrl: payload.twitterUrl ? String(payload.twitterUrl) : undefined,
    telegramUrl: payload.telegramUrl ? String(payload.telegramUrl) : undefined,
  };

  return {
    isValid: true,
    token,
  };
}
