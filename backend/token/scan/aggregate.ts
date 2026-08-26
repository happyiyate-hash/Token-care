import { fetchBirdeye } from './providers/birdeye';
import { fetchCoinGecko } from './providers/coingecko';
import { fetchCoinMarketCap } from './providers/coinmarketcap';
import { fetchDexScreener, fetchDexScreenerByQuery } from './providers/dexscreener';
import { fetchDexTools } from './providers/dextools';
import { fetchGeckoTerminal } from './providers/geckoterminal';
import { AggregatedTokenData, ProviderResult, TokenScanInput } from './types';

function pick<T>(results: ProviderResult[], getter: (d: any) => T | null | undefined): T | null {
  for (const r of results) {
    if (!r.available) continue;
    const value = getter(r.data || {});
    if (value !== null && value !== undefined && value !== '') return value;
  }
  return null;
}

function numericConsensus(results: ProviderResult[], getter: (d: any) => unknown): number | null {
  const values = results.map((r) => r.available ? Number(getter(r.data || {})) : NaN).filter(Number.isFinite);
  if (!values.length) return null;
  values.sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)];
}

export async function aggregateTokenProviders(input: TokenScanInput): Promise<AggregatedTokenData> {
  let results = await Promise.all([
    fetchDexScreener(input), fetchGeckoTerminal(input), fetchCoinGecko(input),
    fetchCoinMarketCap(input), fetchBirdeye(input), fetchDexTools(input),
  ]);

  // Address-first is the primary identity strategy. If no provider supplies a
  // logo, perform a second, name/symbol-based discovery pass. This is internal
  // and the final API exposes only the selected logo URL and its source.
  if (!results.some((r) => r.available && r.data?.logo_url)) {
    const identity = results.find((r) => r.available && (r.data?.name || r.data?.symbol));
    const query = input.name || input.symbol || identity?.data?.name || identity?.data?.symbol;
    if (query) {
      const fallback = await fetchDexScreenerByQuery(String(query), input.blockchain);
      if (fallback.available) results = [...results, fallback];
    }
  }

  const identityResults = results.filter((r) => r.available && (r.data?.name || r.data?.symbol));
  const names = identityResults.map((r) => String(r.data?.name || '').trim().toLowerCase()).filter(Boolean);
  const symbols = identityResults.map((r) => String(r.data?.symbol || '').trim().toLowerCase()).filter(Boolean);
  const identityVerified = identityResults.length > 0 &&
    (names.length <= 1 || names.filter((n) => n === names[0]).length >= Math.ceil(names.length / 2)) &&
    (symbols.length <= 1 || symbols.filter((s) => s === symbols[0]).length >= Math.ceil(symbols.length / 2));

  const logoProvider = results.find((r) => r.available && r.data?.logo_url);
  const dexResults = results.filter((r) => r.available && ['dexscreener', 'geckoterminal', 'birdeye', 'dextools'].includes(r.provider));

  return {
    token: {
      name: pick(results, (d) => d.name), symbol: pick(results, (d) => d.symbol),
      decimals: pick(results, (d) => d.decimals), total_supply: pick(results, (d) => d.total_supply),
      logo_url: logoProvider?.data?.logo_url || null, logo_source: logoProvider?.provider || null,
    },
    market: {
      price_usd: pick(dexResults, (d) => d.price_usd),
      price_change_24h_pct: numericConsensus(dexResults, (d) => d.price_change_24h_pct),
      liquidity_usd: numericConsensus(dexResults, (d) => d.liquidity_usd),
      volume_24h_usd: numericConsensus(dexResults, (d) => d.volume_24h_usd),
      market_cap: numericConsensus(results, (d) => d.market_cap), fdv: numericConsensus(results, (d) => d.fdv),
      pairs_count: pick(dexResults, (d) => d.pairs_count), buys_24h: pick(dexResults, (d) => d.buys_24h),
      sells_24h: pick(dexResults, (d) => d.sells_24h), dexes: [...new Set(dexResults.flatMap((r) => r.data?.dexes || []))],
      pair_url: pick(dexResults, (d) => d.pair_url),
    },
    identity_verified: identityVerified,
    providerResults: results,
  };
}
