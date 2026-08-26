import { ProviderResult, TokenScanInput } from '../types';

/**
 * DEXTools is deliberately optional. The paid API contract can change by plan,
 * so TokenCare never makes a scan depend on this provider. When a compatible
 * DEXTools endpoint is configured, the adapter can be enabled without changing
 * the aggregation contract.
 */
export async function fetchDexTools(_input: TokenScanInput): Promise<ProviderResult> {
  if (!process.env.DEXTOOLS_API_KEY) return { provider: 'dextools', available: false };
  return { provider: 'dextools', available: false };
}
