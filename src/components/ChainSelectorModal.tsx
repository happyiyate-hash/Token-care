import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, Check, Lock, Globe2 } from 'lucide-react';
import { ChainId } from '../types';
import { getTokenChainsForSelector } from '../constants/tokenChains';
import { RAW_EVM_CHAINS, normalizeChainKey } from '../constants/chains';
import { getTrustWalletChainLogoUrl } from '../constants/trustWalletChainLogos';
import type { DetectedChain } from '../services/chainDetection';

interface ChainSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedChain: ChainId;
  onSelectChain: (chainId: ChainId) => void;
  detectedChain?: DetectedChain | null;
}

export const EVM_CHAIN_LOGOS: Record<string, string> = Object.fromEntries(
  Object.entries(RAW_EVM_CHAINS)
    .map(([id, chain]) => [id, getTrustWalletChainLogoUrl({ id, ...chain })])
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
);

export function getChainLogoUrl(chain: {
  id?: string | number;
  chainId?: number;
  name?: string;
  trustWalletKey?: string;
  logoUrl?: string;
  dexScreenerChain?: string;
}): string | undefined {
  return getTrustWalletChainLogoUrl(chain);
}

export const ChainSelectorModal: React.FC<ChainSelectorModalProps> = ({
  isOpen,
  onClose,
  selectedChain,
  onSelectChain,
  detectedChain,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [imgErrors, setImgErrors] = useState<Record<string, boolean>>({});

  if (!isOpen) return null;

  const normalizedSelected = String(normalizeChainKey(selectedChain)).toLowerCase();
  const baseChains = getTokenChainsForSelector();

  // The selector is a UI registry, not the source of truth for blockchain identity.
  // If discovery found a network that is not hardcoded, inject it into the selector
  // so the user can still select/save the exact chain identity returned by discovery.
  const dynamicDetected = detectedChain && detectedChain.chainId
    ? [{
        id: detectedChain.chainId as ChainId,
        chainId: detectedChain.chainId,
        name: detectedChain.name,
        symbol: detectedChain.blockchain.toUpperCase().slice(0, 8),
        icon: '',
        rpcUrl: '',
        explorerUrl: '',
        coingeckoPlatform: '',
        dexScreenerChain: detectedChain.blockchain,
        tokenStandard: detectedChain.tokenStandard,
        type: 'detected',
        supported: true,
        dynamic: true,
      }]
    : [];

  const chainList = [
    ...dynamicDetected.filter(dynamic => !baseChains.some(chain => String(chain.id).toLowerCase() === String(dynamic.id).toLowerCase())),
    ...baseChains,
  ];

  const filteredChains = chainList.filter((chain) => {
    const query = searchTerm.toLowerCase().trim();
    if (!query) return true;
    return (
      chain.name.toLowerCase().includes(query) ||
      chain.symbol.toLowerCase().includes(query) ||
      String(chain.id).toLowerCase().includes(query) ||
      String(chain.tokenStandard || '').toLowerCase().includes(query)
    );
  });

  const handleImageError = (id: string) => setImgErrors((prev) => ({ ...prev, [id]: true }));

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-end justify-center animate-in fade-in duration-200">
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-[#0B0E17] border-t sm:border-x border-zinc-800/90 rounded-t-[24px] shadow-2xl flex flex-col h-[80vh] sm:h-[75vh] max-h-[85vh] z-10 animate-in slide-in-from-bottom duration-300 overflow-hidden">
        <div className="pt-2.5 pb-2 px-4 flex items-center justify-between shrink-0 border-b border-zinc-800/60 bg-[#06080F]">
          <div className="w-8" /><div className="w-12 h-1 bg-zinc-700/80 rounded-full" />
          <button onClick={onClose} className="p-1 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer" title="Close"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-3 bg-[#06080F] border-b border-zinc-800/60 shrink-0">
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-2.5" />
            <input type="text" placeholder="Search blockchain, symbol or chain ID..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full bg-zinc-900/90 border border-zinc-800 text-white font-mono text-xs rounded-xl pl-10 pr-9 py-2 focus:outline-none focus:border-emerald-500 transition-colors" />
            {searchTerm && <button onClick={() => setSearchTerm('')} className="absolute right-3 top-2 text-zinc-500 hover:text-white p-1"><X className="w-3.5 h-3.5" /></button>}
          </div>
        </div>
        <div className="p-3 overflow-y-auto space-y-1.5 flex-1 no-scrollbar bg-[#06080E]">
          {filteredChains.length === 0 ? <div className="p-6 text-center text-zinc-500 text-xs font-mono">No blockchain found matching "{searchTerm}"</div> : <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {filteredChains.map((chain, index) => {
              const idKey = String(chain.id);
              const uniqueKey = `${chain.type}-${idKey}-${index}`;
              const normalizedId = idKey.toLowerCase();
              const isSelected = normalizedSelected === normalizedId;
              const logoUrl = getChainLogoUrl(chain);
              const hasError = imgErrors[uniqueKey];
              const isDynamic = Boolean((chain as any).dynamic);
              const isSupported = isDynamic || chain.supported !== false;

              return <button key={uniqueKey} type="button" disabled={!isSupported} onClick={() => { if (!isSupported) return; onSelectChain(chain.id); onClose(); }} className={`text-left px-3 py-2 rounded-xl border transition-all flex items-center justify-between group ${!isSupported ? 'bg-[#090B11] border-zinc-900/80 opacity-55 cursor-not-allowed' : isSelected ? 'bg-emerald-500/15 border-emerald-500/60 shadow-md ring-1 ring-emerald-500/30 cursor-pointer' : 'bg-[#0B0E17] border-zinc-800/80 hover:bg-zinc-900 hover:border-zinc-700 cursor-pointer'}`}>
                <div className="flex items-center space-x-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-zinc-900 border border-zinc-800 p-0.5 flex items-center justify-center shrink-0 overflow-hidden">
                    {logoUrl && !hasError ? <img src={logoUrl} alt={chain.name} className="w-full h-full object-cover rounded-full" onError={() => handleImageError(uniqueKey)} /> : <div className="w-full h-full rounded-full flex items-center justify-center font-mono text-[9px] font-bold text-white bg-zinc-700">{String(chain.symbol || chain.name).slice(0, 3)}</div>}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center space-x-1"><span className="text-xs font-bold text-white truncate group-hover:text-emerald-400 transition-colors">{chain.name}</span><span className="text-[10px] text-zinc-400 font-mono">({chain.symbol})</span>{isDynamic && <span className="text-[8px] text-emerald-400 font-semibold flex items-center gap-0.5"><Globe2 className="w-2.5 h-2.5" />Detected</span>}</div>
                    <div className="text-[10px] text-zinc-500 font-mono truncate">{chain.chainId ? `Chain ID: ${chain.chainId}` : chain.tokenStandard}</div>
                  </div>
                </div>
                <div className="shrink-0 ml-2">{!isSupported ? <div className="flex items-center gap-1 text-[9px] text-zinc-600 font-mono"><Lock className="w-3 h-3" />Soon</div> : isSelected ? <div className="w-5 h-5 rounded-full bg-emerald-500 text-black flex items-center justify-center shadow-sm"><Check className="w-3 h-3 stroke-[3]" /></div> : <div className="w-5 h-5 rounded-full border border-zinc-800 group-hover:border-zinc-700" />}</div>
              </button>;
            })}
          </div>}
        </div>
      </div>
    </div>, document.body
  );
};
