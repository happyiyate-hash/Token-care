import { Contract, JsonRpcProvider, getAddress, isAddress } from 'ethers';

export interface VerificationRequest {
  blockchain?: string;
  chain?: string;
  chainId?: string | number;
  contractAddress: string;
  name?: string;
  symbol?: string;
  decimals?: number;
}

export interface VerificationData {
  token: {
    contractAddress: string;
    blockchain: string;
    chainId: string | number;
    assetStandard: string;
    name: string;
    symbol: string;
    decimals: number | null;
    totalSupply: string | null;
    ownerAddress: string | null;
    isRenounced: boolean | null;
    logoUrl: string | null;
    websiteUrl: string | null;
    twitterUrl: string | null;
    telegramUrl: string | null;
    priceUsd: number | null;
    priceNative: number | null;
    priceChange24h: number | null;
    volume24hUsd: number | null;
    liquidityUsd: number | null;
    marketCapUsd: number | null;
    fdvUsd: number | null;
    pairAddress: string | null;
    dexName: string | null;
  };
  verification: {
    isVerified: boolean;
    isPartial: boolean;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'UNKNOWN';
    verdict: string;
    trustScore: number;
    securityScore: number;
    marketMaturityScore: number;
    securityIssues: string[];
    passedChecks: string[];
    categoryScores: Record<string, number>;
    honeypot: { isHoneypot: boolean | null; buyTax: number | null; sellTax: number | null };
    ownership: { ownerAddress: string | null; isRenounced: boolean | null; canMint: boolean | null; isProxy: boolean | null };
    liquidity: { isLocked: boolean | null; lockedPercentage: number | null };
    holders: { top10HoldersPercent: number | null; totalHoldersEstimate: number | null };
    providerStatus: Record<string, 'verified' | 'unlisted' | 'failed' | 'unsupported'>;
    verifiedAt: string;
  };
}

export interface VerificationResponse {
  success: boolean;
  data?: VerificationData;
  error?: { code: string; message: string; details?: unknown };
}

type JsonRecord = Record<string, any>;

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const DEAD_ADDRESS = '0x000000000000000000000000000000000000dEaD';
const EIP1967_IMPLEMENTATION_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';

const EVM_NETWORKS: Record<string, { name: string; dex: string; gecko: string; rpc: string }> = {
  '1': { name: 'Ethereum', dex: 'ethereum', gecko: 'ethereum', rpc: 'https://ethereum-rpc.publicnode.com' },
  '10': { name: 'Optimism', dex: 'optimism', gecko: 'optimistic-ethereum', rpc: 'https://optimism-rpc.publicnode.com' },
  '56': { name: 'BNB Smart Chain', dex: 'bsc', gecko: 'binance-smart-chain', rpc: 'https://bsc-rpc.publicnode.com' },
  '137': { name: 'Polygon', dex: 'polygon', gecko: 'polygon-pos', rpc: 'https://polygon-bor-rpc.publicnode.com' },
  '250': { name: 'Fantom', dex: 'fantom', gecko: 'fantom', rpc: 'https://fantom-rpc.publicnode.com' },
  '324': { name: 'zkSync Era', dex: 'zksync', gecko: 'zksync', rpc: 'https://zksync-era-rpc.publicnode.com' },
  '8453': { name: 'Base', dex: 'base', gecko: 'base', rpc: 'https://base-rpc.publicnode.com' },
  '42161': { name: 'Arbitrum One', dex: 'arbitrum', gecko: 'arbitrum-one', rpc: 'https://arbitrum-one-rpc.publicnode.com' },
  '43114': { name: 'Avalanche', dex: 'avalanche', gecko: 'avalanche', rpc: 'https://avalanche-c-chain-rpc.publicnode.com' },
  '42220': { name: 'Celo', dex: 'celo', gecko: 'celo', rpc: 'https://celo-rpc.publicnode.com' },
  '59144': { name: 'Linea', dex: 'linea', gecko: 'linea', rpc: 'https://linea-rpc.publicnode.com' },
  '5000': { name: 'Mantle', dex: 'mantle', gecko: 'mantle', rpc: 'https://mantle-rpc.publicnode.com' },
  '534352': { name: 'Scroll', dex: 'scroll', gecko: 'scroll', rpc: 'https://scroll-rpc.publicnode.com' },
  '1101': { name: 'Polygon zkEVM', dex: 'polygonzkevm', gecko: 'polygon-zkevm', rpc: 'https://1rpc.io/polygonzkevm' },
  '81457': { name: 'Blast', dex: 'blast', gecko: 'blast', rpc: 'https://blast-rpc.publicnode.com' },
  '7777777': { name: 'Zora', dex: 'zora', gecko: 'zora', rpc: 'https://zora-rpc.publicnode.com' },
  '146': { name: 'Sonic', dex: 'sonic', gecko: 'sonic', rpc: 'https://sonic-rpc.publicnode.com' },
  '143': { name: 'Monad', dex: 'monad', gecko: 'monad', rpc: 'https://monad-rpc.publicnode.com' },
  '9745': { name: 'Plasma', dex: 'plasma', gecko: 'plasma', rpc: 'https://plasma-rpc.publicnode.com' },
};

function normalizeBlockchain(value?: string): string {
  return String(value || '').trim().toLowerCase().replace(/[_\s-]+/g, '');
}

function isSolanaRequest(request: VerificationRequest): boolean {
  const b = normalizeBlockchain(request.blockchain || request.chain);
  return b === 'solana' || b === 'sol';
}

function getChainId(request: VerificationRequest): string {
  return request.chainId !== undefined && request.chainId !== null && String(request.chainId).trim() !== ''
    ? String(request.chainId)
    : isSolanaRequest(request) ? 'solana-mainnet' : '';
}

async function fetchJson(url: string, init?: RequestInit, timeoutMs = 9000): Promise<JsonRecord | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function postJsonRpc(url: string, method: string, params: unknown[]): Promise<any> {
  const data = await fetchJson(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
  });
  if (!data || data.error) throw new Error(data?.error?.message || 'RPC request failed');
  return data.result;
}

function numberOrNull(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function boolOrNull(value: unknown): boolean | null {
  if (value === true || value === false) return value;
  if (value === '1' || value === 1) return true;
  if (value === '0' || value === 0) return false;
  return null;
}

function safeAddress(value: string): string {
  try { return getAddress(value); } catch { return value; }
}

function isZeroLike(address: string | null): boolean {
  if (!address) return false;
  const a = address.toLowerCase();
  return a === ZERO_ADDRESS.toLowerCase() || a === DEAD_ADDRESS.toLowerCase();
}

async function verifyEvmOnChain(address: string, chainId: string) {
  const network = EVM_NETWORKS[chainId];
  if (!network) return { providerStatus: 'unsupported' as const, exists: null, name: null, symbol: null, decimals: null, totalSupply: null, ownerAddress: null, isRenounced: null, isProxy: null };
  try {
    const provider = new JsonRpcProvider(network.rpc, Number(chainId), { staticNetwork: true });
    const code = await provider.getCode(address);
    if (!code || code === '0x') return { providerStatus: 'verified' as const, exists: false, name: null, symbol: null, decimals: null, totalSupply: null, ownerAddress: null, isRenounced: null, isProxy: null };
    const abi = [
      'function name() view returns (string)',
      'function symbol() view returns (string)',
      'function decimals() view returns (uint8)',
      'function totalSupply() view returns (uint256)',
      'function owner() view returns (address)',
      'function getOwner() view returns (address)',
    ];
    const contract = new Contract(address, abi, provider);
    const [name, symbol, decimals, totalSupply] = await Promise.all([
      contract.name().catch(() => null),
      contract.symbol().catch(() => null),
      contract.decimals().catch(() => null),
      contract.totalSupply().catch(() => null),
    ]);
    let ownerAddress: string | null = null;
    try { ownerAddress = safeAddress(await contract.owner()); } catch {}
    if (!ownerAddress) { try { ownerAddress = safeAddress(await contract.getOwner()); } catch {} }
    let isProxy: boolean | null = null;
    try {
      const slot = await provider.getStorage(address, EIP1967_IMPLEMENTATION_SLOT);
      const implementation = `0x${slot.slice(-40)}`;
      isProxy = /^0x[0-9a-fA-F]{40}$/.test(implementation) && !/^0x0{40}$/.test(implementation);
    } catch {}
    return {
      providerStatus: 'verified' as const,
      exists: true,
      name: typeof name === 'string' ? name : null,
      symbol: typeof symbol === 'string' ? symbol : null,
      decimals: decimals === null ? null : Number(decimals),
      totalSupply: totalSupply === null ? null : String(totalSupply),
      ownerAddress,
      isRenounced: ownerAddress ? isZeroLike(ownerAddress) : null,
      isProxy,
    };
  } catch {
    return { providerStatus: 'failed' as const, exists: null, name: null, symbol: null, decimals: null, totalSupply: null, ownerAddress: null, isRenounced: null, isProxy: null };
  }
}

function readU32LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24);
}

function readU64LE(bytes: Uint8Array, offset: number): bigint {
  let value = 0n;
  for (let i = 0; i < 8; i++) value |= BigInt(bytes[offset + i]) << BigInt(8 * i);
  return value;
}

function bytesToBase58(bytes: Uint8Array): string {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let n = 0n;
  for (const byte of bytes) n = (n << 8n) + BigInt(byte);
  let out = '';
  while (n > 0n) { const r = Number(n % 58n); out = alphabet[r] + out; n /= 58n; }
  for (const byte of bytes) { if (byte !== 0) break; out = '1' + out; }
  return out || '1';
}

async function verifySolanaOnChain(address: string) {
  try {
    const account = await postJsonRpc('https://api.mainnet-beta.solana.com', 'getAccountInfo', [address, { encoding: 'base64' }]);
    if (!account?.value) return { providerStatus: 'verified' as const, exists: false, decimals: null, totalSupply: null, mintAuthority: null, freezeAuthority: null, isInitialized: null };
    const raw = Buffer.from(account.value.data?.[0] || '', 'base64');
    let decimals: number | null = null;
    let totalSupply: string | null = null;
    let mintAuthority: string | null = null;
    let freezeAuthority: string | null = null;
    let isInitialized: boolean | null = null;
    if (raw.length >= 82) {
      const mintOption = readU32LE(raw, 0);
      if (mintOption === 1) mintAuthority = bytesToBase58(raw.subarray(4, 36));
      totalSupply = String(readU64LE(raw, 36));
      decimals = raw[44];
      isInitialized = raw[45] === 1;
      const freezeOption = readU32LE(raw, 46);
      if (freezeOption === 1) freezeAuthority = bytesToBase58(raw.subarray(50, 82));
    }
    return { providerStatus: 'verified' as const, exists: true, decimals, totalSupply, mintAuthority, freezeAuthority, isInitialized };
  } catch {
    return { providerStatus: 'failed' as const, exists: null, decimals: null, totalSupply: null, mintAuthority: null, freezeAuthority: null, isInitialized: null };
  }
}

async function fetchDexScreener(address: string, blockchain: string, chainId: string) {
  const dexChain = isSolanaRequest({ blockchain, chainId, contractAddress: address }) ? 'solana' : EVM_NETWORKS[chainId]?.dex;
  if (!dexChain) return { status: 'unsupported' as const };
  const data = await fetchJson(`https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(address)}`);
  const pairs = Array.isArray(data?.pairs) ? data.pairs : [];
  const matching = pairs.filter((p: any) => String(p?.chainId || '').toLowerCase() === dexChain.toLowerCase());
  matching.sort((a: any, b: any) => Number(b?.liquidity?.usd || 0) - Number(a?.liquidity?.usd || 0));
  const pair = matching[0];
  if (!pair) return { status: 'unlisted' as const };
  return {
    status: 'verified' as const,
    priceUsd: numberOrNull(pair.priceUsd),
    priceNative: numberOrNull(pair.priceNative),
    liquidityUsd: numberOrNull(pair.liquidity?.usd),
    volume24hUsd: numberOrNull(pair.volume?.h24),
    priceChange24h: numberOrNull(pair.priceChange?.h24),
    pairAddress: pair.pairAddress || null,
    dexName: pair.dexId || null,
    fdvUsd: numberOrNull(pair.fdv),
    marketCapUsd: numberOrNull(pair.marketCap),
  };
}

async function fetchCoinGecko(address: string, chainId: string, solana: boolean) {
  const platform = solana ? 'solana' : EVM_NETWORKS[chainId]?.gecko;
  if (!platform) return { status: 'unsupported' as const };
  const data = await fetchJson(`https://api.coingecko.com/api/v3/coins/${platform}/contract/${encodeURIComponent(address)}`);
  if (!data) return { status: 'unlisted' as const };
  return {
    status: 'verified' as const,
    name: data.name || null,
    symbol: data.symbol ? String(data.symbol).toUpperCase() : null,
    priceUsd: numberOrNull(data.market_data?.current_price?.usd),
    marketCapUsd: numberOrNull(data.market_data?.market_cap?.usd),
    volume24hUsd: numberOrNull(data.market_data?.total_volume?.usd),
    totalSupply: numberOrNull(data.market_data?.total_supply),
    priceChange24h: numberOrNull(data.market_data?.price_change_percentage_24h),
    logoUrl: data.image?.large || data.image?.small || null,
    websiteUrl: data.links?.homepage?.find((x: any) => x) || null,
    twitterUrl: data.links?.twitter_screen_name ? `https://twitter.com/${data.links.twitter_screen_name}` : null,
    telegramUrl: data.links?.telegram_channel_identifier ? `https://t.me/${data.links.telegram_channel_identifier}` : null,
  };
}

async function fetchGeckoTerminal(address: string, chainId: string, solana: boolean) {
  const network = solana ? 'solana' : EVM_NETWORKS[chainId]?.dex;
  if (!network) return { status: 'unsupported' as const };
  const data = await fetchJson(`https://api.geckoterminal.com/api/v2/networks/${network}/tokens/${encodeURIComponent(address)}`);
  const a = data?.data?.attributes;
  if (!a) return { status: 'unlisted' as const };
  return { status: 'verified' as const, priceUsd: numberOrNull(a.price_usd), volume24hUsd: numberOrNull(a.volume_usd?.h24), liquidityUsd: numberOrNull(a.total_reserve_in_usd) };
}

async function fetchGoPlus(address: string, chainId: string, solana: boolean) {
  const url = solana
    ? `https://api.gopluslabs.io/api/v1/solana/token_security?contract_addresses=${encodeURIComponent(address)}`
    : EVM_NETWORKS[chainId]
      ? `https://api.gopluslabs.io/api/v1/token_security/${chainId}?contract_addresses=${encodeURIComponent(address.toLowerCase())}`
      : null;
  if (!url) return { status: 'unsupported' as const };
  const data = await fetchJson(url);
  const result = solana ? data?.result?.[address] : data?.result?.[address.toLowerCase()];
  if (!result) return { status: 'unlisted' as const };
  return {
    status: 'verified' as const,
    isHoneypot: boolOrNull(result.is_honeypot),
    isMintable: boolOrNull(result.is_mintable),
    isProxy: boolOrNull(result.is_proxy),
    isBlacklisted: boolOrNull(result.is_blacklisted),
    buyTax: result.buy_tax === '' || result.buy_tax === undefined ? null : numberOrNull(result.buy_tax) === null ? null : Number(result.buy_tax) * 100,
    sellTax: result.sell_tax === '' || result.sell_tax === undefined ? null : numberOrNull(result.sell_tax) === null ? null : Number(result.sell_tax) * 100,
    ownerAddress: result.owner_address || null,
    isRenounced: result.owner_address ? isZeroLike(result.owner_address) : null,
    liquidityLocked: boolOrNull(result.is_locked),
    liquidityLockedPercent: numberOrNull(result.locked_percent),
    holderCount: numberOrNull(result.holder_count),
  };
}

async function fetchHoneypot(address: string, chainId: string, solana: boolean) {
  if (solana || !['1', '56', '137', '42161', '8453', '10', '43114'].includes(chainId)) return { status: 'unsupported' as const };
  const data = await fetchJson(`https://api.honeypot.is/v2/IsHoneypot?address=${encodeURIComponent(address)}&chainId=${chainId}`);
  if (!data) return { status: 'failed' as const };
  return {
    status: 'verified' as const,
    isHoneypot: boolOrNull(data.honeypotResult?.isHoneypot),
    buyTax: numberOrNull(data.simulationResult?.buyTax),
    sellTax: numberOrNull(data.simulationResult?.sellTax),
  };
}

function calculateScores(input: {
  honeypot: boolean | null;
  mintable: boolean | null;
  proxy: boolean | null;
  blacklisted: boolean | null;
  buyTax: number | null;
  sellTax: number | null;
  liquidityUsd: number | null;
  marketCapUsd: number | null;
  volume24hUsd: number | null;
  sourceExists: boolean | null;
  metadataAvailable: boolean;
  providerFailures: number;
}) {
  const critical = input.honeypot === true || input.blacklisted === true;
  let score = 50;
  if (input.honeypot === true) score -= 45;
  else if (input.honeypot === false) score += 15;
  if (input.mintable === true) score -= 12;
  else if (input.mintable === false) score += 8;
  if (input.proxy === true) score -= 5;
  else if (input.proxy === false) score += 4;
  if (input.blacklisted === true) score -= 25;
  if (input.buyTax !== null) score -= Math.min(10, input.buyTax);
  if (input.sellTax !== null) score -= Math.min(10, input.sellTax);
  if ((input.liquidityUsd || 0) >= 100000) score += 8;
  else if ((input.liquidityUsd || 0) >= 10000) score += 4;
  if ((input.volume24hUsd || 0) >= 100000) score += 5;
  if ((input.marketCapUsd || 0) >= 1000000) score += 5;
  if (input.sourceExists === false) score = 0;
  if (!input.metadataAvailable) score -= 5;
  score = Math.max(0, Math.min(100, Math.round(score)));
  const unknownCount = [input.honeypot, input.mintable, input.proxy, input.blacklisted, input.buyTax, input.sellTax, input.liquidityUsd, input.marketCapUsd, input.volume24hUsd].filter(v => v === null).length;
  const partial = input.providerFailures > 0 || unknownCount >= 3;
  const riskLevel = critical ? 'CRITICAL' : score >= 75 ? 'LOW' : score >= 50 ? 'MEDIUM' : score >= 25 ? 'HIGH' : 'CRITICAL';
  return { score, partial, riskLevel: riskLevel as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' };
}

export async function verifyToken(request: VerificationRequest): Promise<VerificationResponse> {
  const address = String(request.contractAddress || '').trim();
  const blockchain = String(request.blockchain || request.chain || '').trim();
  const chainId = getChainId(request);
  if (!address) return { success: false, error: { code: 'MISSING_CONTRACT_ADDRESS', message: 'Contract address is required.' } };
  if (!blockchain) return { success: false, error: { code: 'MISSING_BLOCKCHAIN', message: 'Blockchain is required.' } };
  const solana = isSolanaRequest(request);
  if (!solana && !isAddress(address)) return { success: false, error: { code: 'INVALID_EVM_ADDRESS', message: 'Invalid EVM contract address.' } };
  if (solana && (address.length < 32 || address.length > 50)) return { success: false, error: { code: 'INVALID_SOLANA_ADDRESS', message: 'Invalid Solana mint address.' } };

  const providerStatus: Record<string, 'verified' | 'unlisted' | 'failed' | 'unsupported'> = {};
  const [onChain, dex, gecko, geckoTerminal, goPlus, honeypot] = await Promise.all([
    solana ? verifySolanaOnChain(address) : verifyEvmOnChain(address, chainId),
    fetchDexScreener(address, blockchain, chainId),
    fetchCoinGecko(address, chainId, solana),
    fetchGeckoTerminal(address, chainId, solana),
    fetchGoPlus(address, chainId, solana),
    fetchHoneypot(address, chainId, solana),
  ]);

  providerStatus.on_chain = onChain.providerStatus;
  providerStatus.dexscreener = dex.status;
  providerStatus.coingecko = gecko.status;
  providerStatus.geckoterminal = geckoTerminal.status;
  providerStatus.goplus = goPlus.status;
  providerStatus.honeypot = honeypot.status;

  const name = (gecko as any).name || (onChain as any).name || request.name || '';
  const symbol = (gecko as any).symbol || (onChain as any).symbol || request.symbol || '';
  const decimals = (onChain as any).decimals ?? request.decimals ?? null;
  const totalSupply = (onChain as any).totalSupply ?? (gecko as any).totalSupply?.toString() ?? null;
  const ownerAddress = solana ? null : ((goPlus as any).ownerAddress || (onChain as any).ownerAddress || null);
  const isRenounced = solana ? null : ((goPlus as any).isRenounced ?? (onChain as any).isRenounced ?? null);
  const mintable = solana
    ? ((onChain as any).mintAuthority ? true : (onChain as any).mintAuthority === null ? false : null)
    : ((goPlus as any).isMintable ?? null);
  const proxy = solana ? null : ((goPlus as any).isProxy ?? (onChain as any).isProxy ?? null);
  const honeypotResult = (goPlus as any).isHoneypot !== undefined ? goPlus : honeypot;
  const honeypotValue = honeypotResult?.isHoneypot ?? null;
  const buyTax = honeypotResult?.buyTax ?? null;
  const sellTax = honeypotResult?.sellTax ?? null;
  const liquidityUsd = (dex as any).liquidityUsd ?? (geckoTerminal as any).liquidityUsd ?? null;
  const volume24hUsd = (dex as any).volume24hUsd ?? (geckoTerminal as any).volume24hUsd ?? (gecko as any).volume24hUsd ?? null;
  const marketCapUsd = (dex as any).marketCapUsd ?? (gecko as any).marketCapUsd ?? null;
  const priceUsd = (dex as any).priceUsd ?? (geckoTerminal as any).priceUsd ?? (gecko as any).priceUsd ?? null;
  const priceNative = (dex as any).priceNative ?? null;
  const priceChange24h = (dex as any).priceChange24h ?? (gecko as any).priceChange24h ?? null;
  const logoUrl = (gecko as any).logoUrl || null;
  const metadataAvailable = Boolean(name || symbol || decimals !== null || totalSupply !== null);
  const sourceExists = (onChain as any).exists;
  const providerFailures = Object.values(providerStatus).filter(s => s === 'failed').length;
  const score = calculateScores({ honeypot: honeypotValue, mintable, proxy, blacklisted: (goPlus as any).isBlacklisted ?? null, buyTax, sellTax, liquidityUsd, marketCapUsd, volume24hUsd, sourceExists, metadataAvailable, providerFailures });

  const securityIssues: string[] = [];
  const passedChecks: string[] = [];
  if (sourceExists === false) securityIssues.push('No token contract/mint was found on the selected blockchain.');
  if (honeypotValue === true) securityIssues.push('Security provider identified a honeypot or unsellable trading risk.');
  else if (honeypotValue === false) passedChecks.push('No honeypot was detected by the available security provider.');
  if (mintable === true) securityIssues.push('The token appears to retain minting authority.');
  else if (mintable === false) passedChecks.push('No active minting authority was detected.');
  if (proxy === true) securityIssues.push('The token uses an upgradeable/proxy contract.');
  else if (proxy === false) passedChecks.push('The contract was not identified as an EIP-1967 proxy.');
  if ((goPlus as any).isBlacklisted === true) securityIssues.push('Blacklist functionality/risk was reported by the security provider.');
  if (buyTax !== null && buyTax > 10) securityIssues.push(`High buy tax detected (${buyTax.toFixed(2)}%).`);
  if (sellTax !== null && sellTax > 10) securityIssues.push(`High sell tax detected (${sellTax.toFixed(2)}%).`);
  if (liquidityUsd !== null && liquidityUsd > 0) passedChecks.push(`Liquidity data found (${liquidityUsd.toLocaleString('en-US', { maximumFractionDigits: 0 })} USD).`);
  if (sourceExists === true) passedChecks.push('Token contract/mint exists on the selected blockchain.');
  if (isRenounced === true) passedChecks.push('Ownership appears renounced or controlled by a zero/dead address.');

  const isPartial = score.partial || Object.values(providerStatus).some(s => s === 'unlisted' || s === 'failed' || s === 'unsupported');
  const riskLevel = score.riskLevel;
  const verdict = sourceExists === false ? 'REJECTED' : riskLevel === 'CRITICAL' ? 'HIGH_RISK' : riskLevel === 'HIGH' ? 'HIGH_RISK_WARN' : riskLevel === 'MEDIUM' ? 'ACCEPTED_MEDIUM_RISK' : isPartial ? 'NEEDS_OBSERVATION' : 'APPROVED_LOW_RISK';

  return {
    success: true,
    data: {
      token: {
        contractAddress: solana ? address : safeAddress(address),
        blockchain: solana ? 'Solana' : (EVM_NETWORKS[chainId]?.name || blockchain),
        chainId,
        assetStandard: solana ? 'SPL Token' : 'ERC-20 / EVM Token',
        name, symbol, decimals, totalSupply, ownerAddress, isRenounced, logoUrl,
        websiteUrl: (gecko as any).websiteUrl || null,
        twitterUrl: (gecko as any).twitterUrl || null,
        telegramUrl: (gecko as any).telegramUrl || null,
        priceUsd, priceNative, priceChange24h, volume24hUsd, liquidityUsd, marketCapUsd,
        fdvUsd: (dex as any).fdvUsd ?? null,
        pairAddress: (dex as any).pairAddress || null,
        dexName: (dex as any).dexName || null,
      },
      verification: {
        isVerified: sourceExists === true && riskLevel !== 'CRITICAL',
        isPartial, riskLevel, verdict, trustScore: score.score,
        securityScore: Math.round(score.score * 0.5),
        marketMaturityScore: Math.round(score.score * 0.5),
        securityIssues, passedChecks,
        categoryScores: {
          security: Math.round(score.score * 0.4),
          liquidity: liquidityUsd === null ? 0 : Math.min(100, Math.round(Math.log10(Math.max(1, liquidityUsd)) * 12)),
          market: marketCapUsd === null ? 0 : Math.min(100, Math.round(Math.log10(Math.max(1, marketCapUsd)) * 10)),
          trading: volume24hUsd === null ? 0 : Math.min(100, Math.round(Math.log10(Math.max(1, volume24hUsd)) * 10)),
        },
        honeypot: { isHoneypot: honeypotValue, buyTax, sellTax },
        ownership: { ownerAddress, isRenounced, canMint: mintable, isProxy: proxy },
        liquidity: { isLocked: (goPlus as any).liquidityLocked ?? null, lockedPercentage: (goPlus as any).liquidityLockedPercent ?? null },
        holders: { top10HoldersPercent: null, totalHoldersEstimate: (goPlus as any).holderCount ?? null },
        providerStatus,
        verifiedAt: new Date().toISOString(),
      },
    },
  };
}
