import { scanToken } from './index';

export async function handleTokenScanAction(body: any) {
  const params = body?.params || body || {};
  const address = params.address || params.contractAddress || params.contract_address;
  if (!address) {
    return { success: false, code: 'MISSING_TOKEN_ADDRESS', message: 'Token address or identifier is required.' };
  }
  try {
    const data = await scanToken({
      address: String(address),
      blockchain: params.blockchain || params.chain,
      blockchainId: params.blockchainId || params.chainId || params.blockchain_id,
      name: params.name,
      symbol: params.symbol,
    });
    return { success: true, service: 'token', action: 'scan', data };
  } catch (error: any) {
    return { success: false, code: 'TOKEN_SCAN_FAILED', message: error?.message || 'Token scan failed.' };
  }
}

export async function handleTokenVerifyAction(body: any) {
  const params = body?.params || body || {};
  const address = params.address || params.contractAddress || params.contract_address;
  if (!address) return { success: false, code: 'MISSING_TOKEN_ADDRESS', message: 'Token address or identifier is required.' };
  try {
    const data = await scanToken({
      address: String(address), blockchain: params.blockchain || params.chain,
      blockchainId: params.blockchainId || params.chainId || params.blockchain_id,
      name: params.name, symbol: params.symbol,
    });
    return {
      success: true,
      service: 'token',
      action: 'verify',
      data: {
        verified: data.verified,
        exists: data.exists,
        blockchain: data.blockchain,
        blockchain_name: data.blockchain_name,
        blockchain_id: data.blockchain_id,
        contract_address: data.contract_address,
        name: data.token.name,
        symbol: data.token.symbol,
        decimals: data.token.decimals,
        logo_url: data.token.logo_url,
        logo_source: data.token.logo_source,
        standard: data.token.symbol ? 'provider-confirmed' : 'unknown',
        checks: data.checks,
        warnings: data.warnings,
      },
    };
  } catch (error: any) {
    return { success: false, code: 'TOKEN_VERIFY_FAILED', message: error?.message || 'Token verification failed.' };
  }
}
