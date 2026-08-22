import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cpu,
  Image as ImageIcon,
  Layers,
  Loader2,
  Maximize2,
  ShieldCheck,
  Star,
  Upload,
  XCircle,
} from 'lucide-react';
import { LogoVerificationReport, LogoQualityCheck } from '../services/logoVerificationEngine';
import { LogoStatus } from '../types';

interface LogoVerificationCardProps {
  report: LogoVerificationReport | null;
  logoStatus?: LogoStatus;
  onLogoStatusChange?: (status: LogoStatus) => void;
  onUpdateLogo: (logoUrl: string) => void;
  isSkeleton?: boolean;
  stage?: number;
  isVerifying?: boolean;
}

const step = (ok: boolean, label: string, note?: string) => ({ ok, label, note });

const Metric: React.FC<{ label: string; value: string; good: boolean }> = ({ label, value, good }) => (
  <div className="bg-[#0B0E17] border border-zinc-800/70 rounded p-1.5 min-w-0">
    <div className="text-zinc-500 text-[7px] uppercase tracking-wide">{label}</div>
    <div className={`mt-0.5 text-[8.5px] font-semibold truncate flex items-center gap-1 ${good ? 'text-zinc-200' : 'text-amber-300'}`}>
      {good ? <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400 shrink-0" /> : <AlertTriangle className="w-2.5 h-2.5 text-amber-400 shrink-0" />}
      <span>{value}</span>
    </div>
  </div>
);

export const LogoVerificationCard: React.FC<LogoVerificationCardProps> = ({
  report,
  logoStatus = 'checking',
  onLogoStatusChange,
  onUpdateLogo,
  isSkeleton = false,
  stage = 4,
  isVerifying = false,
}) => {
  const [showDetails, setShowDetails] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [showUrlForm, setShowUrlForm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const logoUrl = report?.logoUrl || '';
  const hasLogo = Boolean(logoUrl);
  const score = report?.score ?? 0;
  const geometry = report?.geometry;
  const pipeline = report?.pipeline;
  const checksList: LogoQualityCheck[] = report ? Object.values(report.checks) : [];

  // The token overview card owns the real visible <img>. It announces a
  // successful browser render through the tokencare:logo-rendered event.
  // This card must never perform a second hidden render check because that can
  // fail for a URL that the visible token renderer successfully displays.
  useEffect(() => {
    if (!hasLogo || !onLogoStatusChange || typeof window === 'undefined') return;

    const handleRendered = (event: Event) => {
      const detail = (event as CustomEvent<{ url?: string }>).detail;
      if (detail?.url && detail.url === logoUrl) {
        onLogoStatusChange('valid');
      }
    };

    window.addEventListener('tokencare:logo-rendered', handleRendered);
    return () => window.removeEventListener('tokencare:logo-rendered', handleRendered);
  }, [hasLogo, logoUrl, onLogoStatusChange]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || file.size === 0) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      if (result) {
        onUpdateLogo(result);
        onLogoStatusChange?.('checking');
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const url = urlInput.trim();
    if (!url) return;
    onUpdateLogo(url);
    onLogoStatusChange?.('checking');
    setUrlInput('');
    setShowUrlForm(false);
  };

  const stars = Math.round(score / 20);
  const pipelineSteps = pipeline
    ? [
        step(pipeline.boundariesDetected, 'Bounds', pipeline.boundariesDetected ? 'Measured from pixels' : 'Pixel access unavailable'),
        step(pipeline.autoCentered, 'Centered', pipeline.autoCentered ? 'Measured' : 'Not confirmed'),
        step(pipeline.resizedToStandard, '512×512', pipeline.resizedToStandard ? 'Exact source size' : 'Source differs'),
        step(pipeline.compressedOptimized, 'Optimized', pipeline.compressedOptimized ? `Measured -${pipeline.compressionRatioPct}%` : 'No measured optimization'),
        step(pipeline.renderingVerified, 'Rendered', pipeline.renderingVerified ? 'Browser decoded image' : 'Render analysis unavailable'),
      ]
    : [];

  const renderVerified = logoStatus === 'valid';

  return (
    <div className="bg-[#0B0E17]/90 border border-zinc-800/90 rounded-lg p-2 space-y-2 shadow-md backdrop-blur-sm text-white">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/png,image/svg+xml,image/webp,image/jpeg,image/avif,image/*"
        className="hidden"
      />

      <div className="flex items-center justify-between border-b border-zinc-800/80 pb-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <Cpu className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <div className="min-w-0">
            <h3 className="text-[10px] font-black text-white uppercase tracking-wider flex items-center gap-1 truncate">
              Logo Quality Engine
              {hasLogo && (
                <span className={`text-[8px] px-1.5 py-0.5 rounded font-mono font-bold border flex items-center gap-1 ${
                  renderVerified
                    ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
                    : 'bg-amber-500/10 border-amber-500/40 text-amber-400'
                }`}>
                  {logoStatus === 'checking' && <><Loader2 className="w-2.5 h-2.5 animate-spin" /><span>CHECKING</span></>}
                  {renderVerified && <><Check className="w-2.5 h-2.5" /><span>RENDERED</span></>}
                </span>
              )}
            </h3>
            <span className="text-[9px] text-zinc-400 block truncate">
              {renderVerified
                ? 'Logo rendered in the token card. No download or conversion is required.'
                : hasLogo
                ? 'Waiting for the actual visible token logo to render…'
                : 'No token logo URL was supplied'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button type="button" onClick={() => fileInputRef.current?.click()} className="px-2 py-0.5 bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-semibold rounded text-[9px] flex items-center gap-1">
            <Upload className="w-2.5 h-2.5" />{hasLogo ? 'Change' : 'Upload'}
          </button>
          <button type="button" onClick={() => setShowUrlForm((v) => !v)} className="text-[8px] text-zinc-400 hover:text-white underline">
            {showUrlForm ? 'Cancel' : 'URL'}
          </button>
        </div>
      </div>

      {showUrlForm && (
        <form onSubmit={handleUrlSubmit} className="flex items-center gap-1 bg-[#06080F] p-1 rounded border border-zinc-800">
          <input type="url" placeholder="Paste logo URL (https://...)" value={urlInput} onChange={(e) => setUrlInput(e.target.value)} className="flex-1 bg-zinc-900 border border-zinc-800 text-white text-[9px] rounded px-1.5 py-0.5 focus:outline-none focus:border-emerald-500" />
          <button type="submit" className="px-2 py-0.5 bg-emerald-500 text-black text-[9px] font-bold rounded">Apply</button>
        </form>
      )}

      {stage < 3 || isSkeleton || isVerifying ? (
        <div className="bg-[#06080F] border border-zinc-800/80 p-3 rounded-md text-center text-[9px] text-zinc-400">
          <Loader2 className="w-4 h-4 mx-auto mb-1 animate-spin text-emerald-400" />
          Checking the token logo…
        </div>
      ) : !hasLogo || !report ? (
        <div className="bg-[#06080F] border border-zinc-800/80 rounded-md p-3 text-center space-y-1.5">
          <ImageIcon className="w-5 h-5 mx-auto text-emerald-400" />
          <div className="font-bold text-white text-[10px] uppercase">No Token Logo</div>
          <p className="text-[9px] text-zinc-400">The token can still be saved without a logo.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="bg-[#06080F] border border-zinc-800/80 p-1.5 rounded-md space-y-1">
            <div className="flex items-center justify-between border-b border-zinc-800/60 pb-1">
              <span className="text-[9px] font-bold text-white flex items-center gap-1"><Layers className="w-3 h-3 text-emerald-400" />Measured Pipeline</span>
              <span className="text-[8px] font-mono text-zinc-400">{pipeline?.outputDimensions || `${report.dimensions.width} × ${report.dimensions.height}`}</span>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-1 text-[8px]">
              {pipelineSteps.map((item) => (
                <div key={item.label} className={`p-1 rounded border flex items-center gap-0.5 ${item.ok ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300' : 'bg-zinc-900/60 border-zinc-800 text-zinc-500'}`} title={item.note}>
                  {item.ok ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <AlertTriangle className="w-2.5 h-2.5 text-zinc-600" />}
                  <span className="font-medium truncate">{item.label}</span>
                </div>
              ))}
            </div>
            {pipeline && pipeline.originalSizeBytes > 0 && pipeline.optimizedSizeBytes > 0 ? (
              <div className="bg-[#0B0E17] border border-zinc-800 p-1 rounded flex items-center justify-between text-[8.5px] gap-1">
                <div className="flex items-center gap-1"><span className="text-zinc-400">{pipeline.originalSizeFormatted}</span><span className="text-zinc-600">→</span><span className="font-mono font-bold text-emerald-400">{pipeline.optimizedSizeFormatted}</span></div>
                <span className="text-zinc-400 font-mono">{pipeline.compressionRatioPct}% measured</span>
              </div>
            ) : (
              <div className="text-[8px] text-zinc-500 px-1">Remote source size was not downloaded or converted; original URL is preserved.</div>
            )}
          </div>

          <div className="bg-[#06080F] border border-zinc-800/80 p-1.5 rounded-md space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-semibold text-zinc-200 flex items-center gap-1">Quality <span className="flex">{[1,2,3,4,5].map((s) => <Star key={s} className={`w-3.5 h-3.5 ${s <= stars ? 'fill-amber-400 text-amber-400' : 'text-zinc-700'}`} />)}</span></span>
              <span className={`font-mono font-bold text-xs ${score >= 85 ? 'text-emerald-400' : score >= 70 ? 'text-amber-400' : 'text-rose-400'}`}>{score}/100</span>
            </div>
            <div className="w-full bg-zinc-800/90 h-1.5 rounded-full overflow-hidden border border-zinc-700/50">
              <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500" style={{ width: `${Math.max(0, Math.min(100, score))}%` }} />
            </div>
            {renderVerified && <div className="text-[8px] text-emerald-300">✓ Actual visible token logo rendered. No logo fix or download is required.</div>}
          </div>

          {geometry && (
            <div className="bg-[#06080F] border border-zinc-800/80 p-1.5 rounded-md space-y-1">
              <div className="flex items-center justify-between border-b border-zinc-800/60 pb-1">
                <span className="text-[9px] font-bold text-zinc-300 flex items-center gap-1"><Maximize2 className="w-3 h-3 text-teal-400" />Geometry</span>
                <span className="font-mono text-[9px] font-bold text-teal-400">Shape {geometry.shapeScore}/100</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 text-[8.5px]">
                <Metric label="Aspect" value={geometry.isSquare ? '1:1 Square' : `${geometry.aspectRatio.toFixed(2)}:1`} good={geometry.isSquare} />
                <Metric label="Center" value={`H:${geometry.centerAlignment.horizontalPct}% V:${geometry.centerAlignment.verticalPct}%`} good={geometry.centerAlignment.isCentered} />
                <Metric label="Fill" value={`${geometry.canvasCoveragePct}%`} good={geometry.canvasCoveragePct >= 35 && geometry.canvasCoveragePct <= 90} />
                <Metric label="Margins" value={geometry.touchesEdge ? 'Touches Edge' : 'Clean'} good={!geometry.touchesEdge} />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 text-[8.5px]">
            {report.summaryBadges.map((badge) => <div key={badge} className="bg-[#06080F] border border-zinc-800/60 px-1.5 py-0.5 rounded flex items-center gap-1"><CheckCircle2 className="w-2.5 h-2.5 text-emerald-400 shrink-0" /><span className="text-zinc-300 truncate">{badge}</span></div>)}
          </div>

          <button type="button" onClick={() => setShowDetails((v) => !v)} className="w-full bg-[#06080F] border border-zinc-800/70 rounded p-1.5 flex items-center justify-between text-[8.5px] text-zinc-300">
            <span className="flex items-center gap-1"><ShieldCheck className="w-3 h-3 text-emerald-400" />View Full {checksList.length}-Point Audit</span>
            {showDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          {showDetails && (
            <div className="space-y-1">
              {checksList.map((check) => (
                <div key={check.id} className="bg-[#06080F] border border-zinc-800/70 rounded p-1.5 flex items-start justify-between gap-2 text-[8px]">
                  <div className="min-w-0"><div className="font-semibold text-zinc-200">{check.name}</div><div className="text-zinc-500 mt-0.5">{check.details}</div></div>
                  <span className={`font-mono shrink-0 ${check.status === 'passed' ? 'text-emerald-400' : check.status === 'warning' ? 'text-amber-400' : 'text-rose-400'}`}>{check.score}/{check.maxScore}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
