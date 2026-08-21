import { SafetyAnalysis, ERC20Metadata, MarketData, ChainId } from '../types';
import { isEvmChain } from '../constants/chains';

interface RecommendationInput {
  liquidityUsd: number;
  volume24h: number;
  holdersCount: number;
  pairAgeDays: number;
  isHoneypot: boolean;
  isMintable: boolean;
  isBlacklisted: boolean;
  isRenounced: boolean;
  buyTaxPct: number;
  sellTaxPct: number;
  isLiquidityLocked: boolean;
  liquidityLockedPct: number;
  isProxy: boolean;
  isSourceVerified: boolean;
}

interface RecommendationResult {
  status: 'APPROVED' | 'NEEDS_REVIEW' | 'REJECTED';
  trustScore: number;
  recommendation: string;
  warnings: string[];
}

/**
 * Local scoring helper used by the legacy UI safety model.
 * It deliberately uses only evidence already supplied to this function;
 * provider calls belong to the multichain verifier.
 */
function evaluateTokenRecommendation(input: RecommendationInput): RecommendationResult {
  const warnings: string[] = [];
  let score = 100;

  if (input.isHoneypot) {
    score -= 60;
    warnings.push('Honeypot risk detected.');
  }
  if (input.isBlacklisted) {
    score -= 30;
    warnings.push('Blacklist or selling restriction detected.');
  }
  if (input.isMintable) {
    score -= 15;
    warnings.push('Token supply may be increased by an authorized account.');
  }
  if (!input.isRenounced) {
    score -= 5;
    warnings.push('Contract ownership is still active or could not be confirmed as renounced.');
  }
  if (input.isProxy) {
    score -= 5;
    warnings.push('Token uses an upgradeable/proxy contract.');
  }
  if (!input.isSourceVerified) {
    score -= 10;
    warnings.push('Source/security verification is unavailable or incomplete.');
  }
  if (!input.isLiquidityLocked) {
    score -= 10;
    warnings.push('Liquidity lock could not be confirmed.');
  }
  if (input.liquidityLockedPct < 50) {
    score -= 10;
    warnings.push(`Only ${input.liquidityLockedPct}% of reported liquidity is locked.`);
  }
  if (input.liquidityUsd < 5_000) {
    score -= 20;
    warnings.push('Liquidity is very low.');
  } else if (input.liquidityUsd < 20_000) {
    score -= 8;
    warnings.push('Liquidity is relatively low.');
  }
  if (input.buyTaxPct > 10 || input.sellTaxPct > 10) {
    score -= 20;
    warnings.push(`High trading tax detected (buy ${input.buyTaxPct}%, sell ${input.sellTaxPct}%).`);
  } else if (input.buyTaxPct > 5 || input.sellTaxPct > 5) {
    score -= 8;
    warnings.push(`Elevated trading tax detected (buy ${input.buyTaxPct}%, sell ${input.sellTaxPct}%).`);
  }
  if (input.holdersCount > 0 && input.holdersCount < 25) {
    score -= 5;
    warnings.push('Very limited holder coverage.');
  }
  if (input.pairAgeDays > 0 && input.pairAgeDays < 3) {
    score -= 5;
    warnings.push('Trading pair is very new.');
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const status: RecommendationResult['status'] = input.isHoneypot || input.isBlacklisted || score < 40
    ? 'REJECTED'
    : score < 70
      ? 'NEEDS_REVIEW'
      : 'APPROVED';

  return {
    status,
    trustScore: score,
    recommendation: status === 'APPROVED'
      ? 'No critical issue was identified from the available evidence.'
      : status === 'NEEDS_REVIEW'
        ? 'Review the reported warnings before interacting with this token.'
        : 'Do not rely on this token until the reported security issues are resolved or independently confirmed.',
    warnings,
  };
}

/**
 * Evaluates token safety, honeypot risk, contract flags, and generates a safety score 0-100.
 */
export async function analyzeTokenSafety(
  metadata: ERC20Metadata,
  marketData: MarketData,
  chainId: ChainId
): Promise<SafetyAnalysis> {
  const flags: SafetyAnalysis['flags'] = [];

  const isOwnershipRenounced = !!metadata.isRenounced;
  if (isOwnershipRenounced) {
    flags.push({
      type: 'pass',
      title: 'Contract Ownership Renounced',
      description: 'Owner privileges appear to be disabled.',
    });
  } else if (metadata.ownerAddress) {
    flags.push({
      type: 'warn',
      title: 'Active Contract Owner',
      description: `Owner address (${metadata.ownerAddress.slice(0, 6)}...${metadata.ownerAddress.slice(-4)}) holds admin privileges.`,
    });
  } else {
    flags.push({
      type: 'warn',
      title: 'Ownership Status Unknown',
      description: 'The available metadata does not prove that ownership is renounced.',
    });
  }

  let buyTaxPct = 0;
  let sellTaxPct = 0;
  let isHoneypot = false;
  let isMintable = false;
  let isProxy = false;
  let isOpenSource = false;
  let isLiquidityLocked = false;
  let liquidityLockedPct = 0;
  let top10HoldersPct = 0;
  let isBlacklisted = false;

  try {
    if (isEvmChain(chainId, (metadata as any)?.blockchainType)) {
      const chainMap: Record<string, string> = {
        ethereum: '1', bsc: '56', polygon: '137', arbitrum: '42161', base: '8453', optimism: '10',
        '1': '1', '137': '137', '8453': '8453', '56': '56', '10': '10', '42161': '42161',
      };
      const goPlusChainId = chainMap[String(chainId)] || String(chainId);
      const goPlusRes = await fetch(
        `https://api.gopluslabs.io/api/v1/token_security/${goPlusChainId}?contract_addresses=${metadata.address.toLowerCase()}`
      );

      if (goPlusRes.ok) {
        const goPlusData = await goPlusRes.json();
        const tokenResult = goPlusData?.result?.[metadata.address.toLowerCase()];
        if (tokenResult) {
          buyTaxPct = Math.round(parseFloat(tokenResult.buy_tax || '0') * 100);
          sellTaxPct = Math.round(parseFloat(tokenResult.sell_tax || '0') * 100);
          isHoneypot = tokenResult.is_honeypot === '1';
          isMintable = tokenResult.is_mintable === '1';
          isProxy = tokenResult.is_proxy === '1';
          isOpenSource = tokenResult.is_open_source === '1';
          isBlacklisted = tokenResult.is_blacklisted === '1' || tokenResult.cannot_sell_all === '1';

          if (Array.isArray(tokenResult.lp_holders)) {
            const lockedLp = tokenResult.lp_holders.reduce((sum: number, holder: { is_locked?: number; percent?: string }) => (
              holder.is_locked === 1 ? sum + parseFloat(holder.percent || '0') * 100 : sum
            ), 0);
            liquidityLockedPct = Math.min(100, Math.round(lockedLp));
            isLiquidityLocked = liquidityLockedPct > 50;
          }
        }
      }
    }
  } catch (err) {
    console.warn('[Security] GoPlus API unavailable:', err);
  }

  if (isHoneypot) {
    flags.push({ type: 'fail', title: 'Honeypot Risk Detected', description: 'The available security provider reports a honeypot risk.' });
  } else if (isEvmChain(chainId, (metadata as any)?.blockchainType)) {
    flags.push({ type: 'pass', title: 'Honeypot Check Passed', description: 'No honeypot was reported by the available provider.' });
  } else {
    flags.push({ type: 'warn', title: 'Honeypot Check Unavailable', description: 'This security check is not implemented for the current chain.' });
  }

  if (sellTaxPct > 10 || buyTaxPct > 10) {
    flags.push({ type: 'fail', title: `High Trading Taxes (Buy: ${buyTaxPct}%, Sell: ${sellTaxPct}%)`, description: 'High transaction taxes can materially affect trading.' });
  } else if (sellTaxPct > 0 || buyTaxPct > 0) {
    flags.push({ type: 'warn', title: `Trading Tax Applied (Buy: ${buyTaxPct}%, Sell: ${sellTaxPct}%)`, description: 'The token charges a trading fee.' });
  }

  if (isMintable) {
    flags.push({ type: 'warn', title: 'Mintable Token Function', description: 'An authorized account may be able to mint additional supply.' });
  } else if (isEvmChain(chainId, (metadata as any)?.blockchainType)) {
    flags.push({ type: 'pass', title: 'No Mint Risk Reported', description: 'The available EVM security provider reports no mintable flag.' });
  }

  if (marketData.liquidityUsd < 5000) {
    flags.push({ type: 'fail', title: `Low Liquidity Pool ($${marketData.liquidityUsd.toLocaleString()})`, description: 'Low liquidity can expose traders to severe price impact.' });
  } else if (marketData.liquidityUsd < 20000) {
    flags.push({ type: 'warn', title: `Moderate Liquidity ($${Math.round(marketData.liquidityUsd).toLocaleString()})`, description: 'Liquidity may be limited.' });
  } else {
    flags.push({ type: 'pass', title: `Deep Pool Liquidity ($${Math.round(marketData.liquidityUsd).toLocaleString()})`, description: 'Reported liquidity is relatively deep.' });
  }

  // These are intentionally unknown rather than fabricated from liquidity.
  const holdersCount = 0;
  const pairAgeDays = 0;

  const rec = evaluateTokenRecommendation({
    liquidityUsd: marketData.liquidityUsd,
    volume24h: marketData.volume24h,
    holdersCount,
    pairAgeDays,
    isHoneypot,
    isMintable,
    isBlacklisted,
    isRenounced: isOwnershipRenounced,
    buyTaxPct,
    sellTaxPct,
    isLiquidityLocked,
    liquidityLockedPct,
    isProxy,
    isSourceVerified: isOpenSource,
  });

  let rating: SafetyAnalysis['rating'] = 'SAFE';
  if (rec.status === 'REJECTED') rating = 'HIGH_RISK';
  else if (rec.status === 'NEEDS_REVIEW') rating = 'CAUTION';

  return {
    score: rec.trustScore,
    rating,
    recommendation: rec.recommendation,
    buyTaxPct,
    sellTaxPct,
    isHoneypot,
    isMintable,
    isProxy,
    isOpenSource,
    isOwnershipRenounced,
    isLiquidityLocked,
    liquidityLockedPct,
    top10HoldersPct,
    holdersCount,
    pairAgeDays,
    warnings: rec.warnings,
    flags,
  };
}
