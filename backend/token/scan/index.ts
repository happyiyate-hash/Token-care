import { aggregateTokenProviders } from './aggregate';
import { TokenScanInput } from './types';

const CHAIN_NAMES: Record<string, string> = {
  ethereum: 'Ethereum', eth: 'Ethereum', polygon: 'Polygon', '137': 'Polygon', bsc: 'BNB Smart Chain', '56': 'BNB Smart Chain',
  arbitrum: 'Arbitrum One', '42161': 'Arbitrum One', optimism: 'Optimism', '10': 'Optimism', base: 'Base', avalanche: 'Avalanche',
  solana: 'Solana', polkadot: 'Polkadot Network', kusama: 'Kusama', near: 'NEAR Protocol', tron: 'TRON', fantom: 'Fantom',
};

function chainName(chain?: string, id?: string | number): string | null {
  const key = String(id ?? chain ?? '').trim().toLowerCase();
  return CHAIN_NAMES[key] || (chain ? chain : null);
}

export async function scanToken(input: TokenScanInput) {
  const address = String(input.address || '').trim();
  if (!address) throw new Error('Token address or identifier is required.');

  const aggregated = await aggregateTokenProviders(input);
  const t = aggregated.token;
  const m = aggregated.market;
  const warnings: string[] = [];

  if (!t.name || !t.symbol) warnings.push('Token identity could not be fully confirmed.');
  if (!t.logo_url) warnings.push('Token logo is unavailable.');
  if (m.price_usd == null) warnings.push('Current market price is unavailable.');
  if (m.liquidity_usd == null) warnings.push('Liquidity data is unavailable.');
  if (m.volume_24h_usd == null) warnings.push('24-hour volume data is unavailable.');
  if (m.market_cap == null) warnings.push('Market capitalization is unavailable.');
  if (m.fdv == null) warnings.push('Fully diluted valuation is unavailable.');

  const identityOk = !!(t.name && t.symbol);
  const marketOk = m.price_usd != null || m.market_cap != null || m.volume_24h_usd != null;
  const completed = identityOk && marketOk && warnings.length <= 2;

  return {
    scan_completed: completed,
    scan_status: completed ? 'complete' : 'partial',
    verified: aggregated.identity_verified,
    exists: identityOk,
    blockchain: input.blockchain || null,
    blockchain_name: chainName(input.blockchain, input.blockchainId),
    blockchain_id: input.blockchainId ?? null,
    contract_address: address,
    token: t,
    market: m,
    checks: {
      address_or_identifier_format: true,
      token_identity: identityOk,
      market_data: marketOk,
      logo_available: !!t.logo_url,
      supply_available: t.total_supply != null,
    },
    warnings,
    findings: [],
    disclaimer: 'Provider-assisted token analysis. Missing data is reported as unavailable and is not treated as proof of safety or legitimacy.',
  };
}
