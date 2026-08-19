import React, { useState, useEffect } from 'react';
import { getCachedLogoDataUrl, logoDownloadQueue } from '../services/logoCacheService';
import { NEUTRAL_TOKEN_FALLBACK } from '../services/chainLogos';

interface CachedTokenLogoProps {
  src?: string;
  chain: string;
  address: string;
  alt: string;
  className?: string;
  fallbackSrc?: string;
}

export const CachedTokenLogo: React.FC<CachedTokenLogoProps> = ({
  src,
  chain,
  address,
  alt,
  className = 'w-9 h-9 rounded-full object-cover',
  fallbackSrc = NEUTRAL_TOKEN_FALLBACK,
}) => {
  const [currentSrc, setCurrentSrc] = useState<string>(() => {
    const cached = getCachedLogoDataUrl(chain, address);
    if (cached && !cached.startsWith('hash:')) {
      return cached;
    }
    return src || fallbackSrc;
  });

  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (!src || !address) return;

    // Check if we already have a cached dataURL
    const cached = getCachedLogoDataUrl(chain, address);
    if (cached && !cached.startsWith('hash:')) {
      setCurrentSrc(cached);
      return;
    }

    // Enqueue for sequential, one-by-one background download and storage
    logoDownloadQueue.enqueue(chain, address, src, (downloadedDataUrl) => {
      if (downloadedDataUrl && !downloadedDataUrl.startsWith('hash:')) {
        setCurrentSrc(downloadedDataUrl);
      }
    });
  }, [src, chain, address]);

  const handleError = () => {
    if (!hasError) {
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
