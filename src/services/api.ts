import { ChainId, MarketData, TokenDiscovery, ERC20Metadata } from '../types';
import {
  SUPPORTED_CHAINS,
  getChainInfo,
  isEvmChain,
  isXrplAddress,
  isSolanaAddress,
  isTronAddress,
  isTonAddress,
  isPolkadotAddress,
  isCosmosAddress,
  isNearAddress,
  isAptosOrSuiAddress,
  registerDynamicChain,
} from '../constants/chains';
import {
  storeDynamicChain,
  fetchChainLogoInBackground,
  getCachedChainLogo,
} from './chainLogoService';

/**
 * Resolves canonical network metadata from provider's chain identifier or address structure
 */
export function resolveNetworkFromProviderChainId(
  providerChainId: string,
  address: string,
  preferredChainId: string = '137'
): {
  blockchainType: string;
  blockchainName: string;
  chainId: string;
  tokenStandard: string;
} {
  const clean = (providerChainId || '').toLowerCase().trim();

  // 1. Polkadot & Substrate Ecosystem
  if (
    clean === 'polkadot' ||
    clean === 'substrate' ||
    clean === 'kusama' ||
    clean === 'assethub' ||
    clean === 'statemint' ||
    clean === 'statemine' ||
    clean === 'astar' ||
    clean === 'hydradx' ||
    clean === 'subtensor' ||
    clean === 'bittensor' ||
    isPolkadotAddress(address)
  ) {
    const isKusama = clean === 'kusama' || clean === 'statemine';
    return {
      blockchainType: 'polkadot',
      blockchainName: isKusama ? 'Kusama Network' : 'Polkadot Network',
      chainId: isKusama ? 'kusama' : 'polkadot',
      tokenStandard: 'Substrate Asset',
    };
  }

  // 2. TON Network
  if (clean === 'ton' || clean === 'ton-network' || isTonAddress(address)) {
    return {
      blockchainType: 'ton',
      blockchainName: 'TON Network',
      chainId: 'ton',
      tokenStandard: 'Jetton',
    };
  }

  // 3. XRP Ledger
  if (clean === 'xrpl' || clean === 'xrp' || clean === 'ripple' || isXrplAddress(address)) {
    return {
      blockchainType: 'xrpl',
      blockchainName: 'XRP Ledger',
      chainId: 'mainnet',
      tokenStandard: 'issued_asset',
    };
  }

  // 4. Solana
  if (clean === 'solana' || clean === 'sol' || clean === 'mainnet-beta' || isSolanaAddress(address)) {
    return {
      blockchainType: 'solana',
      blockchainName: 'Solana',
      chainId: 'solana',
      tokenStandard: 'SPL',
    };
  }

  // 5. TRON
  if (clean === 'tron' || clean === 'trx' || isTronAddress(address)) {
    return {
      blockchainType: 'tron',
      blockchainName: 'TRON',
      chainId: 'mainnet',
      tokenStandard: 'TRC-20',
    };
  }

  // 6. Cosmos / IBC Ecosystem
  if (
    clean === 'cosmos' ||
    clean === 'osmosis' ||
    clean === 'injective' ||
    clean === 'celestia' ||
    clean === 'sei' ||
    clean === 'kujira' ||
    isCosmosAddress(address)
  ) {
    const cosmosName =
      clean === 'osmosis'
        ? 'Osmosis'
        : clean === 'injective'
        ? 'Injective'
        : clean === 'celestia'
        ? 'Celestia'
        : clean === 'sei'
        ? 'Sei Network'
        : 'Cosmos Hub';
    return {
      blockchainType: 'cosmos',
      blockchainName: cosmosName,
      chainId: clean || 'cosmos',
      tokenStandard: 'IBC Token',
    };
  }

  // 7. Move Ecosystem (Sui / Aptos)
  if (clean === 'sui') {
    return {
      blockchainType: 'sui',
      blockchainName: 'Sui Network',
      chainId: 'sui',
      tokenStandard: 'Coin',
    };
  }
  if (clean === 'aptos') {
    return {
      blockchainType: 'aptos',
      blockchainName: 'Aptos',
      chainId: 'aptos',
      tokenStandard: 'Fungible Asset',
    };
  }

  // 8. NEAR Protocol
  if (clean === 'near' || isNearAddress(address)) {
    return {
      blockchainType: 'near',
      blockchainName: 'NEAR Protocol',
      chainId: 'near',
      tokenStandard: 'NEP-141',
    };
  }

  // 9. EVM chains mapping from provider IDs
  const evmChainMap: Record<string, { chainId: string; name: string }> = {
    polygon: { chainId: '137', name: 'Polygon' },
    polygon_pos: { chainId: '137', name: 'Polygon' },
    ethereum: { chainId: '1', name: 'Ethereum' },
    base: { chainId: '8453', name: 'Base' },
    arbitrum: { chainId: '42161', name: 'Arbitrum' },
    optimism: { chainId: '10', name: 'Optimism' },
    bsc: { chainId: '56', name: 'Binance Smart Chain' },
    avalanche: { chainId: '43114', name: 'Avalanche' },
    linea: { chainId: '59144', name: 'Linea' },
    blast: { chainId: '81457', name: 'Blast' },
    zksync: { chainId: '324', name: 'zkSync Era' },
    scroll: { chainId: '534352', name: 'Scroll' },
    fantom: { chainId: '250', name: 'Fantom' },
    celo: { chainId: '42220', name: 'Celo' },
    berachain: { chainId: '80094', name: 'Berachain' },
    monad: { chainId: '10143', name: 'Monad' },
    hyperevm: { chainId: '999', name: 'HyperEVM' },
  };

  if (evmChainMap[clean]) {
    return {
      blockchainType: 'evm',
      blockchainName: evmChainMap[clean].name,
      chainId: evmChainMap[clean].chainId,
      tokenStandard: 'ERC-20',
    };
  }

  // If the address format is strictly non-EVM (e.g. SS58, Base58), avoid defaulting to Polygon/EVM
  if (isPolkadotAddress(address)) {
    return {
      blockchainType: 'polkadot',
      blockchainName: 'Polkadot Network',
      chainId: 'polkadot',
      tokenStandard: 'Substrate Asset',
    };
  }

  const isEvm = isEvmChain(clean || preferredChainId);
  const chainInfo = getChainInfo(clean || preferredChainId);

  return {
    blockchainType: isEvm ? 'evm' : clean || 'non_evm',
    blockchainName: chainInfo.name || (clean ? clean.toUpperCase() : 'Decentralized Network'),
    chainId: String(chainInfo.id || clean || preferredChainId),
    tokenStandard: isEvm ? 'ERC-20' : 'Token Asset',
  };
}

/**
 * Parses XRPL issued asset identifier into structured metadata
 */
export function parseXrplAssetIdentifier(address: string): {
  address: string;
  currency: string;
  issuer: string;
  name: string;
  symbol: string;
} {
  const clean = address.trim();
  if (clean.includes('.')) {
    const [currCode, issuerAddr] = clean.split('.');
    let symbol = currCode;
    // Hex currency code (e.g. 41524D5900000000000000000000000000000000)
    if (currCode.length === 40 && /^[0-9a-fA-F]+$/.test(currCode)) {
      try {
        let str = '';
        for (let i = 0; i < currCode.length; i += 2) {
          const code = parseInt(currCode.substr(i, 2), 16);
          if (code > 0) str += String.fromCharCode(code);
        }
        if (str.trim()) symbol = str.trim();
      } catch {
        symbol = currCode.slice(0, 6);
      }
    }
    return {
      address: clean,
      currency: currCode,
      issuer: issuerAddr || '',
      name: `${symbol} (XRPL Asset)`,
      symbol: symbol.toUpperCase(),
    };
  }
  return {
    address: clean,
    currency: 'XRP',
    issuer: clean,
    name: 'XRPL Issued Token',
    symbol: 'XRPL',
  };
}

/**
 * Normalized token discovery engine. Queries provider data and returns a standardized TokenDiscovery object.
 */
export async function discoverToken(
  rawAddress: string,
  preferredChainId: ChainId = '137'
): Promise<TokenDiscovery | null> {
  const address = rawAddress.trim();
  if (!address) return null;

  // Derive clean base address if address contains suffix like __NOT or _NOT
  const baseAddress = address.includes('__')
    ? address.split('__')[0]
    : address.includes('_') && isTonAddress(address)
      ? address.split('_')[0]
      : address;

  // 1. DexScreener discovery
  try {
    let response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`);
    let data = response.ok ? await response.json() : null;

    // Fallback query with baseAddress if original full string produced no pairs
    if ((!data || !data.pairs || data.pairs.length === 0) && baseAddress !== address) {
      const baseResponse = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${baseAddress}`);
      if (baseResponse.ok) {
        data = await baseResponse.json();
      }
    }

    if (data && data.pairs && data.pairs.length > 0) {
      const sorted = [...data.pairs].sort(
        (a: any, b: any) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0)
      );
      const bestPair = sorted[0];
      const dexChainId = (bestPair.chainId || '').toLowerCase().trim();

      const netInfo = resolveNetworkFromProviderChainId(dexChainId, address, preferredChainId);

      return {
        address: bestPair.baseToken?.address || address,
        name: bestPair.baseToken?.name || 'Discovered Token',
        symbol: (bestPair.baseToken?.symbol || 'TOK').toUpperCase(),
        decimals: 18,
        blockchainType: netInfo.blockchainType,
        blockchainName: netInfo.blockchainName,
        chainId: netInfo.chainId,
        tokenStandard: netInfo.tokenStandard,
        asset_identifier_type: netInfo.tokenStandard === 'issued_asset' ? 'issued_asset' : 'contract_address',
        logoUrl: bestPair.info?.imageUrl || bestPair.info?.header || undefined,
        source: 'dexscreener',
        marketData: {
          priceUsd: parseFloat(bestPair.priceUsd || '0'),
          priceNative: parseFloat(bestPair.priceNative || '0'),
          priceChange24h: bestPair.priceChange?.h24 || 0,
          volume24h: bestPair.volume?.h24 || 0,
          liquidityUsd: bestPair.liquidity?.usd || 0,
          fdvUsd: bestPair.fdv || 0,
          marketCapUsd: bestPair.marketCap || bestPair.fdv || 0,
          pairAddress: bestPair.pairAddress,
          dexName: (bestPair.dexId || 'DEX').toUpperCase(),
          pairUrl: bestPair.url,
        },
      };
    }
  } catch (err) {
    console.warn('[Discovery Engine] DexScreener fetch error:', err);
  }

  // 2. TON fallback discovery
  if (isTonAddress(address)) {
    let extractedSymbol = 'TON';
    if (address.includes('__')) {
      const suffix = address.split('__')[1]?.trim();
      if (suffix) extractedSymbol = suffix.toUpperCase();
    } else if (address.includes('_')) {
      const parts = address.split('_');
      const suffix = parts[parts.length - 1]?.trim();
      if (suffix && suffix.length <= 10) extractedSymbol = suffix.toUpperCase();
    }

    const tokenName = extractedSymbol !== 'TON' ? `${extractedSymbol} (TON Jetton)` : 'TON Jetton Token';

    return {
      address,
      name: tokenName,
      symbol: extractedSymbol,
      decimals: 9,
      blockchainType: 'ton',
      blockchainName: 'TON Network',
      chainId: 'ton',
      tokenStandard: 'Jetton',
      asset_identifier_type: 'contract_address',
      source: 'ton-provider',
    };
  }

  // 3. XRPL fallback discovery
  if (isXrplAddress(address)) {
    const xrpl = parseXrplAssetIdentifier(address);
    return {
      address: xrpl.address,
      name: xrpl.name,
      symbol: xrpl.symbol,
      decimals: 15,
      blockchainType: 'xrpl',
      blockchainName: 'XRP Ledger',
      chainId: 'mainnet',
      tokenStandard: 'issued_asset',
      asset_identifier_type: 'issued_asset',
      source: 'xrpl-provider',
    };
  }

  // 4. Solana fallback discovery
  if (isSolanaAddress(address)) {
    const nonEvm = await fetchNonEvmTokenMetadata(address, 'solana', 'solana').catch(() => null);
    if (nonEvm) {
      return {
        address,
        name: nonEvm.name,
        symbol: nonEvm.symbol,
        decimals: nonEvm.decimals || 9,
        blockchainType: 'solana',
        blockchainName: 'Solana',
        chainId: 'solana',
        tokenStandard: 'SPL',
        asset_identifier_type: 'mint',
        logoUrl: nonEvm.logoUrl,
        source: 'solana-provider',
      };
    }
    return {
      address,
      name: 'Solana Token',
      symbol: 'SOL',
      decimals: 9,
      blockchainType: 'solana',
      blockchainName: 'Solana',
      chainId: 'solana',
      tokenStandard: 'SPL',
      asset_identifier_type: 'mint',
      source: 'solana-provider',
    };
  }

  // 5. TRON fallback discovery
  if (isTronAddress(address)) {
    const nonEvm = await fetchNonEvmTokenMetadata(address, 'mainnet', 'tron').catch(() => null);
    if (nonEvm) {
      return {
        address,
        name: nonEvm.name,
        symbol: nonEvm.symbol,
        decimals: nonEvm.decimals || 6,
        blockchainType: 'tron',
        blockchainName: 'TRON',
        chainId: 'mainnet',
        tokenStandard: 'TRC-20',
        asset_identifier_type: 'contract_address',
        logoUrl: nonEvm.logoUrl,
        source: 'tron-provider',
      };
    }
    return {
      address,
      name: 'TRON Token',
      symbol: 'TRX',
      decimals: 6,
      blockchainType: 'tron',
      blockchainName: 'TRON',
      chainId: 'mainnet',
      tokenStandard: 'TRC-20',
      asset_identifier_type: 'contract_address',
      source: 'tron-provider',
    };
  }

  // 6. Polkadot & Substrate fallback discovery
  if (isPolkadotAddress(address)) {
    const nonEvm = await fetchNonEvmTokenMetadata(address, 'polkadot', 'polkadot').catch(() => null);
    if (nonEvm) {
      return {
        address,
        name: nonEvm.name,
        symbol: nonEvm.symbol,
        decimals: nonEvm.decimals || 10,
        blockchainType: 'polkadot',
        blockchainName: 'Polkadot Network',
        chainId: 'polkadot',
        tokenStandard: 'Substrate Asset',
        asset_identifier_type: 'substrate_asset',
        logoUrl: nonEvm.logoUrl,
        source: 'polkadot-provider',
      };
    }
    const short = address.slice(0, 4).toUpperCase();
    return {
      address,
      name: `Polkadot Asset (${short})`,
      symbol: short || 'DOT',
      decimals: 10,
      blockchainType: 'polkadot',
      blockchainName: 'Polkadot Network',
      chainId: 'polkadot',
      tokenStandard: 'Substrate Asset',
      asset_identifier_type: 'substrate_asset',
      logoUrl: 'https://cryptologos.cc/logos/polkadot-new-dot-logo.svg?v=035',
      source: 'polkadot-provider',
    };
  }

  // 7. Cosmos / Move / Generic non-EVM fallback discovery
  if (!address.startsWith('0x') && address.length >= 1) {
    const nonEvm = await fetchNonEvmTokenMetadata(address, 'non_evm', 'non_evm').catch(() => null);
    if (nonEvm) {
      return {
        address,
        name: nonEvm.name,
        symbol: nonEvm.symbol,
        decimals: nonEvm.decimals || 18,
        blockchainType: nonEvm.blockchainType || 'non_evm',
        blockchainName: nonEvm.blockchainName || 'Multi-Chain Network',
        chainId: nonEvm.chainId || 'custom',
        tokenStandard: nonEvm.tokenStandard || 'Token Asset',
        asset_identifier_type: 'asset_identifier',
        logoUrl: nonEvm.logoUrl,
        source: 'generic-provider',
      };
    }
  }

  // Return null if token metadata could not be discovered via indexers or providers
  return null;
}

interface DexScreenerPair {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  baseToken: {
    address: string;
    name: string;
    symbol: string;
  };
  priceNative: string;
  priceUsd: string;
  priceChange: {
    h24?: number;
  };
  volume: {
    h24?: number;
  };
  liquidity?: {
    usd?: number;
  };
  fdv?: number;
  marketCap?: number;
}

/**
 * Fetches market data (price, liquidity, volume, market cap, DEX pairs) via DexScreener API
 */
export async function fetchDexScreenerData(
  address: string,
  chainId: ChainId,
  tokenName?: string,
  tokenSymbol?: string
): Promise<(Partial<MarketData> & { name?: string; symbol?: string; logoUrl?: string }) | null> {
  try {
    const baseAddress = address.includes('__')
      ? address.split('__')[0]
      : address.includes('_') && isTonAddress(address)
        ? address.split('_')[0]
        : address;

    let data: any = null;

    if (address && address.length >= 1) {
      let response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`).catch(() => null);
      if (response && response.ok) {
        data = await response.json().catch(() => null);
      }

      if ((!data || !data.pairs || data.pairs.length === 0) && baseAddress !== address) {
        const baseRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${baseAddress}`).catch(() => null);
        if (baseRes && baseRes.ok) {
          data = await baseRes.json().catch(() => null);
        }
      }

      // Fallback to dex search with address if direct token lookup returned no pairs
      if (!data || !data.pairs || data.pairs.length === 0) {
        const searchRes = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(address)}`).catch(() => null);
        if (searchRes && searchRes.ok) {
          data = await searchRes.json().catch(() => null);
        }
      }
    }

    // Secondary fallback: Search DexScreener by Token Symbol or Name
    const secondaryQuery = (tokenSymbol || tokenName || '').trim();
    if ((!data || !data.pairs || data.pairs.length === 0) && secondaryQuery) {
      const searchRes = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(secondaryQuery)}`).catch(() => null);
      if (searchRes && searchRes.ok) {
        data = await searchRes.json().catch(() => null);
      }
    }

    if (!data || !data.pairs || data.pairs.length === 0) return null;

    // Filter or sort pairs by highest liquidity
    const cleanChain = String(chainId).toLowerCase().trim();
    const chainMap: Record<string, string> = {
      'mainnet-beta': 'solana',
      'solana': 'solana',
      'ton': 'ton',
      'tron': 'tron',
      'xrpl': 'xrpl',
      '1': 'ethereum',
      '137': 'polygon',
      '8453': 'base',
      '42161': 'arbitrum',
      '56': 'bsc',
      '10': 'optimism',
      '43114': 'avalanche',
    };
    const targetChain = SUPPORTED_CHAINS[chainId]?.dexScreenerChain || chainMap[cleanChain] || chainId;
    const chainPairs = data.pairs.filter(
      (p: DexScreenerPair) => p.chainId.toLowerCase() === targetChain.toLowerCase()
    );

    const bestPair: DexScreenerPair = (chainPairs.length > 0 ? chainPairs : data.pairs).sort(
      (a: DexScreenerPair, b: DexScreenerPair) =>
        (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0)
    )[0];

    if (!bestPair) return null;

    const priceUsd = parseFloat(bestPair.priceUsd || '0');
    const priceNative = parseFloat(bestPair.priceNative || '0');
    const priceChange24h = bestPair.priceChange?.h24 || 0;
    const volume24h = bestPair.volume?.h24 || 0;
    const liquidityUsd = bestPair.liquidity?.usd || 0;
    const fdvUsd = bestPair.fdv || 0;
    const marketCapUsd = bestPair.marketCap || fdvUsd;

    return {
      name: bestPair.baseToken?.name,
      symbol: bestPair.baseToken?.symbol ? bestPair.baseToken.symbol.toUpperCase() : undefined,
      priceUsd,
      priceNative,
      priceChange24h,
      volume24h,
      liquidityUsd,
      marketCapUsd,
      fdvUsd,
      pairAddress: bestPair.pairAddress,
      dexName: (bestPair.dexId || 'DEX').toUpperCase(),
      pairUrl: bestPair.url,
      logoUrl: (bestPair as any).info?.imageUrl || (bestPair as any).info?.header || undefined,
    };
  } catch (err) {
    console.warn('[API] DexScreener fetch error:', err);
    return null;
  }
}

/**
 * Universal Non-EVM Token Metadata Fetcher (Solana, TON, TRON, XRPL)
 */
export async function fetchNonEvmTokenMetadata(
  address: string,
  chainId: string,
  blockchainType?: string
): Promise<ERC20Metadata | null> {
  const clean = address.trim();
  const bType = (blockchainType || chainId || '').toLowerCase();
  const isSolana = bType === 'solana' || bType === 'spl' || bType === 'mainnet-beta' || isSolanaAddress(clean);
  const isTon = bType === 'ton' || bType === 'ton-network' || isTonAddress(clean);
  const isTron = bType === 'tron' || bType === 'trc20' || isTronAddress(clean);
  const isXrpl = bType === 'xrpl' || bType === 'xrp' || isXrplAddress(clean);

  // 1. SOLANA
  if (isSolana) {
    let name: string | undefined;
    let symbol: string | undefined;
    let logoUrl: string | undefined;
    let decimals = 9;
    let totalSupply = '1000000000';
    let isRenounced = true;
    let ownerAddress: string | undefined;

    // 1a. Pump.fun API (Fastest and most accurate for Pump & Raydium Solana tokens)
    try {
      const pumpRes = await fetch(`https://frontend-api.pump.fun/coins/${clean}`).catch(() => null);
      if (pumpRes && pumpRes.ok) {
        const pumpData = await pumpRes.json().catch(() => null);
        if (pumpData && (pumpData.name || pumpData.symbol)) {
          name = pumpData.name;
          symbol = (pumpData.symbol || 'PUMP').toUpperCase();
          logoUrl = pumpData.image_uri;
          decimals = 6;
          if (pumpData.total_supply) {
            totalSupply = String(Math.round(pumpData.total_supply / 1e6));
          }
          if (pumpData.creator) {
            ownerAddress = pumpData.creator;
          }
          isRenounced = !pumpData.creator || pumpData.complete;
        }
      }
    } catch (e) {
      console.warn('[Solana] Pump.fun fetch note:', e);
    }

    // 1b. RugCheck API
    if (!name || !symbol) {
      try {
        const rcRes = await fetch(`https://api.rugcheck.xyz/v1/tokens/${clean}/report`).catch(() => null);
        if (rcRes && rcRes.ok) {
          const rcData = await rcRes.json().catch(() => null);
          if (rcData?.tokenMeta?.name || rcData?.tokenMeta?.symbol) {
            name = rcData.tokenMeta.name;
            symbol = (rcData.tokenMeta.symbol || 'SPL').toUpperCase();
            logoUrl = rcData.fileMeta?.image || logoUrl;
            if (rcData.decimals !== undefined) decimals = rcData.decimals;
            if (rcData.tokenMeta?.supply) totalSupply = String(rcData.tokenMeta.supply);
            isRenounced = !rcData.mintAuthority && !rcData.freezeAuthority;
          }
        }
      } catch (e) {
        console.warn('[Solana] RugCheck fetch note:', e);
      }
    }

    // 1c. Jupiter Token List API
    if (!name || !symbol) {
      try {
        const jupRes = await fetch(`https://tokens.jup.ag/token/${clean}`).catch(() => null);
        if (jupRes && jupRes.ok) {
          const jupData = await jupRes.json().catch(() => null);
          if (jupData?.name || jupData?.symbol) {
            name = jupData.name;
            symbol = (jupData.symbol || 'SOL').toUpperCase();
            logoUrl = jupData.logoURI || logoUrl;
            if (jupData.decimals !== undefined) decimals = jupData.decimals;
          }
        }
      } catch (e) {
        console.warn('[Solana] Jupiter fetch note:', e);
      }
    }

    // 1d. DexScreener lookup
    if (!name || !symbol) {
      const dexRes = await fetchDexScreenerData(clean, 'mainnet-beta').catch(() => null);
      if (dexRes) {
        name = dexRes.name;
        symbol = dexRes.symbol;
        logoUrl = dexRes.logoUrl || logoUrl;
      }
    }

    // 1e. Synthesize fallback if valid Solana address
    if (!name && !symbol && isSolanaAddress(clean)) {
      const short = clean.slice(0, 4).toUpperCase();
      name = `Solana Token (${short})`;
      symbol = short;
    }

    if (name || symbol) {
      return {
        address: clean,
        chainId: 'solana',
        blockchainType: 'solana',
        blockchainName: 'Solana',
        tokenStandard: 'SPL',
        name: name || 'Solana Token',
        symbol: symbol || 'SOL',
        decimals,
        totalSupply,
        rawTotalSupply: totalSupply,
        logoUrl,
        ownerAddress,
        isRenounced,
      };
    }
  }

  // 2. TON
  if (isTon) {
    let name: string | undefined;
    let symbol: string | undefined;
    let logoUrl: string | undefined;
    let decimals = 9;
    let totalSupply = '1000000000';

    try {
      const baseAddress = clean.includes('__') ? clean.split('__')[0] : clean;
      const tonRes = await fetch(`https://tonapi.io/v2/jettons/${baseAddress}`).catch(() => null);
      if (tonRes && tonRes.ok) {
        const tonData = await tonRes.json().catch(() => null);
        if (tonData?.metadata?.name || tonData?.metadata?.symbol) {
          name = tonData.metadata.name;
          symbol = (tonData.metadata.symbol || 'TON').toUpperCase();
          logoUrl = tonData.metadata.image;
          if (tonData.metadata.decimals) decimals = parseInt(tonData.metadata.decimals, 10);
          if (tonData.total_supply) totalSupply = String(Math.round(parseFloat(tonData.total_supply) / Math.pow(10, decimals)));
        }
      }
    } catch (e) {
      console.warn('[TON] TonAPI fetch note:', e);
    }

    if (!name && !symbol) {
      let suffix = '';
      if (clean.includes('__')) suffix = clean.split('__')[1];
      else if (clean.includes('_')) suffix = clean.split('_')[1];
      if (suffix) {
        symbol = suffix.toUpperCase();
        name = `${symbol} (TON Jetton)`;
      } else {
        name = 'TON Jetton Token';
        symbol = 'JETTON';
      }
    }

    return {
      address: clean,
      chainId: 'ton',
      blockchainType: 'ton',
      blockchainName: 'TON Network',
      tokenStandard: 'Jetton',
      name: name || 'TON Token',
      symbol: symbol || 'TON',
      decimals,
      totalSupply,
      rawTotalSupply: totalSupply,
      logoUrl,
      isRenounced: true,
    };
  }

  // 3. TRON
  if (isTron) {
    let name: string | undefined;
    let symbol: string | undefined;
    let logoUrl: string | undefined;
    let decimals = 6;
    let totalSupply = '1000000000';

    try {
      const tronRes = await fetch(`https://apilist.tronscanapi.com/api/token_trc20?contract=${clean}`).catch(() => null);
      if (tronRes && tronRes.ok) {
        const tronData = await tronRes.json().catch(() => null);
        const trc = tronData?.trc20_tokens?.[0] || tronData?.data?.[0];
        if (trc) {
          name = trc.name;
          symbol = (trc.symbol || 'TRX').toUpperCase();
          logoUrl = trc.icon_url;
          if (trc.decimals !== undefined) decimals = trc.decimals;
          if (trc.total_supply_with_decimals) totalSupply = String(trc.total_supply_with_decimals);
        }
      }
    } catch (e) {
      console.warn('[TRON] Tronscan fetch note:', e);
    }

    return {
      address: clean,
      chainId: 'mainnet',
      blockchainType: 'tron',
      blockchainName: 'TRON',
      tokenStandard: 'TRC-20',
      name: name || 'TRON Token',
      symbol: symbol || 'TRX',
      decimals,
      totalSupply,
      rawTotalSupply: totalSupply,
      logoUrl,
      isRenounced: true,
    };
  }

  // 4. XRPL
  if (isXrpl) {
    const xrpl = parseXrplAssetIdentifier(clean);
    return {
      address: clean,
      chainId: 'mainnet',
      blockchainType: 'xrpl',
      blockchainName: 'XRP Ledger',
      tokenStandard: 'issued_asset',
      name: xrpl.name,
      symbol: xrpl.symbol,
      decimals: 15,
      totalSupply: '1000000000',
      rawTotalSupply: '1000000000',
      isRenounced: true,
    };
  }

  // 5. Polkadot & Substrate Assets
  const isPolkadot = bType === 'polkadot' || bType === 'substrate' || bType === 'kusama' || isPolkadotAddress(clean);
  if (isPolkadot) {
    let name: string | undefined;
    let symbol: string | undefined;
    let logoUrl: string | undefined;
    let decimals = 10;
    let totalSupply = '1000000000';

    // 5a. DexScreener lookup for Polkadot / Substrate DEX pairs (HydraDX, Asset Hub, Astar)
    try {
      const dexRes = await fetchDexScreenerData(clean, 'polkadot' as any).catch(() => null);
      if (dexRes) {
        name = dexRes.name;
        symbol = dexRes.symbol;
        logoUrl = dexRes.logoUrl || logoUrl;
      }
    } catch (e) {
      console.warn('[Polkadot] DexScreener fetch note:', e);
    }

    // 5b. Subscan / Coingecko search
    if (!name || !symbol) {
      try {
        const cgRes = await fetch(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(clean)}`).catch(() => null);
        if (cgRes && cgRes.ok) {
          const cgData = await cgRes.json().catch(() => null);
          const firstCoin = cgData?.coins?.[0];
          if (firstCoin) {
            name = firstCoin.name;
            symbol = (firstCoin.symbol || 'DOT').toUpperCase();
            logoUrl = firstCoin.large || firstCoin.thumb || logoUrl;
          }
        }
      } catch (e) {
        console.warn('[Polkadot] CoinGecko note:', e);
      }
    }

    // 5c. Synthesize clean Polkadot / Substrate fallback
    if (!name || !symbol) {
      if (clean.includes(':')) {
        const parts = clean.split(':');
        symbol = parts[1].toUpperCase();
        name = `${symbol} (Substrate Asset)`;
      } else {
        const short = clean.slice(0, 4).toUpperCase();
        name = `Polkadot Asset (${short})`;
        symbol = short || 'DOT';
      }
    }

    return {
      address: clean,
      chainId: 'polkadot',
      blockchainType: 'polkadot',
      blockchainName: 'Polkadot Network',
      tokenStandard: 'Substrate Asset',
      name: name || 'Polkadot Asset',
      symbol: symbol || 'DOT',
      decimals,
      totalSupply,
      rawTotalSupply: totalSupply,
      logoUrl: logoUrl || 'https://cryptologos.cc/logos/polkadot-new-dot-logo.svg?v=035',
      isRenounced: true,
    };
  }

  // 6. Generic Non-EVM Asset Fallback (Cosmos, Move, NEAR, etc.)
  if (isCosmosAddress(clean) || isNearAddress(clean) || isAptosOrSuiAddress(clean) || (!clean.startsWith('0x') && clean.length >= 1)) {
    const isCosmos = isCosmosAddress(clean);
    const isNear = isNearAddress(clean);
    const chainName = isCosmos ? 'Cosmos Hub' : isNear ? 'NEAR Protocol' : 'Multi-Chain Network';
    const chainType = isCosmos ? 'cosmos' : isNear ? 'near' : 'non_evm';
    const standard = isCosmos ? 'IBC Token' : isNear ? 'NEP-141' : 'Asset';
    const shortSym = clean.includes('.') ? clean.split('.')[0].toUpperCase() : clean.slice(0, 4).toUpperCase();

    return {
      address: clean,
      chainId: chainType,
      blockchainType: chainType,
      blockchainName: chainName,
      tokenStandard: standard,
      name: `${chainName} Token (${shortSym})`,
      symbol: shortSym || 'TOKEN',
      decimals: 18,
      totalSupply: '1000000000',
      rawTotalSupply: '1000000000',
      isRenounced: true,
    };
  }

  return null;
}

export interface CoinGeckoTokenData {
  name?: string;
  symbol?: string;
  logoUrl?: string;
  priceUsd?: number;
  priceChange24h?: number;
  marketCapUsd?: number;
  circulatingSupply?: number;
  totalSupplyCG?: number;
  maxSupplyCG?: number;
}

/**
 * Fetches token supply and market details from CoinGecko public endpoints
 * Uses platform contract lookup with robust CoinGecko Search API fallback by name and symbol.
 */
export async function fetchCoinGeckoSupplyData(
  address: string,
  chainId: ChainId,
  tokenName?: string,
  tokenSymbol?: string
): Promise<CoinGeckoTokenData | null> {
  try {
    const clean = (address || '').trim().toLowerCase();
    const platform = SUPPORTED_CHAINS[chainId]?.coingeckoPlatform || 'ethereum';

    // 1. Direct platform contract lookup
    if (clean && clean.length >= 2) {
      const res = await fetch(
        `https://api.coingecko.com/api/v3/coins/${platform}/contract/${clean}`
      ).catch(() => null);

      if (res && res.ok) {
        const data = await res.json().catch(() => null);
        if (data) {
          const marketData = data.market_data;
          return {
            name: data.name || undefined,
            symbol: data.symbol ? data.symbol.toUpperCase() : undefined,
            logoUrl: data.image?.large || data.image?.small || data.image?.thumb || undefined,
            priceUsd: marketData?.current_price?.usd || undefined,
            priceChange24h: marketData?.price_change_percentage_24h || undefined,
            marketCapUsd: marketData?.market_cap?.usd || undefined,
            circulatingSupply: marketData?.circulating_supply || undefined,
            totalSupplyCG: marketData?.total_supply || marketData?.max_supply || undefined,
            maxSupplyCG: marketData?.max_supply || undefined,
          };
        }
      }
    }

    // 2. CoinGecko Search API query by Name, Symbol, or Address
    const query = (tokenName || tokenSymbol || clean || '').trim();
    if (query) {
      const searchRes = await fetch(
        `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(query)}`
      ).catch(() => null);

      if (searchRes && searchRes.ok) {
        const searchData = await searchRes.json().catch(() => null);
        const coins = searchData?.coins || [];
        if (coins.length > 0) {
          const targetSym = (tokenSymbol || '').toUpperCase();
          const targetName = (tokenName || '').toLowerCase();

          let matchedCoin = coins.find((c: any) => targetSym && c.symbol?.toUpperCase() === targetSym);
          if (!matchedCoin && targetName) {
            matchedCoin = coins.find((c: any) => c.name?.toLowerCase() === targetName);
          }
          if (!matchedCoin) {
            matchedCoin = coins[0];
          }

          if (matchedCoin?.id) {
            // Attempt to fetch coin details for full market data
            try {
              const coinRes = await fetch(
                `https://api.coingecko.com/api/v3/coins/${matchedCoin.id}?localization=false&tickers=false&community_data=false&developer_data=false`
              ).catch(() => null);

              if (coinRes && coinRes.ok) {
                const coinData = await coinRes.json().catch(() => null);
                if (coinData) {
                  const m = coinData.market_data;
                  return {
                    name: coinData.name || matchedCoin.name,
                    symbol: (coinData.symbol || matchedCoin.symbol || '').toUpperCase(),
                    logoUrl: coinData.image?.large || coinData.image?.small || matchedCoin.large || matchedCoin.thumb || undefined,
                    priceUsd: m?.current_price?.usd || undefined,
                    priceChange24h: m?.price_change_percentage_24h || undefined,
                    marketCapUsd: m?.market_cap?.usd || undefined,
                    circulatingSupply: m?.circulating_supply || undefined,
                    totalSupplyCG: m?.total_supply || m?.max_supply || undefined,
                    maxSupplyCG: m?.max_supply || undefined,
                  };
                }
              }
            } catch {}

            // If direct coin lookup fails (e.g. rate limit), return what search provided
            return {
              name: matchedCoin.name,
              symbol: (matchedCoin.symbol || '').toUpperCase(),
              logoUrl: matchedCoin.large || matchedCoin.thumb || undefined,
            };
          }
        }
      }
    }
  } catch (err) {
    console.warn('[API] CoinGecko supply fetch error:', err);
  }
  return null;
}

export interface BlockchainLookupResult {
  blockchain: string;
  chainId: string;
  blockchainType: string;
  tokenStandard: string;
  source: string;
  name?: string;
  symbol?: string;
}

/**
 * Frontend Blockchain Lookup: Identifies the exact blockchain for a token address
 * so the frontend can automatically switch the active network before dispatching the JSON to backend.
 */
export async function lookupBlockchainForToken(
  rawAddress: string,
  preferredChainId: ChainId = '137'
): Promise<BlockchainLookupResult> {
  const address = (rawAddress || '').trim();
  if (!address) {
    const defaultInfo = getChainInfo(preferredChainId);
    return {
      blockchain: defaultInfo.name,
      chainId: String(defaultInfo.id || preferredChainId),
      blockchainType: isEvmChain(preferredChainId) ? 'evm' : 'unknown',
      tokenStandard: isEvmChain(preferredChainId) ? 'ERC-20' : 'token',
      source: 'default',
    };
  }

  // 1. Non-EVM syntax inspection
  if (isTonAddress(address)) {
    return {
      blockchain: 'TON Network',
      chainId: 'ton',
      blockchainType: 'ton',
      tokenStandard: 'Jetton',
      source: 'address_pattern',
    };
  }

  if (isXrplAddress(address)) {
    return {
      blockchain: 'XRP Ledger',
      chainId: 'mainnet',
      blockchainType: 'xrpl',
      tokenStandard: 'issued_asset',
      source: 'address_pattern',
    };
  }

  if (isSolanaAddress(address)) {
    return {
      blockchain: 'Solana',
      chainId: 'solana',
      blockchainType: 'solana',
      tokenStandard: 'SPL',
      source: 'address_pattern',
    };
  }

  if (isTronAddress(address)) {
    return {
      blockchain: 'TRON',
      chainId: 'mainnet',
      blockchainType: 'tron',
      tokenStandard: 'TRC-20',
      source: 'address_pattern',
    };
  }

  if (isPolkadotAddress(address)) {
    return {
      blockchain: 'Polkadot Network',
      chainId: 'polkadot',
      blockchainType: 'polkadot',
      tokenStandard: 'Substrate Asset',
      source: 'address_pattern',
    };
  }

  if (isCosmosAddress(address)) {
    return {
      blockchain: 'Cosmos Hub',
      chainId: 'cosmos',
      blockchainType: 'cosmos',
      tokenStandard: 'IBC Token',
      source: 'address_pattern',
    };
  }

  if (isNearAddress(address)) {
    return {
      blockchain: 'NEAR Protocol',
      chainId: 'near',
      blockchainType: 'near',
      tokenStandard: 'NEP-141',
      source: 'address_pattern',
    };
  }

  if (isAptosOrSuiAddress(address)) {
    return {
      blockchain: 'Move Ecosystem',
      chainId: 'sui',
      blockchainType: 'sui',
      tokenStandard: 'Coin',
      source: 'address_pattern',
    };
  }

  // 2. Multi-Chain Address Search: Look up exact blockchain via DexScreener liquidity index
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`);
    let data = res.ok ? await res.json() : null;

    if (!data || !data.pairs || data.pairs.length === 0) {
      const searchRes = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${address}`).catch(() => null);
      if (searchRes && searchRes.ok) {
        data = await searchRes.json().catch(() => null);
      }
    }

    if (data && data.pairs && data.pairs.length > 0) {
      const sorted = [...data.pairs].sort(
        (a: any, b: any) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0)
      );
      const topPair = sorted[0];
      const rawChainId = (topPair.chainId || '').toLowerCase().trim();
      const resolved = resolveNetworkFromProviderChainId(rawChainId, address, preferredChainId);
      
      const chainLogoCandidate = topPair.info?.imageUrl || topPair.baseToken?.imageUrl;
      const cachedLogo = getCachedChainLogo(resolved.chainId) || chainLogoCandidate;

      // Register discovered chain dynamically
      registerDynamicChain(resolved.chainId, {
        name: resolved.blockchainName,
        symbol: topPair.baseToken?.symbol || resolved.chainId.toUpperCase(),
        type: resolved.blockchainType === 'evm' ? 'evm' : 'other',
        themeColor: '#10B981',
        dexScreenerChain: rawChainId,
      });

      storeDynamicChain({
        id: resolved.chainId,
        name: resolved.blockchainName,
        symbol: topPair.baseToken?.symbol || resolved.chainId.toUpperCase(),
        tokenStandard: resolved.tokenStandard,
        logoUrl: cachedLogo,
        dexScreenerChain: rawChainId,
        type: resolved.blockchainType === 'evm' ? 'evm' : 'other',
      });

      // Background logo fetch
      if (!cachedLogo) {
        void fetchChainLogoInBackground(resolved.chainId, resolved.blockchainName, topPair.baseToken?.symbol);
      }

      return {
        blockchain: resolved.blockchainName,
        chainId: resolved.chainId,
        blockchainType: resolved.blockchainType,
        tokenStandard: resolved.tokenStandard,
        name: topPair.baseToken?.name,
        symbol: topPair.baseToken?.symbol?.toUpperCase(),
        source: 'dexscreener_lookup',
      };
    }
  } catch (err) {
    console.warn('[lookupBlockchainForToken] DexScreener lookup error:', err);
  }

  // 3. If standard EVM address format (0x + 40 hex chars)
  if (/^0x[a-fA-F0-9]{40}$/.test(address)) {
    const prefInfo = getChainInfo(preferredChainId);
    const isEvm = isEvmChain(preferredChainId);
    return {
      blockchain: prefInfo.name,
      chainId: String(prefInfo.id || preferredChainId),
      blockchainType: isEvm ? 'evm' : 'unknown',
      tokenStandard: isEvm ? 'ERC-20' : 'token',
      source: 'preferred_chain',
    };
  }

  // 4. Non-EVM Fallback (Unknown blockchain != invalid asset)
  return {
    blockchain: 'Multi-Chain Asset',
    chainId: 'custom',
    blockchainType: 'non_evm',
    tokenStandard: 'Asset Identifier',
    source: 'generic_detector',
  };
}

export interface BackendUploadPayload {
  blockchain: string;
  chainId: string | number;
  contractAddress: string;
  name: string;
  symbol: string;
  decimals?: number;
  totalSupply?: string;
  logoUrl?: string;
  websiteUrl?: string;
  twitterUrl?: string;
  telegramUrl?: string;
}

/**
 * Sends token submission to the Backend Upload Workflow:
 * POST /api/upload-token
 */
export async function uploadTokenToBackend(
  payload: BackendUploadPayload,
  accessToken?: string
): Promise<any> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const res = await fetch('/api/upload-token', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errJson = await res.json().catch(() => null);
    throw new Error(errJson?.error?.message || `Backend upload returned status ${res.status}`);
  }

  return await res.json();
}

