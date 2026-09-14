/**
 * Logo Download & LocalStorage Caching Service
 *
 * Rules:
 * - Direct image fetching with automatic CDN proxy fallback for CORS bypass.
 * - Converts downloaded logos to compact local storage base64 data URLs.
 * - Reads instantly from localStorage on subsequent visits so zero network requests are made.
 * - Queue processes logos sequentially so CPU and browser threads remain responsive.
 */

import { safeSetItem } from './storage';

const LOGO_STORAGE_PREFIX = 'tokencare_logo_v6_';
const MAX_RETRY_COUNT = 2;
const MAX_CACHED_IMAGE_SIZE_PX = 96;

// In-memory quick lookup cache
const memoryLogoCache = new Map<string, string>();

/**
 * Clears old or corrupted logo cache keys from localStorage
 */
export function clearAllLogoCaches(): void {
  try {
    memoryLogoCache.clear();
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (
        k &&
        (k.startsWith('tokencare_cached_logo_') ||
          k.startsWith('tokencare_logo_') ||
          k.startsWith('tokencare_explore_directory_'))
      ) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  } catch (e) {
    console.warn('[LogoCache] Error clearing old logo caches:', e);
  }
}

// Auto-run one-time cache purge for clean slate
if (typeof window !== 'undefined') {
  try {
    if (!localStorage.getItem('tokencare_logo_v6_cleared')) {
      clearAllLogoCaches();
      localStorage.setItem('tokencare_logo_v6_cleared', 'true');
    }
  } catch {}
}

/**
 * Gets storage key for a logo by token contract address and chain
 */
function getLogoStorageKey(chain: string, address: string, symbol?: string): string {
  const normChain = (chain || 'polygon').toLowerCase().trim();
  const normAddr = (address || '').toLowerCase().trim();
  return `${LOGO_STORAGE_PREFIX}${normChain}_${normAddr}`;
}

/**
 * Gets secondary storage key by symbol for tokens that might share symbols
 */
function getLogoSymbolStorageKey(chain: string, symbol: string): string {
  const normChain = (chain || 'polygon').toLowerCase().trim();
  const normSym = (symbol || '').toLowerCase().trim();
  return `${LOGO_STORAGE_PREFIX}sym_${normChain}_${normSym}`;
}

/**
 * Synchronously retrieves cached logo data URI from memory or localStorage.
 * Checks both address and symbol so Tokens and Explore pages share the exact same cached logos.
 */
export function getCachedLogoDataUrl(chain: string, address: string, symbol?: string): string | null {
  if (!address && !symbol) return null;
  const key = getLogoStorageKey(chain, address);
  const symKey = symbol ? getLogoSymbolStorageKey(chain, symbol) : null;

  // Check memory cache first (by address, then by symbol)
  if (memoryLogoCache.has(key)) {
    const val = memoryLogoCache.get(key);
    if (val && !val.startsWith('hash:')) return val;
  }
  if (symKey && memoryLogoCache.has(symKey)) {
    const val = memoryLogoCache.get(symKey);
    if (val && !val.startsWith('hash:')) return val;
  }

  // Check localStorage (by address, then by symbol)
  try {
    const cached = localStorage.getItem(key);
    if (cached && !cached.startsWith('hash:')) {
      memoryLogoCache.set(key, cached);
      return cached;
    }
    if (symKey) {
      const symCached = localStorage.getItem(symKey);
      if (symCached && !symCached.startsWith('hash:')) {
        memoryLogoCache.set(symKey, symCached);
        return symCached;
      }
    }
  } catch {}

  return null;
}

/**
 * Saves downloaded logo to localStorage under both address and symbol
 */
export function saveLogoToCache(chain: string, address: string, dataUrl: string, symbol?: string): void {
  if (!dataUrl || dataUrl.startsWith('hash:')) return;
  const key = getLogoStorageKey(chain, address);
  memoryLogoCache.set(key, dataUrl);
  try {
    safeSetItem(key, dataUrl);
  } catch (e) {
    console.warn('[LogoCache] Failed saving to localStorage:', e);
  }

  if (symbol) {
    const symKey = getLogoSymbolStorageKey(chain, symbol);
    memoryLogoCache.set(symKey, dataUrl);
    try {
      safeSetItem(symKey, dataUrl);
    } catch {}
  }
}

/**
 * Downloads a remote image URL, downscales it to a tiny data URL (<4KB), and returns it.
 */
async function downloadAndCompressLogo(url: string): Promise<string> {
  if (url.startsWith('data:image/')) {
    return url;
  }

  const tryLoadAndEncode = (srcUrl: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      const timeout = setTimeout(() => {
        img.src = '';
        reject(new Error('Image fetch timeout'));
      }, 6000);

      img.onload = () => {
        clearTimeout(timeout);
        try {
          const canvas = document.createElement('canvas');
          const width = img.naturalWidth || img.width || 64;
          const height = img.naturalHeight || img.height || 64;

          let targetW = MAX_CACHED_IMAGE_SIZE_PX;
          let targetH = MAX_CACHED_IMAGE_SIZE_PX;
          if (width > height) {
            targetH = Math.round((height * MAX_CACHED_IMAGE_SIZE_PX) / width);
          } else {
            targetW = Math.round((width * MAX_CACHED_IMAGE_SIZE_PX) / height);
          }

          canvas.width = Math.max(16, targetW);
          canvas.height = Math.max(16, targetH);

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(srcUrl);
            return;
          }

          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/png', 0.85);
          resolve(dataUrl);
        } catch (err) {
          // If canvas tainted, return original URL
          resolve(srcUrl);
        }
      };

      img.onerror = () => {
        clearTimeout(timeout);
        reject(new Error('Failed to load image resource'));
      };

      img.src = srcUrl;
    });
  };

  // 1. Try directly with anonymous CORS
  try {
    return await tryLoadAndEncode(url);
  } catch {
    // 2. Try with CDN proxy that sets CORS header
    const proxied = `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=96&h=96&fit=cover&output=png`;
    return await tryLoadAndEncode(proxied);
  }
}

interface LogoQueueTask {
  chain: string;
  address: string;
  symbol?: string;
  url: string;
  retryCount: number;
  onSuccess?: (dataUrl: string) => void;
}

class SequentialLogoQueue {
  private queue: LogoQueueTask[] = [];
  private isProcessing = false;
  private inFlightKeys = new Set<string>();

  public enqueue(
    chain: string,
    address: string,
    url: string,
    symbol?: string,
    onSuccess?: (dataUrl: string) => void
  ) {
    if (!url || (!address && !symbol)) return;
    const key = getLogoStorageKey(chain, address, symbol);

    // If already in local cache, call callback immediately
    const existing = getCachedLogoDataUrl(chain, address, symbol);
    if (existing) {
      onSuccess?.(existing);
      return;
    }

    if (this.inFlightKeys.has(key)) return;
    this.inFlightKeys.add(key);

    this.queue.push({
      chain,
      address,
      symbol,
      url,
      retryCount: 0,
      onSuccess,
    });

    this.processNext();
  }

  private async processNext() {
    if (this.isProcessing || this.queue.length === 0) return;
    this.isProcessing = true;

    const task = this.queue.shift()!;
    const { chain, address, symbol, url, retryCount, onSuccess } = task;
    const key = getLogoStorageKey(chain, address, symbol);

    try {
      const dataUrl = await downloadAndCompressLogo(url);
      if (dataUrl && dataUrl.startsWith('data:image/')) {
        saveLogoToCache(chain, address, dataUrl, symbol);
      }
      this.inFlightKeys.delete(key);
      if (onSuccess && dataUrl) {
        onSuccess(dataUrl);
      }
    } catch (err) {
      if (retryCount < MAX_RETRY_COUNT) {
        this.queue.push({
          ...task,
          retryCount: retryCount + 1,
        });
      } else {
        this.inFlightKeys.delete(key);
      }
    } finally {
      this.isProcessing = false;
      setTimeout(() => this.processNext(), 40);
    }
  }
}

export const logoDownloadQueue = new SequentialLogoQueue();
