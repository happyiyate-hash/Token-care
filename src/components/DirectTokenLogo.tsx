import React, { useState, useEffect, useRef } from 'react';

interface DirectTokenLogoProps {
  src?: string;
  alt: string;
  className?: string;
}

/**
 * DirectTokenLogo Component
 *
 * Implements strict direct-display with cache-busting retries and NO fallbacks:
 * - Attempt 1: Load the original logo URL.
 * - Attempt 2: If onError fires, request the URL again with `?v=retry1` (or `&v=retry1`).
 * - Attempt 3: If onError fires again, request the URL with `?v=retry2` (or `&v=retry2`).
 * - If still failing after 3 attempts: Stop. No fallback network logo or placeholder image.
 * - Succeeded loads fire onLoad and freeze cleanly with zero further requests.
 */
export const DirectTokenLogo: React.FC<DirectTokenLogoProps> = ({
  src,
  alt,
  className = 'w-9 h-9 rounded-full object-cover',
}) => {
  const [attempt, setAttempt] = useState<number>(0);
  const [isLoaded, setIsLoaded] = useState<boolean>(false);
  const [isFailed, setIsFailed] = useState<boolean>(false);
  const prevSrcRef = useRef<string | undefined>(src);

  useEffect(() => {
    if (prevSrcRef.current !== src) {
      prevSrcRef.current = src;
      setAttempt(0);
      setIsLoaded(false);
      setIsFailed(!src);
    }
  }, [src]);

  if (!src || isFailed) {
    return (
      <div
        className={`${className} bg-zinc-900 border border-zinc-800 flex items-center justify-center`}
        title={alt}
      >
        <span className="text-[10px] font-bold text-zinc-600 uppercase select-none">
          {alt ? alt.slice(0, 2) : '•'}
        </span>
      </div>
    );
  }

  // Generate URL for current retry attempt
  const getAttemptUrl = (originalUrl: string, attemptIndex: number): string => {
    if (attemptIndex === 0) return originalUrl;
    // For data URLs or blob URLs, retry without query parameters
    if (originalUrl.startsWith('data:') || originalUrl.startsWith('blob:')) {
      return originalUrl;
    }
    const separator = originalUrl.includes('?') ? '&' : '?';
    return `${originalUrl}${separator}v=retry${attemptIndex}`;
  };

  const currentUrl = getAttemptUrl(src, attempt);

  const handleError = () => {
    if (isLoaded) return;
    if (attempt < 2) {
      // Retry attempt 1 -> attempt 2 (cache-busting retry1 / retry2)
      setAttempt((prev) => prev + 1);
    } else {
      // 3 attempts reached (0, 1, 2) -> stop and mark failed with NO fallback
      setIsFailed(true);
    }
  };

  const handleLoad = () => {
    setIsLoaded(true);
  };

  return (
    <img
      src={currentUrl}
      alt={alt}
      className={className}
      onError={handleError}
      onLoad={handleLoad}
      loading="lazy"
    />
  );
};
