import React, { useState, useEffect } from 'react';
import { resolveTokenLogoWithFallback } from '../services/tokenLogoResolver';

interface MultiProviderTokenLogoProps {
  src?: string;
  chain?: string;
  address?: string;
  symbol?: string;
  alt: string;
  className?: string;
  onLogoResolved?: (workingUrl: string, provider: string) => void;
}

/**
 * MultiProviderTokenLogo
 *
 * Implements resilient multi-provider token logo rendering:
 * 1. Tries primary src if provided.
 * 2. If primary src fails or is missing, triggers parallel background resolution across
 *    DexScreener, CoinGecko, GeckoTerminal, on-chain registries, and CDN.
 * 3. Deterministically renders the first working candidate.
 * 4. If all fail, renders a graceful, clean token badge fallback (never a broken icon).
 */
export const MultiProviderTokenLogo: React.FC<MultiProviderTokenLogoProps> = ({
  src,
  chain = 'polygon',
  address,
  symbol,
  alt,
  className = 'w-9 h-9 rounded-full object-cover',
  onLogoResolved,
}) => {
  const [activeUrl, setActiveUrl] = useState<string | undefined>(src);
  const [isResolving, setIsResolving] = useState<boolean>(false);
  const [hasFailedAll, setHasFailedAll] = useState<boolean>(false);

  useEffect(() => {
    setActiveUrl(src);
    setHasFailedAll(!src && !address);
  }, [src, address]);

  const handleImageError = async () => {
    // If we have an address and haven't run fallback resolver yet, trigger it now
    if (address && !isResolving) {
      setIsResolving(true);
      try {
        const result = await resolveTokenLogoWithFallback(address, chain, undefined, undefined, symbol);
        if (result.isValid && result.logoUrl && result.logoUrl !== activeUrl) {
          setActiveUrl(result.logoUrl);
          setIsResolving(false);
          onLogoResolved?.(result.logoUrl, result.logoSource);
          return;
        }
      } catch {}
      setIsResolving(false);
      setHasFailedAll(true);
    } else {
      setHasFailedAll(true);
    }
  };

  if (hasFailedAll || !activeUrl) {
    const initials = (symbol || alt || '•').slice(0, 3).toUpperCase();
    return (
      <div
        className={`${className} bg-zinc-900 border border-zinc-800 flex items-center justify-center select-none text-emerald-400 font-mono text-[10px] font-bold`}
        title={alt || symbol}
      >
        <span>{initials}</span>
      </div>
    );
  }

  return (
    <img
      src={activeUrl}
      alt={alt || symbol || 'Token Logo'}
      className={className}
      onError={handleImageError}
      loading="lazy"
    />
  );
};
export default MultiProviderTokenLogo;
