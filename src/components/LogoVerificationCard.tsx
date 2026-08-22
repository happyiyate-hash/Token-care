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
  Scissors,
  ShieldCheck,
  Star,
  Target,
  Upload,
  XCircle,
} from 'lucide-react';
import { LogoVerificationReport, LogoQualityCheck } from '../services/logoVerificationEngine';
import { LogoCropModal } from './LogoCropModal';
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
  const [showCropModal, setShowCropModal] = useState(false);
  const [fixSuccessMessage, setFixSuccessMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const logoUrl = report?.logoUrl || '';
  const hasLogo = Boolean(logoUrl);
  const score = report?.score ?? 0;
  const geometry = report?.geometry;
  const pipeline = report?.pipeline;
  const checksList: LogoQualityCheck[] = report ? Object.values(report.checks) : [];

  useEffect(() => {
    if (!logoUrl) return;
    if (logoStatus === 'checking') return;
    // The verification engine is the source of truth. The browser event below is
    // only used as a final renderability check and never upgrades a failed report.
    if (report?.pipeline.renderingVerified && report.isValid && onLogoStatusChange) {
      onLogoStatusChange('valid');
    }
  }, [logoUrl, logoStatus, report, onLogoStatusChange]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || file.size === 0) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      if (result) {
        onUpdateLogo(result);
        onLogoStatusChange?.('checking');
        setFixSuccessMessage(null);
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
    setFixSuccessMessage(null);
  };

  const handleLogoLoad = (event: React.SyntheticEvent<HTMLImageElement>) => {
    const img = event.currentTarget;
    if (img.naturalWidth > 0 && img.naturalHeight > 0) onLogoStatusChange?.('valid');
    else onLogoStatusChange?.('invalid');
  };

  const handleLogoError = () => onLogoStatusChange?.('invalid');

  const stars = Math.round(score / 20);
  const pipelineSteps = pipeline
    ? [
        step(pipeline.boundariesDetected, 'Bounds', pipeline.boundariesDetected ? 'Measured from pixels' : 'Unavailable'),
        step(pipeline.autoCentered, 'Centered', pipeline.autoCentered ? 'Measured' : 'Needs adjustment'),
        step(pipeline.resizedToStandard, '512×512', pipeline.resizedToStandard ? 'Exact source size' : 'Source differs'),
        step(pipeline.compressedOptimized, 'Optimized', pipeline.compressedOptimized ? `Measured -${pipeline.compressionRatioPct}%` : 'No measured compression'),
        step(pipeline.renderingVerified, 'Rendered', pipeline.renderingVerified ? 'Browser decoded image' : 'Render failed'),
      ]
    : [];

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
                  logoStatus === 'valid' && report?.isValid
                    ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
                    : logoStatus === 'checking'
                    ? 'bg-amber-500/10 border-amber-500/40 text-amber-400'
                    : 'bg-rose-500/10 border-rose-500/40 text-rose-400'
                }`}>
                  {logoStatus === 'checking' && <><Loader2 className="w-2.5 h-2.5 animate-spin" /><span>CHECKING</span></>}
                  {logoStatus === 'valid' && report?.isValid && <><Check className="w-2.5 h-2.5" /><span>VERIFIED</span></>}
                  {(logoStatus === 'invalid' || (logoStatus === 'valid' && !report?.isValid)) && <><XCircle className="w-2.5 h-2.5" /><span>QUALITY ISSUE</span></>}
                </span>
              )}
            </h3>
            <span className="text-[9px] text-zinc-400 block truncate">
              {hasLogo ? (report?.failureReason || 'Measured from the actual image pixels') : 'Upload token logo for automated analysis'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {hasLogo && score < 90 && (
            <button type="button" onClick={() => setShowCropModal(true)} className="px-2 py-0.5 bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold rounded text-[9px] flex items-center gap-1">
              <Scissors className="w-2.5 h-2.5" />Fix
            </button>
          )}
          <button type="button" onClick={() => fileInputRef.current?.click()} className="px-2 py-0.5 bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-semibold rounded text-[9px] flex items-center gap-1">
            <Upload className="w-2.5 h-2.5" />{hasLogo ? 'Change' : 'Upload'}
          </button>
          <button type="button" onClick={() => setShowUrlForm((v) => !v)} className="text-[8px] text-zinc-400 hover:text-white underline">
            {showUrlForm ? 'Cancel' : 'URL'}
          </button>
        </div>
      </div>

      {hasLogo && (
        <div className="hidden">
          <img src={logoUrl} alt="Token logo render validation" onLoad={handleLogoLoad} onError={handleLogoError} />
        </div>
      )}

      {showUrlForm && (
        <form onSubmit={handleUrlSubmit} className="flex items-center gap-1 bg-[#06080F] p-1 rounded border border-zinc-800">
          <input type="url" placeholder="Paste logo URL (https://...)" value={urlInput} onChange={(e) => setUrlInput(e.target.value)} className="flex-1 bg-zinc-900 border border-zinc-800 text-white text-[9px] rounded px-1.5 py-0.5 focus:outline-none focus:border-emerald-500" />
          <button type="submit" className="px-2 py-0.5 bg-emerald-500 text-black text-[9px] font-bold rounded">Apply</button>
        </form>
      )}

      {fixSuccessMessage && (
        <div className="bg-teal-950/50 border border-teal-500/40 rounded p-1.5 text-[9px] text-teal-200">
          <span className="font-bold">Optimization: </span>{fixSuccessMessage}
        </div>
      )}

      {stage < 3 || isSkeleton || isVerifying ? (
        <div className="bg-[#06080F] border border-zinc-800/80 p-3 rounded-md text-center text-[9px] text-zinc-400">
          <Loader2 className="w-4 h-4 mx-auto mb-1 animate-spin text-emerald-400" />
          Measuring the actual logo image…
        </div>
      ) : !hasLogo || !report ? (
        <div className="bg-[#06080F] border border-zinc-800/80 rounded-md p-3 text-center space-y-1.5">
          <ImageIcon className="w-5 h-5 mx-auto text-emerald-400" />
          <div className="font-bold text-white text-[10px] uppercase">Upload Token Project Logo</div>
          <p className="text-[9px] text-zinc-400">The engine will inspect the actual image rather than assuming quality.</p>
          <button type="button" onClick={() => fileInputRef.current?.click()} className="px-2.5 py-1 bg-emerald-500 text-black font-bold rounded text-[9.5px] inline-flex items-center gap-1">
            <Upload className="w-3 h-3" />Select Logo File
          </button>
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="bg-[#06080F] border border-zinc-800/80 p-1.5 rounded-md space-y-1">
            <div className="flex items-center justify-between border-b border-zinc-800/60 pb-1">
              <span className="text-[9px] font-bold text-white flex items-center gap-1"><Layers className="w-3 h-3 text-emerald-400" />Measured Pipeline</span>
              <span className="text-[8px] font-mono text-zinc-400">{pipeline?.outputDimensions || 'Unknown'}</span>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-1 text-[8px]">
              {pipelineSteps.map((item) => (
                <div key={item.label} className={`p-1 rounded border flex items-center gap-0.5 ${item.ok ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300' : 'bg-zinc-900/60 border-zinc-800 text-zinc-500'}`} title={item.note}>
                  {item.ok ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <AlertTriangle className="w-2.5 h-2.5 text-zinc-600" />}
                  <span className="font-medium truncate">{item.label}</span>
                </div>
              ))}
            </div>
            <div className="bg-[#0B0E17] border border-zinc-800 p-1 rounded flex items-center justify-between text-[8.5px] gap-1">
              <div className="flex items-center gap-1"><span className="text-zinc-400">{pipeline?.originalSizeFormatted || 'Unknown'}</span><span className="text-zinc-600">→</span><span className="font-mono font-bold text-emerald-400">{pipeline?.optimizedSizeBytes ? pipeline.optimizedSizeFormatted : 'Not optimized'}</span></div>
              <span className="text-zinc-400 font-mono">{pipeline?.compressionRatioPct ? `${pipeline.compressionRatioPct > 0 ? '-' : '+'}${Math.abs(pipeline.compressionRatioPct)}%` : 'No measured reduction'}</span>
            </div>
          </div>

          <div className="bg-[#06080F] border border-zinc-800/80 p-1.5 rounded-md space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-semibold text-zinc-200 flex items-center gap-1">Quality <span className="flex">{[1,2,3,4,5].map((s) => <Star key={s} className={`w-3.5 h-3.5 ${s <= stars ? 'fill-amber-400 text-amber-400' : 'text-zinc-700'}`} />)}</span></span>
              <span className={`font-mono font-bold text-xs ${score >= 85 ? 'text-emerald-400' : score >= 70 ? 'text-amber-400' : 'text-rose-400'}`}>{score}/100</span>
            </div>
            <div className="w-full bg-zinc-800/90 h-1.5 rounded-full overflow-hidden border border-zinc-700/50">
              <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500" style={{ width: `${Math.max(0, Math.min(100, score))}%` }} />
            </div>
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

          {report.failureReason && (
            <div className="bg-amber-950/40 border border-amber-500/40 rounded-md p-1.5 flex items-center gap-1 text-[9px]">
              <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
              <span className="text-amber-200">{report.failureReason}</span>
            </div>
          )}

          <button type="button" onClick={() => setShowDetails((v) => !v)} className="text-[8.5px] text-zinc-400 hover:text-white flex items-center gap-1 pt-0.5">
            <span>{showDetails ? 'Hide 11-Point Audit' : 'View Full 11-Point Audit'}</span>{showDetails ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
          </button>
          {showDetails && <div className="space-y-0.5 text-[8.5px] max-h-[160px] overflow-y-auto pr-0.5">
            {checksList.map((check) => <div key={check.id} className="bg-[#06080F] border border-zinc-800/60 p-1 rounded flex items-center justify-between gap-1">
              <div className="flex items-center gap-1 min-w-0">{check.status === 'passed' ? <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400 shrink-0" /> : check.status === 'warning' ? <AlertTriangle className="w-2.5 h-2.5 text-amber-400 shrink-0" /> : <XCircle className="w-2.5 h-2.5 text-rose-400 shrink-0" />}<span className="text-zinc-300 truncate">{check.name}</span></div>
              <span className="font-mono font-bold text-zinc-300 shrink-0">{check.score}/{check.maxScore}</span>
            </div>)}
          </div>}
        </div>
      )}

      {report?.logoUrl && <LogoCropModal isOpen={showCropModal} onClose={() => setShowCropModal(false)} logoUrl={report.logoUrl} onApplyCrop={(croppedUrl, successMsg) => { onUpdateLogo(croppedUrl); setFixSuccessMessage(successMsg); }} />}
    </div>
  );
};

const Metric: React.FC<{ label: string; value: string; good: boolean }> = ({ label, value, good }) => (
  <div className="bg-[#0B0E17] border border-zinc-800/80 p-1 rounded space-y-0.5">
    <div className="text-zinc-400 flex items-center gap-0.5"><Target className="w-2.5 h-2.5" /><span>{label}</span></div>
    <div className="font-bold text-zinc-200 flex items-center justify-between gap-1"><span className="truncate">{value}</span>{good ? <Check className="w-2.5 h-2.5 text-emerald-400 shrink-0" /> : <AlertTriangle className="w-2.5 h-2.5 text-amber-400 shrink-0" />}</div>
  </div>
);
