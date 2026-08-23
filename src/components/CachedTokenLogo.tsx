import React, { useState, useEffect } from 'react';
import { getCachedLogoDataUrl, logoDownloadQueue } from '../services/logoCacheService';
import { NEUTRAL_TOKEN_FALLBACK } from '../services/chainLogos';
import { resolveTokenLogoWithFallback } from '../services/tokenLogoResolver';

interface CachedTokenLogoProps {
  src?: string;
  chain: string;
  address: string;
  symbol?: string;
  name?: string;
  alt: string;
  className?: string;
  fallbackSrc?: string;
}

export const CachedTokenLogo: React.FC<CachedTokenLogoProps> = ({
  src,
  chain,
  address,
  symbol,
  name,
  alt,
  className = 'w-9 h-9 rounded-full object-cover',
  fallbackSrc = NEUTRAL_TOKEN_FALLBACK,
}) => {
  const [currentSrc, setCurrentSrc] = useState<string>(() => {
    const cached = getCachedLogoDataUrl(chain, address, symbol);
    if (cached && !cached.startsWith('hash:')) {
      return cached;
    }
    return src || fallbackSrc;
  });

  const [hasError, setHasError] = useState(false);
  const [retryAttempt, setRetryAttempt] = useState(0);

  useEffect(() => {
    setHasError(false);
    if (!src && !address && !symbol) {
      setCurrentSrc(fallbackSrc);
      return;
    }

    // Check if we already have a cached dataURL (shared between Tokens and Explore)
    const cached = getCachedLogoDataUrl(chain, address, symbol);
    if (cached && !cached.startsWith('hash:')) {
      setCurrentSrc(cached);
      return;
    }

    // Use current URL if provided
    if (src) {
      setCurrentSrc(src);

      // Enqueue for sequential background download and local storage caching
      logoDownloadQueue.enqueue(chain, address, src, symbol, (downloadedDataUrl) => {
        if (downloadedDataUrl && !downloadedDataUrl.startsWith('hash:')) {
          setCurrentSrc(downloadedDataUrl);
        }
      });
    } else if (address || symbol) {
      // If no src but address/symbol provided, attempt multi-provider resolution in background
      resolveTokenLogoWithFallback(address, chain, undefined, undefined, symbol, name || alt).then((res) => {
        if (res.isValid && res.logoUrl) {
          setCurrentSrc(res.logoUrl);
        }
      }).catch(() => {});
    }
  }, [src, chain, address, symbol, name, alt, retryAttempt]);

  const handleError = async () => {
    if (retryAttempt === 0 && src && !src.startsWith('data:')) {
      // Retry attempt 1: Multi-provider fallback resolution across DexScreener, CoinGecko, GeckoTerminal, etc.
      setRetryAttempt(1);
      if (address || symbol) {
        try {
          const res = await resolveTokenLogoWithFallback(address, chain, undefined, undefined, symbol, name || alt);
          if (res.isValid && res.logoUrl && res.logoUrl !== currentSrc) {
            setCurrentSrc(res.logoUrl);
            return;
          }
        } catch {}
      }

      // Retry attempt 1b: Image proxy
      const proxiedUrl = `https://wsrv.nl/?url=${encodeURIComponent(src)}&w=96&h=96&fit=cover&output=png`;
      setCurrentSrc(proxiedUrl);
    } else if (!hasError) {
      setHasError(true);
      setCurrentSrc(fallbackSrc);
    }
  };

  return (
    <img
      src={currentSrc}
      alt={alt}
      className={className}
      onError={handleError}
      loading="lazy"
    />
  );
};

