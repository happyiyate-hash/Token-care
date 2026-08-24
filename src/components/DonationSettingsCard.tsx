import React, { useState } from 'react';
import { Check, X, Lock, Sparkles, AlertTriangle, ShieldAlert } from 'lucide-react';
import { ERC20Metadata, ChainId, LogoStatus } from '../types';
import { LogoVerificationReport } from '../services/logoVerificationEngine';

interface DonationSettingsCardProps {
  metadata: ERC20Metadata;
  selectedChain: ChainId;
  logoReport?: LogoVerificationReport | null;
  logoStatus?: LogoStatus;
  trustScore?: number;
  isAlreadySaved?: boolean;
  onSaveToken: (settings: {
    acceptDonations: boolean;
    featured: boolean;
    minDonation: number;
    maxDonation: number;
    category: string;
    description: string;
  }) => void;
  onCancel: () => void;
  isSaving: boolean;
  isVerifying?: boolean;
  stage?: number;
}

export const DonationSettingsCard: React.FC<DonationSettingsCardProps> = ({
  metadata,
  logoReport,
  logoStatus = 'checking',
  trustScore = 84,
  onSaveToken,
  onCancel,
  isSaving,
  isVerifying = false,
  stage = 4,
}) => {
  const [acceptDonations, setAcceptDonations] = useState(true);
  const [featured, setFeatured] = useState(true);
  const [minDonation, setMinDonation] = useState(1);
  const [category, setCategory] = useState('Ecosystem');
  const [customDescription, setCustomDescription] = useState(
    `${metadata.name} (${metadata.symbol}) verified token contract for community donations.`
  );

  // A remote logo is an asset URL.
  // Saving is delegated to the backend save-token API.
  let saveDisabledReason: string | null = null;
  if (!metadata.logoUrl || !metadata.logoUrl.trim()) {
    saveDisabledReason = 'Logo is required. Please upload or provide a valid token logo.';
  } else if (trustScore !== undefined && trustScore < 45) {
    saveDisabledReason = `Token trust score is too low (${trustScore}/100) to pass security review.`;
  }

  const isSaveDisabled = !!saveDisabledReason;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaveDisabled || isSaving) return;
    onSaveToken({
      acceptDonations,
      featured,
      minDonation,
      maxDonation: 100000,
      category,
      description: customDescription,
    });
  };

  const isDisabledCard = isVerifying || stage < 4;

  return (
    <form
      onSubmit={handleSubmit}
      className={`bg-[#0B0E17]/90 border border-zinc-800/90 rounded-lg p-2 space-y-2 shadow-md backdrop-blur-sm animate-in fade-in duration-300 text-white transition-all duration-300 ${
        isDisabledCard ? 'opacity-50 pointer-events-none' : 'opacity-100 pointer-events-auto'
      }`}
    >
      <div className="flex items-center justify-between border-b border-zinc-800/80 pb-1.5">
        <h3 className="text-[10px] font-black text-white uppercase tracking-wider">
          Donation Campaign Settings
        </h3>
        <span className="text-[8px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded font-semibold">
          Ready to Publish
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 text-[9px]">
        <div className="bg-[#06080F] border border-zinc-800/80 p-1.5 rounded-md flex items-center justify-between">
          <div>
            <div className="font-bold text-white text-[9.5px]">Accept Donations</div>
            <div className="text-[8px] text-zinc-400">Enable Web3 collection</div>
          </div>
          <button
            type="button"
            onClick={() => setAcceptDonations(!acceptDonations)}
            className={`w-7 h-4 rounded-full p-0.5 transition-colors cursor-pointer ${
              acceptDonations ? 'bg-emerald-500' : 'bg-zinc-700'
            }`}
          >
            <div
              className={`w-3 h-3 rounded-full bg-black transform transition-transform ${
                acceptDonations ? 'translate-x-3' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        <div className="bg-[#06080F] border border-zinc-800/80 p-1.5 rounded-md flex items-center justify-between">
          <div>
            <div className="font-bold text-white text-[9.5px] flex items-center space-x-1">
              <span>Featured</span>
              <Sparkles className="w-2.5 h-2.5 text-amber-400" />
            </div>
            <div className="text-[8px] text-zinc-400">Highlight in explore</div>
          </div>
          <button
            type="button"
            onClick={() => setFeatured(!featured)}
            className={`w-7 h-4 rounded-full p-0.5 transition-colors cursor-pointer ${
              featured ? 'bg-amber-500' : 'bg-zinc-700'
            }`}
          >
            <div
              className={`w-3 h-3 rounded-full bg-black transform transition-transform ${
                featured ? 'translate-x-3' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        <div className="bg-[#06080F] border border-zinc-800/80 p-1.5 rounded-md flex items-center justify-between">
          <div>
            <div className="font-bold text-white text-[9.5px]">Min Donation</div>
            <div className="text-[8px] text-zinc-400">Per transaction</div>
          </div>
          <div className="flex items-center space-x-1">
            <input
              type="number"
              min="0.0001"
              step="any"
              value={minDonation}
              onChange={(e) => setMinDonation(Number(e.target.value))}
              className="w-14 bg-zinc-900 border border-zinc-700/80 rounded px-1 py-0.5 text-right font-mono text-[9px] text-white focus:outline-none focus:border-emerald-500"
            />
            <span className="text-[8px] text-zinc-400">{metadata.symbol}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[9px]">
        <div>
          <label className="block text-[8px] text-zinc-400 mb-0.5 font-medium">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full bg-[#06080F] border border-zinc-800/80 rounded px-1.5 py-0.5 text-[9px] text-white focus:outline-none focus:border-emerald-500"
          >
            <option value="DeFi">DeFi & Yield</option>
            <option value="NFT">NFT & Gaming</option>
            <option value="Infrastructure">Infrastructure</option>
            <option value="Ecosystem">Ecosystem</option>
            <option value="Meme">Community & Meme</option>
          </select>
        </div>
        <div>
          <label className="block text-[8px] text-zinc-400 mb-0.5 font-medium">Custom Description</label>
          <input
            type="text"
            value={customDescription}
            onChange={(e) => setCustomDescription(e.target.value)}
            className="w-full bg-[#06080F] border border-zinc-800/80 rounded px-1.5 py-0.5 text-[9px] text-white focus:outline-none focus:border-emerald-500"
          />
        </div>
      </div>

      {isSaveDisabled && (
        <div className="bg-rose-950/40 border border-rose-500/30 rounded-md p-1.5 flex items-center space-x-1.5 text-[8.5px] text-rose-300">
          <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
          <span className="font-semibold leading-tight">{saveDisabledReason}</span>
        </div>
      )}

      <div className="pt-1.5 border-t border-zinc-800/80 flex items-center justify-between gap-1">
        <div className="flex items-center space-x-1 text-[8.5px] text-zinc-400 min-w-0">
          <Lock className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
          <span className="truncate">Verification & token logo URL required.</span>
        </div>

        <div className="flex items-center space-x-1 shrink-0">
          <button
            type="button"
            onClick={onCancel}
            className="px-2 py-0.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white font-semibold rounded text-[9px] flex items-center space-x-0.5 cursor-pointer transition-colors"
          >
            <X className="w-2.5 h-2.5" />
            <span>Cancel</span>
          </button>

          <button
            type="submit"
            disabled={isSaveDisabled || isSaving}
            className={`px-2.5 py-0.5 font-bold rounded text-[9px] flex items-center space-x-1 shadow-sm transition-all ${
              isSaveDisabled
                ? 'bg-zinc-800 text-zinc-500 border border-zinc-700/50 cursor-not-allowed opacity-70'
                : 'bg-emerald-500 hover:bg-emerald-400 text-black cursor-pointer'
            }`}
            title={isSaveDisabled ? saveDisabledReason || 'Save disabled' : 'Save token to directory'}
          >
            {isSaving ? (
              <>
                <div className="w-2.5 h-2.5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Check className="w-2.5 h-2.5 stroke-[3]" />
                <span>Save Token</span>
              </>
            )}
          </button>
        </div>
      </div>
    </form>
  );
};
