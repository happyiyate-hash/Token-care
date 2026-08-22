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
 * Resilient token-logo renderer. The actual <img> onLoad event is the source of
 * truth for whether a logo rendered in the application UI. A remote image does
 * not need to be downloaded into a data URL for it to be considered usable.
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

  const announceRendered = (url: string) => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('tokencare:logo-rendered', {
          detail: { url: src || url, renderedUrl: url, address, symbol },
        })
      );
    }
  };

  const handleImageLoad = (event: React.SyntheticEvent<HTMLImageElement>) => {
    const img = event.currentTarget;
    if (img.naturalWidth > 0 && img.naturalHeight > 0 && activeUrl) {
      announceRendered(activeUrl);
    }
  };

  const handleImageError = async () => {
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
      onLoad={handleImageLoad}
      onError={handleImageError}
      loading="lazy"
    />
  );
};
export default MultiProviderTokenLogo;
