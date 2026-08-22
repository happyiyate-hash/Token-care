export interface LogoQualityCheck {
  id: string;
  name: string;
  score: number;
  maxScore: number;
  status: 'passed' | 'warning' | 'failed';
  details: string;
}

export interface GeometryAnalysis {
  shapeScore: number;
  rating: 'PERFECT' | 'GOOD' | 'NEEDS_OPTIMIZATION' | 'POOR';
  aspectRatio: number;
  isSquare: boolean;
  boundingBox: { minX: number; maxX: number; minY: number; maxY: number; width: number; height: number };
  centerAlignment: { horizontalPct: number; verticalPct: number; isCentered: boolean };
  marginsPct: { top: number; bottom: number; left: number; right: number };
  canvasCoveragePct: number;
  touchesEdge: boolean;
  symmetryPct: number;
  autoFixAvailable: boolean;
  details: string[];
}

export interface LogoPipelineStatus {
  fileValidated: boolean;
  boundariesDetected: boolean;
  autoCropped: boolean;
  autoCentered: boolean;
  resizedToStandard: boolean;
  compressedOptimized: boolean;
  renderingVerified: boolean;
  originalSizeBytes: number;
  optimizedSizeBytes: number;
  originalSizeFormatted: string;
  optimizedSizeFormatted: string;
  compressionRatioPct: number;
  outputDimensions: string;
  status: 'Ready' | 'Needs Processing' | 'Rejected';
}

export interface LogoVerificationReport {
  logoUrl: string;
  hasLogo: boolean;
  score: number;
  rating: 'EXCELLENT' | 'GOOD' | 'POOR' | 'REJECTED';
  isValid: boolean;
  failureReason?: string;
  dimensions: { width: number; height: number; aspectRatio: number };
  geometry: GeometryAnalysis;
  pipeline: LogoPipelineStatus;
  checks: {
    fileValidation: LogoQualityCheck;
    resolution: LogoQualityCheck;
    sharpness: LogoQualityCheck;
    compression: LogoQualityCheck;
    background: LogoQualityCheck;
    borderPadding: LogoQualityCheck;
    colorQuality: LogoQualityCheck;
    aiClassification: LogoQualityCheck;
    similarity: LogoQualityCheck;
    ocrConsistency: LogoQualityCheck;
    rendering: LogoQualityCheck;
  };
  summaryBadges: string[];
  timestamp: string;
}

const IMAGE_TIMEOUT_MS = 10000;

export function formatByteSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function dataUrlByteLength(dataUrl: string): number {
  if (!dataUrl.startsWith('data:')) return 0;
  const comma = dataUrl.indexOf(',');
  if (comma < 0) return 0;
  const payload = dataUrl.slice(comma + 1);
  if (/;base64/i.test(dataUrl.slice(0, comma))) return Math.floor((payload.length * 3) / 4) - (payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0);
  try { return new TextEncoder().encode(decodeURIComponent(payload)).length; } catch { return 0; }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Could not read image blob.'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Resolve a remote image into a browser-local data URL when CORS permits it.
 * If the source blocks fetch/CORS, the original URL is returned so the browser
 * can still attempt normal rendering. Pixel analysis will never invent results.
 */
export async function downloadAndPrepareImageSource(inputSource: string): Promise<string> {
  const source = inputSource.trim();
  if (!source || source.startsWith('data:') || source.startsWith('blob:')) return source;
  if (!/^https?:\/\//i.test(source) || typeof fetch === 'undefined') return source;

  try {
    const response = await fetch(source, { mode: 'cors', cache: 'force-cache' });
    if (!response.ok) return source;
    const blob = await response.blob();
    if (!blob.type.startsWith('image/')) return source;
    return await blobToDataUrl(blob);
  } catch {
    return source;
  }
}

export function computePerceptualHash(ctx: CanvasRenderingContext2D, width: number, height: number): string {
  try {
    const sampleCanvas = document.createElement('canvas');
    sampleCanvas.width = 8;
    sampleCanvas.height = 8;
    const sCtx = sampleCanvas.getContext('2d');
    if (!sCtx) return '';
    sCtx.drawImage(ctx.canvas, 0, 0, width, height, 0, 0, 8, 8);
    const data = sCtx.getImageData(0, 0, 8, 8).data;
    const lums: number[] = [];
    let total = 0;
    for (let i = 0; i < data.length; i += 4) {
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      lums.push(lum);
      total += lum;
    }
    const avg = total / lums.length;
    return lums.map((v) => (v >= avg ? '1' : '0')).join('');
  } catch {
    return '';
  }
}

export function calculateHashSimilarity(hash1: string, hash2: string): number {
  if (!hash1 || !hash2 || hash1.length !== hash2.length) return 0;
  let matches = 0;
  for (let i = 0; i < hash1.length; i += 1) if (hash1[i] === hash2[i]) matches += 1;
  return matches / hash1.length;
}

function cornerColor(pixels: Uint8ClampedArray, w: number, h: number): [number, number, number] {
  const points = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]];
  let r = 0, g = 0, b = 0;
  for (const [x, y] of points) {
    const i = (y * w + x) * 4;
    r += pixels[i]; g += pixels[i + 1]; b += pixels[i + 2];
  }
  return [r / 4, g / 4, b / 4];
}

function pixelIsContent(pixels: Uint8ClampedArray, i: number, bg: [number, number, number], transparent: boolean): boolean {
  const a = pixels[i + 3];
  if (transparent) return a > 24;
  const diff = Math.abs(pixels[i] - bg[0]) + Math.abs(pixels[i + 1] - bg[1]) + Math.abs(pixels[i + 2] - bg[2]);
  return a > 24 && diff > 36;
}

export function analyzeLogoGeometry(pixels: Uint8ClampedArray, w: number, h: number): GeometryAnalysis {
  const bg = cornerColor(pixels, w, h);
  const cornerAlpha = [0, (w - 1) * 4, (h - 1) * w * 4, ((h - 1) * w + (w - 1)) * 4].map((i) => pixels[i + 3]);
  const transparent = cornerAlpha.some((a) => a < 180);

  let minX = w, maxX = -1, minY = h, maxY = -1, count = 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      if (!pixelIsContent(pixels, i, bg, transparent)) continue;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      count += 1;
    }
  }

  const noContent = count === 0;
  if (noContent) {
    minX = 0; maxX = Math.max(0, w - 1); minY = 0; maxY = Math.max(0, h - 1);
  }

  const boxW = Math.max(1, maxX - minX + 1);
  const boxH = Math.max(1, maxY - minY + 1);
  const aspectRatio = w / Math.max(1, h);
  const isSquare = Math.abs(aspectRatio - 1) <= 0.01;

  const boxCenterX = minX + boxW / 2;
  const boxCenterY = minY + boxH / 2;
  const canvasCenterX = w / 2;
  const canvasCenterY = h / 2;
  const xOffsetPct = Math.abs(boxCenterX - canvasCenterX) / Math.max(1, canvasCenterX) * 100;
  const yOffsetPct = Math.abs(boxCenterY - canvasCenterY) / Math.max(1, canvasCenterY) * 100;
  const isCentered = xOffsetPct <= 3 && yOffsetPct <= 3;
  const horizontalPct = Math.max(0, Math.round(100 - xOffsetPct));
  const verticalPct = Math.max(0, Math.round(100 - yOffsetPct));

  const top = minY / h * 100;
  const bottom = (h - 1 - maxY) / h * 100;
  const left = minX / w * 100;
  const right = (w - 1 - maxX) / w * 100;
  const touchesEdge = minX <= 1 || minY <= 1 || maxX >= w - 2 || maxY >= h - 2;
  const coverage = Math.round((boxW * boxH) / (w * h) * 100);

  let leftMass = 0, rightMass = 0, topMass = 0, bottomMass = 0;
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      const i = (y * w + x) * 4;
      if (!pixelIsContent(pixels, i, bg, transparent)) continue;
      if (x < w / 2) leftMass += 1; else rightMass += 1;
      if (y < h / 2) topMass += 1; else bottomMass += 1;
    }
  }
  const symmetryX = 1 - Math.abs(leftMass - rightMass) / Math.max(1, leftMass + rightMass);
  const symmetryY = 1 - Math.abs(topMass - bottomMass) / Math.max(1, topMass + bottomMass);
  const symmetryPct = Math.round(Math.max(0, Math.min(1, (symmetryX + symmetryY) / 2)) * 100);

  const squareScore = Math.max(0, 100 - Math.min(100, Math.abs(aspectRatio - 1) * 250));
  const centerScore = Math.max(0, 100 - Math.max(xOffsetPct, yOffsetPct) * 8);
  const edgeScore = touchesEdge ? 45 : Math.min(100, Math.round(Math.min(top, bottom, left, right) * 12 + 40));
  const coverageScore = coverage >= 35 && coverage <= 90 ? 100 : coverage < 35 ? Math.round(coverage / 35 * 100) : Math.max(0, 100 - (coverage - 90) * 10);
  const shapeScore = Math.round(squareScore * 0.4 + centerScore * 0.3 + edgeScore * 0.15 + coverageScore * 0.15);

  const rating: GeometryAnalysis['rating'] = shapeScore >= 95 ? 'PERFECT' : shapeScore >= 80 ? 'GOOD' : shapeScore >= 60 ? 'NEEDS_OPTIMIZATION' : 'POOR';
  const details: string[] = [];
  details.push(isSquare ? `Canvas is square (${w}×${h})` : `Canvas is not square (${w}×${h}, ${aspectRatio.toFixed(3)}:1)`);
  details.push(isCentered ? 'Content is centered within 3% tolerance' : `Content offset H:${xOffsetPct.toFixed(1)}% V:${yOffsetPct.toFixed(1)}%`);
  details.push(touchesEdge ? 'Content touches the image edge' : `Edge margins T:${top.toFixed(1)}% B:${bottom.toFixed(1)}% L:${left.toFixed(1)}% R:${right.toFixed(1)}%`);
  details.push(`Content bounding-box coverage: ${coverage}%`);

  return {
    shapeScore,
    rating,
    aspectRatio,
    isSquare,
    boundingBox: { minX, maxX, minY, maxY, width: boxW, height: boxH },
    centerAlignment: { horizontalPct, verticalPct, isCentered },
    marginsPct: { top: Math.round(top), bottom: Math.round(bottom), left: Math.round(left), right: Math.round(right) },
    canvasCoveragePct: coverage,
    touchesEdge,
    symmetryPct,
    autoFixAvailable: !isSquare || !isCentered || touchesEdge,
    details,
  };
}

function makeCheck(id: string, name: string, score: number, maxScore: number, details: string): LogoQualityCheck {
  const normalized = Math.max(0, Math.min(maxScore, Math.round(score)));
  return {
    id,
    name,
    score: normalized,
    maxScore,
    status: normalized >= maxScore * 0.8 ? 'passed' : normalized >= maxScore * 0.5 ? 'warning' : 'failed',
    details,
  };
}

function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function analyzeSharpness(pixels: Uint8ClampedArray, w: number, h: number): { score: number; variance: number } {
  const values: number[] = [];
  for (let y = 1; y < h - 1; y += 2) {
    for (let x = 1; x < w - 1; x += 2) {
      const c = (y * w + x) * 4;
      const center = luminance(pixels[c], pixels[c + 1], pixels[c + 2]);
      const left = luminance(pixels[c - 4], pixels[c - 3], pixels[c - 2]);
      const right = luminance(pixels[c + 4], pixels[c + 5], pixels[c + 6]);
      const up = luminance(pixels[c - w * 4], pixels[c - w * 4 + 1], pixels[c - w * 4 + 2]);
      const down = luminance(pixels[c + w * 4], pixels[c + w * 4 + 1], pixels[c + w * 4 + 2]);
      values.push(Math.abs(4 * center - left - right - up - down));
    }
  }
  if (!values.length) return { score: 0, variance: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  const score = Math.round(Math.max(0, Math.min(100, (Math.log1p(variance) / Math.log1p(1200)) * 100)));
  return { score, variance };
}

function emptyReport(logoUrl: string, reason: string): LogoVerificationReport {
  const zero = (id: string, name: string, maxScore: number, details = 'Not available') => ({ id, name, score: 0, maxScore, status: 'failed' as const, details });
  return {
    logoUrl,
    hasLogo: Boolean(logoUrl),
    score: 0,
    rating: 'REJECTED',
    isValid: false,
    failureReason: reason,
    dimensions: { width: 0, height: 0, aspectRatio: 0 },
    geometry: {
      shapeScore: 0, rating: 'POOR', aspectRatio: 0, isSquare: false,
      boundingBox: { minX: 0, maxX: 0, minY: 0, maxY: 0, width: 0, height: 0 },
      centerAlignment: { horizontalPct: 0, verticalPct: 0, isCentered: false },
      marginsPct: { top: 0, bottom: 0, left: 0, right: 0 }, canvasCoveragePct: 0,
      touchesEdge: false, symmetryPct: 0, autoFixAvailable: false, details: [reason],
    },
    pipeline: {
      fileValidated: false, boundariesDetected: false, autoCropped: false, autoCentered: false,
      resizedToStandard: false, compressedOptimized: false, renderingVerified: false,
      originalSizeBytes: 0, optimizedSizeBytes: 0, originalSizeFormatted: '0 KB', optimizedSizeFormatted: '0 KB',
      compressionRatioPct: 0, outputDimensions: 'Unknown', status: 'Rejected',
    },
    checks: {
      fileValidation: zero('file', 'File Format Validation', 10, reason),
      resolution: zero('resolution', 'Resolution Analysis', 20),
      sharpness: zero('sharpness', 'Sharpness Analysis', 20),
      compression: zero('compression', 'Compression Quality', 10),
      background: zero('background', 'Background Analysis', 10),
      borderPadding: zero('border', 'Border & Geometry', 10),
      colorQuality: zero('color', 'Color & Contrast', 10),
      aiClassification: zero('ai', 'Logo Structure Analysis', 20),
      similarity: zero('similarity', 'Similarity Detection', 10),
      ocrConsistency: zero('ocr', 'OCR Symbol Check', 5, 'OCR is not available in the local analyzer'),
      rendering: zero('rendering', 'Rendering & Decoding Test', 10),
    },
    summaryBadges: [],
    timestamp: new Date().toISOString(),
  };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (/^https?:\/\//i.test(src)) img.crossOrigin = 'anonymous';
    const timer = window.setTimeout(() => reject(new Error('Image load timed out.')), IMAGE_TIMEOUT_MS);
    img.onload = () => { window.clearTimeout(timer); resolve(img); };
    img.onerror = () => { window.clearTimeout(timer); reject(new Error('Image could not be decoded or rendered.')); };
    img.src = src;
  });
}

export async function autoOptimizeLogoCanvas(logoUrl: string): Promise<{
  optimizedUrl: string;
  previousShapeScore?: number;
  newShapeScore: number;
  originalBytes: number;
  optimizedBytes: number;
  compressionRatioPct: number;
  message: string;
}> {
  const prepared = await downloadAndPrepareImageSource(logoUrl);
  const img = await loadImage(prepared);
  const origW = img.naturalWidth || img.width;
  const origH = img.naturalHeight || img.height;
  if (!origW || !origH) throw new Error('Image has no usable dimensions.');

  const source = document.createElement('canvas');
  source.width = origW; source.height = origH;
  const sourceCtx = source.getContext('2d', { willReadFrequently: true });
  if (!sourceCtx) throw new Error('Canvas context unavailable.');
  sourceCtx.drawImage(img, 0, 0);
  const sourceData = sourceCtx.getImageData(0, 0, origW, origH);
  const geometry = analyzeLogoGeometry(sourceData.data, origW, origH);

  const box = geometry.boundingBox;
  const target = 512;
  const padding = 56;
  const inner = target - padding * 2;
  const scale = Math.min(inner / box.width, inner / box.height);
  const drawW = Math.max(1, Math.round(box.width * scale));
  const drawH = Math.max(1, Math.round(box.height * scale));

  const out = document.createElement('canvas');
  out.width = target; out.height = target;
  const outCtx = out.getContext('2d');
  if (!outCtx) throw new Error('Output canvas context unavailable.');
  outCtx.clearRect(0, 0, target, target);
  outCtx.imageSmoothingEnabled = true;
  outCtx.imageSmoothingQuality = 'high';
  outCtx.drawImage(source, box.minX, box.minY, box.width, box.height, Math.round((target - drawW) / 2), Math.round((target - drawH) / 2), drawW, drawH);

  const optimizedUrl = out.toDataURL('image/png');
  const originalBytes = prepared.startsWith('data:') ? dataUrlByteLength(prepared) : 0;
  const optimizedBytes = dataUrlByteLength(optimizedUrl);
  const compressionRatioPct = originalBytes > 0 ? Math.round(((originalBytes - optimizedBytes) / originalBytes) * 100) : 0;
  const optimizedPixels = outCtx.getImageData(0, 0, target, target).data;
  const newGeometry = analyzeLogoGeometry(optimizedPixels, target, target);

  return {
    optimizedUrl,
    previousShapeScore: geometry.shapeScore,
    newShapeScore: newGeometry.shapeScore,
    originalBytes,
    optimizedBytes,
    compressionRatioPct,
    message: `Processed to 512×512 with measured ${newGeometry.shapeScore}/100 geometry quality.`,
  };
}

export function createFallbackGeometry(width: number, height: number): GeometryAnalysis {
  const aspectRatio = width / Math.max(1, height);
  const isSquare = Math.abs(aspectRatio - 1) <= 0.01;
  return {
    shapeScore: isSquare ? 50 : Math.max(0, 50 - Math.abs(aspectRatio - 1) * 50),
    rating: isSquare ? 'NEEDS_OPTIMIZATION' : 'POOR',
    aspectRatio,
    isSquare,
    boundingBox: { minX: 0, maxX: Math.max(0, width - 1), minY: 0, maxY: Math.max(0, height - 1), width, height },
    centerAlignment: { horizontalPct: 50, verticalPct: 50, isCentered: false },
    marginsPct: { top: 0, bottom: 0, left: 0, right: 0 },
    canvasCoveragePct: 100,
    touchesEdge: true,
    symmetryPct: 0,
    autoFixAvailable: true,
    details: ['Pixel-level geometry unavailable because the image source blocks canvas access.'],
  };
}

export async function verifyTokenLogo(
  logoUrl: string | undefined,
  tokenSymbol: string = 'TOK',
  existingLogos: string[] = []
): Promise<LogoVerificationReport> {
  if (!logoUrl?.trim()) return emptyReport('', 'No logo source was provided.');

  const preparedUrl = await downloadAndPrepareImageSource(logoUrl.trim());
  let img: HTMLImageElement;
  try {
    img = await loadImage(preparedUrl);
  } catch (error) {
    return emptyReport(preparedUrl, error instanceof Error ? error.message : 'Image could not be rendered.');
  }

  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;
  if (!width || !height) return emptyReport(preparedUrl, 'Image rendered without usable dimensions.');

  const aspectRatio = width / height;
  const extension = preparedUrl.startsWith('data:image/') ? preparedUrl.slice(11, preparedUrl.indexOf(';') > 0 ? preparedUrl.indexOf(';') : preparedUrl.length) : ((preparedUrl.split('?')[0].match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase());
  const validFormat = ['png', 'webp', 'jpeg', 'jpg', 'svg+xml', 'svg', 'avif'].includes(extension);

  const canvas = document.createElement('canvas');
  const maxAnalysisSize = 512;
  const scale = Math.min(1, maxAnalysisSize / Math.max(width, height));
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  let pixels: Uint8ClampedArray | null = null;
  let geometry = createFallbackGeometry(width, height);
  let pixelAnalysisAvailable = false;
  try {
    if (!ctx) throw new Error('Canvas context unavailable.');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    geometry = analyzeLogoGeometry(pixels, canvas.width, canvas.height);
    pixelAnalysisAvailable = true;
  } catch {
    pixelAnalysisAvailable = false;
  }

  const sourceBytes = preparedUrl.startsWith('data:') ? dataUrlByteLength(preparedUrl) : 0;
  const resolutionRatio = Math.min(width, height) / 512;
  const resolutionScore = Math.round(Math.max(0, Math.min(20, resolutionRatio >= 1 ? 20 : resolutionRatio * 20)));
  const resolutionText = `${width}×${height}px${resolutionRatio >= 1 ? ' — 512px target met' : ' — below recommended 512px source resolution'}`;

  let sharpnessScore = 0;
  let sharpnessText = 'Pixel analysis unavailable.';
  if (pixels) {
    const sharp = analyzeSharpness(pixels, canvas.width, canvas.height);
    sharpnessScore = Math.round(sharp.score / 100 * 20);
    sharpnessText = `Measured edge variance ${sharp.variance.toFixed(1)} (${Math.round(sharp.score)}/100 sharpness)`;
  }

  let alphaRatio = 0;
  let avgLum = 0;
  let lumVariance = 0;
  if (pixels) {
    const total = canvas.width * canvas.height;
    let lumSum = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      alphaRatio += pixels[i + 3] < 200 ? 1 : 0;
      lumSum += luminance(pixels[i], pixels[i + 1], pixels[i + 2]);
    }
    avgLum = lumSum / total;
    for (let i = 0; i < pixels.length; i += 4) {
      const lum = luminance(pixels[i], pixels[i + 1], pixels[i + 2]);
      lumVariance += (lum - avgLum) ** 2;
    }
    alphaRatio /= total;
    lumVariance /= total;
  }

  const fileCheck = makeCheck('file', 'File Format Validation', validFormat ? 10 : 5, 10, validFormat ? `Detected ${extension.toUpperCase() || 'image'} format.` : 'Image rendered, but its MIME/extension could not be confidently identified.');
  const resolutionCheck = makeCheck('resolution', 'Resolution Analysis', resolutionScore, 20, resolutionText);
  const sharpnessCheck = makeCheck('sharpness', 'Sharpness & Blur Analysis', sharpnessScore, 20, sharpnessText);

  let compressionScore = 5;
  let compressionText = 'Original byte size unavailable for this remote source.';
  if (sourceBytes > 0) {
    compressionScore = sourceBytes <= 256 * 1024 ? 10 : sourceBytes <= 1024 * 1024 ? 8 : 5;
    compressionText = `Measured source size ${formatByteSize(sourceBytes)}.`;
  }
  const compressionCheck = makeCheck('compression', 'Compression / File Size', compressionScore, 10, compressionText);

  const backgroundScore = !pixelAnalysisAvailable ? 0 : alphaRatio >= 0.05 ? 10 : 8;
  const backgroundCheck = makeCheck('background', 'Background Analysis', backgroundScore, 10, !pixelAnalysisAvailable ? 'Pixel access unavailable; background cannot be honestly classified.' : alphaRatio >= 0.05 ? `${Math.round(alphaRatio * 100)}% pixels have transparency.` : 'Image has an opaque background.');

  const borderScore = pixelAnalysisAvailable ? Math.round(geometry.shapeScore / 100 * 10) : 0;
  const borderCheck = makeCheck('border', 'Border & Geometry', borderScore, 10, pixelAnalysisAvailable ? geometry.details.join(' • ') : 'Pixel-level geometry unavailable.');

  const colorScore = !pixelAnalysisAvailable ? 0 : (avgLum < 4 || avgLum > 251) ? 4 : Math.max(5, Math.min(10, Math.round((Math.min(100, Math.sqrt(lumVariance) * 2) / 100) * 5 + 5)));
  const colorCheck = makeCheck('color', 'Color & Contrast', colorScore, 10, !pixelAnalysisAvailable ? 'Pixel access unavailable.' : `Average luminance ${avgLum.toFixed(1)}; luminance variation ${Math.sqrt(lumVariance).toFixed(1)}.`);

  const structureScore = pixelAnalysisAvailable ? Math.round((geometry.shapeScore * 0.7) + (geometry.symmetryPct * 0.3)) / 5 : 0;
  const structureCheck = makeCheck('ai', 'Logo Structure Analysis', structureScore, 20, pixelAnalysisAvailable ? `Heuristic structure analysis: geometry ${geometry.shapeScore}/100, symmetry ${geometry.symmetryPct}/100. This is not an AI claim.` : 'No pixel analysis available; structure was not guessed.');

  let maxSimilarity = 0;
  if (pixelAnalysisAvailable && ctx) {
    const hash = computePerceptualHash(ctx, canvas.width, canvas.height);
    for (const existing of existingLogos) maxSimilarity = Math.max(maxSimilarity, calculateHashSimilarity(hash, existing));
  }
  const similarityScore = existingLogos.length === 0 ? 5 : maxSimilarity > 0.92 ? 0 : maxSimilarity > 0.80 ? 5 : 10;
  const similarityCheck = makeCheck('similarity', 'Similarity Detection', similarityScore, 10, existingLogos.length === 0 ? 'No comparison hashes were supplied.' : maxSimilarity > 0 ? `Highest visual hash similarity: ${Math.round(maxSimilarity * 100)}%.` : 'No matching logo hash found.');

  const ocrCheck = makeCheck('ocr', 'OCR Symbol Check', 0, 5, `OCR is not available in the local analyzer; ticker “${tokenSymbol}” was not falsely marked as verified.`);
  const renderingCheck = makeCheck('rendering', 'Rendering & Decoding Test', 10, 10, `Browser decoded the image successfully at ${width}×${height}px.`);

  const checks = { fileValidation: fileCheck, resolution: resolutionCheck, sharpness: sharpnessCheck, compression: compressionCheck, background: backgroundCheck, borderPadding: borderCheck, colorQuality: colorCheck, aiClassification: structureCheck, similarity: similarityCheck, ocrConsistency: ocrCheck, rendering: renderingCheck };
  const weightedChecks = Object.values(checks).filter((c) => c.id !== 'ocr' || c.score > 0);
  const availableMax = weightedChecks.reduce((sum, c) => sum + c.maxScore, 0);
  const earned = weightedChecks.reduce((sum, c) => sum + c.score, 0);
  const totalScore = availableMax > 0 ? Math.round((earned / availableMax) * 100) : 0;

  const rating: LogoVerificationReport['rating'] = totalScore >= 90 ? 'EXCELLENT' : totalScore >= 75 ? 'GOOD' : totalScore >= 50 ? 'POOR' : 'REJECTED';
  const isValid = renderingCheck.status === 'passed' && totalScore >= 70 && pixelAnalysisAvailable;
  const failureReason = !pixelAnalysisAvailable ? 'Image renders, but browser pixel access is unavailable, so geometry and quality cannot be fully verified.' : totalScore < 70 ? `Measured logo quality is ${totalScore}/100.` : undefined;

  const optimizedUrl = pixelAnalysisAvailable ? (() => { try { return canvas.toDataURL('image/png'); } catch { return ''; } })() : '';
  const optimizedBytes = optimizedUrl ? dataUrlByteLength(optimizedUrl) : 0;
  const compressionRatioPct = sourceBytes > 0 && optimizedBytes > 0 ? Math.round(((sourceBytes - optimizedBytes) / sourceBytes) * 100) : 0;
  const pipeline: LogoPipelineStatus = {
    fileValidated: fileCheck.status !== 'failed',
    boundariesDetected: pixelAnalysisAvailable,
    autoCropped: pixelAnalysisAvailable && geometry.autoFixAvailable === false,
    autoCentered: pixelAnalysisAvailable && geometry.centerAlignment.isCentered,
    resizedToStandard: width === 512 && height === 512,
    compressedOptimized: optimizedBytes > 0 && sourceBytes > 0 && optimizedBytes < sourceBytes,
    renderingVerified: renderingCheck.status === 'passed',
    originalSizeBytes: sourceBytes,
    optimizedSizeBytes: optimizedBytes,
    originalSizeFormatted: formatByteSize(sourceBytes),
    optimizedSizeFormatted: formatByteSize(optimizedBytes),
    compressionRatioPct: Math.max(0, compressionRatioPct),
    outputDimensions: `${width} × ${height}${width === 512 && height === 512 ? ' PNG' : ''}`,
    status: isValid ? 'Ready' : pixelAnalysisAvailable ? 'Needs Processing' : 'Rejected',
  };

  const summaryBadges: string[] = [];
  if (geometry.isSquare) summaryBadges.push('1:1 Square');
  if (geometry.centerAlignment.isCentered) summaryBadges.push('Centered Emblem');
  if (resolutionScore >= 18) summaryBadges.push('High Resolution');
  if (sharpnessScore >= 16) summaryBadges.push('Sharp Image');
  if (pixelAnalysisAvailable && alphaRatio >= 0.05) summaryBadges.push('Transparent Background');
  if (structureCheck.score >= 16) summaryBadges.push('Logo Structure Verified');
  if (renderingCheck.score === 10) summaryBadges.push('Successfully Rendered');
  if (similarityCheck.score === 10) summaryBadges.push('No Similar Logo Found');

  return {
    logoUrl: preparedUrl,
    hasLogo: true,
    score: totalScore,
    rating,
    isValid,
    failureReason,
    dimensions: { width, height, aspectRatio },
    geometry,
    pipeline,
    checks,
    summaryBadges,
    timestamp: new Date().toISOString(),
  };
}
