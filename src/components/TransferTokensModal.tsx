import React, { useState, useEffect } from 'react';
import {
  ArrowRight,
  Database,
  Cloud,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  Sparkles,
  Layers,
  Code,
  RefreshCw,
} from 'lucide-react';
import { SubmittedToken } from '../types';
import { fetchTokensFromSupabase } from '../lib/supabase';
import { saveUserTokensToWorker } from '../services/userTokenCacheWorker';
import { saveSubmittedTokens } from '../services/storage';

interface TransferTokensModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: any;
  tokens: SubmittedToken[];
  onTransferComplete?: (tokens: SubmittedToken[]) => void;
}

export const TransferTokensModal: React.FC<TransferTokensModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  tokens: currentTokens,
  onTransferComplete,
}) => {
  const [isFetchingSupabase, setIsFetchingSupabase] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);
  const [supabaseTokens, setSupabaseTokens] = useState<SubmittedToken[] | null>(null);
  const [transferPayloadPreview, setTransferPayloadPreview] = useState<any | null>(null);
  const [transferSuccess, setTransferSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showJsonPreview, setShowJsonPreview] = useState(false);

  const userId = currentUser?.id || 'current_user';

  // Build mapped JSON payload from token list
  const buildPayload = (fetched: SubmittedToken[]) => {
    return {
      user_id: userId,
      tokens: fetched.map((tok) => {
        const meta = tok.metadata || ({} as any);
        const chain = meta.blockchainName || meta.chainName || meta.network || tok.chainId || 'polygon';
        const contractAddr = tok.address || meta.address || tok.id;
        return {
          blockchain: String(chain).toLowerCase().trim(),
          id: String(contractAddr).trim(),
          name: meta.name || '',
          symbol: meta.symbol || '',
          contract_address: String(contractAddr).trim(),
          chain_id: String(tok.chainId || '137'),
          logo_url: meta.logoUrl || '',
          token_standard: meta.tokenStandard || 'ERC-20',
        };
      }),
    };
  };

  // Step 1: Fetch all tokens for this user from Supabase database and prepare decoded JSON
  const handleFetchFromSupabase = async () => {
    setIsFetchingSupabase(true);
    setErrorMessage(null);
    setTransferSuccess(false);

    try {
      let fetched: SubmittedToken[] = [];
      try {
        fetched = await fetchTokensFromSupabase(currentUser?.id);
      } catch (err) {
        console.warn('Supabase query fallback to state:', err);
      }

      if (!fetched || fetched.length === 0) {
        // If Supabase returned 0 tokens, use current tokens from state/local cache
        fetched = currentTokens && currentTokens.length > 0 ? currentTokens : [];
      }

      setSupabaseTokens(fetched);
      setTransferPayloadPreview(buildPayload(fetched));
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to fetch tokens from Supabase.');
    } finally {
      setIsFetchingSupabase(false);
    }
  };

  // Auto-fetch/populate on modal open
  useEffect(() => {
    if (isOpen) {
      setTransferSuccess(false);
      setErrorMessage(null);
      handleFetchFromSupabase();
    }
  }, [isOpen, currentUser?.id]);

  if (!isOpen) return null;

  // Step 2: Transfer decoded JSON payload to Cloudflare B (small-pine-71f9)
  const handleExecuteTransfer = async () => {
    if (!transferPayloadPreview || !transferPayloadPreview.tokens || transferPayloadPreview.tokens.length === 0) {
      setErrorMessage('No tokens found to transfer.');
      return;
    }

    setIsTransferring(true);
    setErrorMessage(null);

    try {
      const workerItems = transferPayloadPreview.tokens.map((item: any) => ({
        blockchain: item.blockchain,
        id: item.id || item.contract_address,
        name: item.name,
        symbol: item.symbol,
        logoUrl: item.logo_url,
      }));

      // Call Cloudflare Worker B (?merge=true)
      const res = await saveUserTokensToWorker(userId, workerItems, true);

      if (!res.success) {
        throw new Error(res.error || 'Failed to save tokens to Cloudflare Storage.');
      }

      // Also persist to local storage cache for offline readiness
      if (supabaseTokens && supabaseTokens.length > 0) {
        saveSubmittedTokens(supabaseTokens, userId);
        onTransferComplete?.(supabaseTokens);
      }

      setTransferSuccess(true);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Transfer failed. Please check network connection.');
    } finally {
      setIsTransferring(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="w-full max-w-xl bg-[#0B0E17] border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-950/60">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Cloud className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                Transfer Your Tokens to Cloud Storage
              </h3>
              <p className="text-[11px] text-zinc-400">
                Migrate tokens from Supabase into Cloudflare Worker B (by User ID)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800/80 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1 text-xs">
          {/* Architecture Visual Step Cards */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-3 bg-zinc-900/60 border border-zinc-800 rounded-xl space-y-1">
              <Database className="w-4 h-4 mx-auto text-blue-400" />
              <div className="font-bold text-white text-[11px]">Supabase</div>
              <div className="text-[10px] text-zinc-500">Source database</div>
            </div>
            <div className="flex items-center justify-center text-zinc-600">
              <ArrowRight className="w-5 h-5 text-emerald-500/80 animate-pulse" />
            </div>
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl space-y-1">
              <Cloud className="w-4 h-4 mx-auto text-emerald-400" />
              <div className="font-bold text-white text-[11px]">Cloudflare B</div>
              <div className="text-[10px] text-emerald-400/80 font-mono">tokens:{userId.slice(0, 8)}...</div>
            </div>
          </div>

          {/* User ID Indicator */}
          <div className="p-2.5 bg-zinc-900/80 border border-zinc-800/80 rounded-xl flex items-center justify-between text-[11px]">
            <span className="text-zinc-400">User Identity Scope:</span>
            <span className="font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/20">
              {userId}
            </span>
          </div>

          {/* Status / Error Alerts */}
          {errorMessage && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
              <span>{errorMessage}</span>
            </div>
          )}

          {transferSuccess && (
            <div className="p-3.5 bg-emerald-500/15 border border-emerald-500/40 rounded-xl text-emerald-300 space-y-1">
              <div className="flex items-center space-x-2 font-bold text-xs">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Tokens Transferred Successfully!</span>
              </div>
              <p className="text-[11px] text-emerald-400/90 pl-6">
                All {transferPayloadPreview?.tokens?.length || 0} tokens are now safely stored in Cloudflare Worker B for your user account.
              </p>
            </div>
          )}

          {/* Step 1 Action: Fetch from Supabase */}
          {!supabaseTokens && (
            <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-4 space-y-3">
              <div className="flex items-center space-x-2 text-zinc-300 font-bold">
                <Layers className="w-4 h-4 text-emerald-400" />
                <span>Step 1: Read Tokens from Database</span>
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                Click below to fetch all your tokens from the database and decode them into a grouped JSON payload with name, symbol, contract address, chain, chain ID, and logo URL.
              </p>
              <button
                type="button"
                onClick={handleFetchFromSupabase}
                disabled={isFetchingSupabase}
                className="w-full py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white font-bold rounded-xl transition-all flex items-center justify-center space-x-2 cursor-pointer border border-zinc-700 disabled:opacity-50"
              >
                {isFetchingSupabase ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                    <span>Fetching from Supabase...</span>
                  </>
                ) : (
                  <>
                    <Database className="w-4 h-4 text-emerald-400" />
                    <span>Fetch Tokens from Supabase</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* Step 2 Action: Review JSON & Transfer to Cloudflare B */}
          {supabaseTokens && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-white flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  Found {supabaseTokens.length} token{supabaseTokens.length === 1 ? '' : 's'} in Database
                </span>
                <button
                  type="button"
                  onClick={() => setShowJsonPreview(!showJsonPreview)}
                  className="text-[11px] text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer font-mono"
                >
                  <Code className="w-3 h-3" />
                  <span>{showJsonPreview ? 'Hide JSON' : 'View Grouped JSON'}</span>
                </button>
              </div>

              {showJsonPreview && transferPayloadPreview && (
                <pre className="p-3 bg-black/90 border border-zinc-800 rounded-xl text-[10px] text-emerald-300 font-mono overflow-x-auto max-h-48 scrollbar-thin">
                  {JSON.stringify(transferPayloadPreview, null, 2)}
                </pre>
              )}

              {/* Token list summary pill badges */}
              <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1 scrollbar-thin">
                {supabaseTokens.map((t, idx) => (
                  <div
                    key={`${t.id || t.address}-${idx}`}
                    className="p-2 bg-zinc-900/60 border border-zinc-800/80 rounded-lg flex items-center justify-between"
                  >
                    <div className="flex items-center space-x-2 min-w-0">
                      {t.metadata?.logoUrl ? (
                        <img
                          src={t.metadata.logoUrl}
                          alt={t.metadata.name}
                          className="w-5 h-5 rounded-full object-cover shrink-0"
                        />
                      ) : (
                        <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-[9px]">
                          $
                        </div>
                      )}
                      <div className="truncate">
                        <span className="font-bold text-white">{t.metadata?.name}</span>{' '}
                        <span className="text-zinc-400 font-mono">(${t.metadata?.symbol})</span>
                      </div>
                    </div>
                    <span className="text-[10px] text-zinc-500 font-mono shrink-0">
                      {t.chainId || t.metadata?.blockchainName || 'polygon'}
                    </span>
                  </div>
                ))}
              </div>

              {/* Transfer Execute Button */}
              {!transferSuccess ? (
                <button
                  type="button"
                  onClick={handleExecuteTransfer}
                  disabled={isTransferring || supabaseTokens.length === 0}
                  className="w-full py-3 bg-[#22C55E] hover:bg-[#16A34A] text-black font-extrabold rounded-xl transition-all flex items-center justify-center space-x-2 cursor-pointer shadow-lg shadow-emerald-500/20 disabled:opacity-50 text-xs"
                >
                  {isTransferring ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-black" />
                      <span>Transferring to Cloudflare B...</span>
                    </>
                  ) : (
                    <>
                      <Cloud className="w-4 h-4 text-black" />
                      <span>Transfer to New Storage (Cloudflare B)</span>
                    </>
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white font-bold rounded-xl transition-all text-xs"
                >
                  Done
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
