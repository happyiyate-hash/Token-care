import React, { useState, useEffect, useCallback } from 'react';
import {
  Wallet,
  Coins,
  ArrowUpDown,
  CheckCircle2,
  AlertCircle,
  Clock,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
  ArrowRight,
  Plus,
  Save,
  Copy,
  Check,
  Zap,
  TrendingUp,
  ReceiptText,
  AlertTriangle,
  Info,
  Sparkles,
} from 'lucide-react';
import { UserRewardWallet } from '../types';
import {
  SupabaseUserProfile,
  submitWithdrawalRequest,
  getUserWithdrawalAddress,
  saveUserWithdrawalAddress,
  fetchWithdrawalRequests,
  WithdrawalRequest,
} from '../lib/supabase';
import { REWARD_RATE_USD } from '../constants/chains';
import { TickerNumber } from './TickerNumber';
import { formatSmartNumber, safeLocaleString, safeFractionDigits } from '../utils/numberFormatting';
import { useTranslation } from '../context/I18nContext';
import { useCurrency } from '../context/CurrencyContext';

interface DesktopWithdrawalViewProps {
  currentUser: any;
  userProfile: SupabaseUserProfile | null;
  wallet: UserRewardWallet;
  onUpdateWallet: (wallet: UserRewardWallet) => void;
  onNavigateTab?: (tab: string) => void;
}

export const DesktopWithdrawalView: React.FC<DesktopWithdrawalViewProps> = ({
  currentUser,
  userProfile,
  wallet,
  onUpdateWallet,
  onNavigateTab,
}) => {
  const { t } = useTranslation();
  const { currency, activeCurrency, formatCurrency } = useCurrency();

  const MIN_WITHDRAWAL_USD = 1.0;
  const MIN_WITHDRAWAL_TOKENS = MIN_WITHDRAWAL_USD / REWARD_RATE_USD;
  const currencyRate = activeCurrency.rate;
  const userId = currentUser?.id || 'demo-user';

  const rawTokens = userProfile?.unclaimed_reward_balance ?? wallet.unclaimedTokens ?? 0;
  const displayBalanceTokens = Math.max(0, rawTokens);
  const displayBalanceUsd = displayBalanceTokens * REWARD_RATE_USD;

  // Input states
  const [tokenAmount, setTokenAmount] = useState<string>('');
  const [fiatAmount, setFiatAmount] = useState<string>('');
  const [inputMode, setInputMode] = useState<'TOKEN' | 'FIAT'>('TOKEN');

  // Address states
  const [savedAddress, setSavedAddress] = useState<string>('');
  const [isLoadingAddress, setIsLoadingAddress] = useState<boolean>(true);
  const [isEditingAddress, setIsEditingAddress] = useState<boolean>(false);
  const [newAddressInput, setNewAddressInput] = useState<string>('');
  const [isSavingAddress, setIsSavingAddress] = useState<boolean>(false);
  const [copiedAddress, setCopiedAddress] = useState<boolean>(false);

  // Submission states
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  // Withdrawal History states
  const [history, setHistory] = useState<WithdrawalRequest[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(true);
  const [historyFilter, setHistoryFilter] = useState<'all' | 'pending' | 'completed'>('all');

  // Load Saved Address
  useEffect(() => {
    let isMounted = true;
    async function loadAddress() {
      setIsLoadingAddress(true);
      try {
        if (userProfile?.wallet_address && /^0x[a-fA-F0-9]{40}$/.test(userProfile.wallet_address.trim())) {
          if (isMounted) setSavedAddress(userProfile.wallet_address.trim());
        } else if (userId) {
          const fetched = await getUserWithdrawalAddress(userId);
          if (isMounted && fetched) setSavedAddress(fetched);
          else if (isMounted) setSavedAddress('');
        }
      } catch (err) {
        console.warn('Error fetching saved address from DB:', err);
        if (isMounted) setSavedAddress('');
      } finally {
        if (isMounted) setIsLoadingAddress(false);
      }
    }
    loadAddress();
    return () => {
      isMounted = false;
    };
  }, [userId, userProfile]);

  // Load History
  const loadWithdrawalHistory = useCallback(async () => {
    if (!userId) return;
    setIsLoadingHistory(true);
    try {
      const requests = await fetchWithdrawalRequests(userId);
      setHistory(requests);
    } catch (err) {
      console.warn('Error fetching withdrawal history:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  }, [userId]);

  useEffect(() => {
    loadWithdrawalHistory();
  }, [loadWithdrawalHistory]);

  const handleCopyAddress = (addr: string) => {
    navigator.clipboard.writeText(addr);
    setCopiedAddress(true);
    setTimeout(() => setCopiedAddress(false), 2000);
  };

  const handleSavePayoutAddress = async () => {
    if (!newAddressInput || !/^0x[a-fA-F0-9]{40}$/.test(newAddressInput.trim())) {
      setSubmitError('Please enter a valid EVM address (starts with 0x followed by 40 hexadecimal characters).');
      return;
    }

    setIsSavingAddress(true);
    setSubmitError(null);
    try {
      const clean = newAddressInput.trim();
      const res = await saveUserWithdrawalAddress(userId, clean);
      if (res.success) {
        setSavedAddress(clean);
        setIsEditingAddress(false);
        setNewAddressInput('');
        setSubmitSuccess('Payout address successfully saved to your profile.');
      } else {
        setSubmitError(res.error || 'Failed to save payout address.');
      }
    } catch (e: any) {
      setSubmitError(e.message || 'Error saving address.');
    } finally {
      setIsSavingAddress(false);
    }
  };

  const handleTokenChange = (val: string) => {
    setSubmitError(null);
    setSubmitSuccess(null);
    setTokenAmount(val);
    const num = parseFloat(val);
    if (!isNaN(num) && num >= 0) {
      setFiatAmount((num * REWARD_RATE_USD * currencyRate).toFixed(activeCurrency.defaultDecimals === 0 ? 0 : 4));
    } else {
      setFiatAmount('');
    }
  };

  const handleFiatChange = (val: string) => {
    setSubmitError(null);
    setSubmitSuccess(null);
    setFiatAmount(val);
    const num = parseFloat(val);
    if (!isNaN(num) && num >= 0) {
      const usdEquivalent = num / currencyRate;
      setTokenAmount((usdEquivalent / REWARD_RATE_USD).toFixed(2));
    } else {
      setTokenAmount('');
    }
  };

  const handleSetPercent = (pct: number) => {
    const targetTokens = (displayBalanceTokens * pct) / 100;
    handleTokenChange(targetTokens.toFixed(2));
  };

  const handleSwapMode = () => {
    setInputMode((prev) => (prev === 'TOKEN' ? 'FIAT' : 'TOKEN'));
  };

  const executeWithdrawal = async () => {
    setSubmitError(null);
    setSubmitSuccess(null);

    const amountTokensNum = parseFloat(tokenAmount);
    if (isNaN(amountTokensNum) || amountTokensNum <= 0) {
      setSubmitError('Please enter a valid withdrawal amount greater than zero.');
      return;
    }

    if (amountTokensNum > displayBalanceTokens) {
      setSubmitError(`Insufficient reward balance. Maximum available: ${displayBalanceTokens.toLocaleString()} TC`);
      return;
    }

    const amountUsdNum = amountTokensNum * REWARD_RATE_USD;
    if (amountUsdNum < MIN_WITHDRAWAL_USD) {
      setSubmitError(
        `Minimum withdrawal amount is ${formatCurrency(MIN_WITHDRAWAL_USD, { minDecimals: activeCurrency.defaultDecimals === 0 ? 0 : 2 })} (${MIN_WITHDRAWAL_TOKENS.toLocaleString()} TC).`
      );
      return;
    }

    if (!savedAddress || !/^0x[a-fA-F0-9]{40}$/.test(savedAddress.trim())) {
      setSubmitError('Please save a valid EVM recipient address before submitting a withdrawal.');
      setIsEditingAddress(true);
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await submitWithdrawalRequest(userId, amountTokensNum, savedAddress, '137');

      if (res.success && res.request) {
        setSubmitSuccess(
          `Withdrawal request for ${safeLocaleString(amountTokensNum, safeFractionDigits(0, 2))} TCARE (${formatCurrency(amountUsdNum, { minDecimals: activeCurrency.defaultDecimals === 0 ? 0 : 2 })}) successfully submitted!`
        );
        setTokenAmount('');
        setFiatAmount('');

        const remainingTokens = Math.max(0, displayBalanceTokens - amountTokensNum);
        onUpdateWallet({
          ...wallet,
          unclaimedTokens: remainingTokens,
          unclaimedUsd: remainingTokens * REWARD_RATE_USD,
        });

        loadWithdrawalHistory();
      } else {
        setSubmitError(res.error || 'Failed to process withdrawal request.');
      }
    } catch (err: any) {
      setSubmitError(err.message || 'An error occurred while submitting withdrawal.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredHistory = history.filter((item) => {
    if (historyFilter === 'pending') return item.status === 'pending' || item.status === 'processing';
    if (historyFilter === 'completed') return item.status === 'completed' || item.status === 'approved';
    return true;
  });

  return (
    <div className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 animate-in fade-in duration-300">
      {/* Top Banner Metric Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Available Balance */}
        <div className="bg-[#0C0E17] border border-emerald-500/30 rounded-2xl p-5 shadow-lg relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl group-hover:bg-emerald-500/10 transition-all pointer-events-none" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Available Balance</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black font-mono text-white flex items-baseline gap-1.5">
              <TickerNumber value={formatSmartNumber(displayBalanceTokens)} />
              <span className="text-emerald-400 text-sm font-sans font-bold">TC</span>
            </div>
            <div className="text-xs text-zinc-400 mt-1 font-medium">
              ≈ {formatCurrency(displayBalanceUsd)}
            </div>
          </div>
        </div>

        {/* Card 2: Settlement Asset */}
        <div className="bg-[#0C0E17] border border-zinc-800/90 hover:border-emerald-500/30 rounded-2xl p-5 shadow-lg transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Payout Currency</span>
            <div className="flex items-center space-x-1 bg-[#0D2118] border border-emerald-500/40 px-2 py-0.5 rounded-full">
              <span className="text-[10px] font-bold text-emerald-400 font-mono">POLYGON</span>
            </div>
          </div>
          <div className="mt-3 flex items-center space-x-3">
            <img
              src="https://assets.coingecko.com/coins/images/325/large/Tether.png"
              alt="USDT"
              className="w-8 h-8 rounded-full"
            />
            <div>
              <div className="text-lg font-black text-white">USDT (PoS)</div>
              <div className="text-xs text-emerald-400 font-medium">Gas-Free Settlement</div>
            </div>
          </div>
        </div>

        {/* Card 3: Minimum Payout & Rate */}
        <div className="bg-[#0C0E17] border border-zinc-800/90 hover:border-emerald-500/30 rounded-2xl p-5 shadow-lg transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Minimum & Rate</span>
            <div className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center border border-amber-500/30">
              <Coins className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-base font-black text-white">
              Min: {formatCurrency(MIN_WITHDRAWAL_USD)}
            </div>
            <div className="text-xs text-zinc-400 mt-1 font-mono">
              1 TC = {formatCurrency(REWARD_RATE_USD, { minDecimals: activeCurrency.defaultDecimals === 0 ? 0 : 4 })}
            </div>
          </div>
        </div>

        {/* Card 4: Total Requests */}
        <div className="bg-[#0C0E17] border border-zinc-800/90 hover:border-emerald-500/30 rounded-2xl p-5 shadow-lg transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Payout Requests</span>
            <button
              onClick={loadWithdrawalHistory}
              className="p-1 text-zinc-400 hover:text-emerald-400 transition-colors cursor-pointer"
              title="Refresh requests"
            >
              <RefreshCw className={`w-4 h-4 ${isLoadingHistory ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <div className="text-2xl font-black font-mono text-white">
              {history.length}
            </div>
            <div className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/20">
              {history.filter((h) => h.status === 'pending' || h.status === 'processing').length} Active
            </div>
          </div>
        </div>
      </div>

      {/* Main 2-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Withdrawal Form & Recipient Address (5 Columns) */}
        <div className="lg:col-span-5 space-y-5">
          {/* Recipient Address Card */}
          <div className="bg-[#0C0E17] border border-emerald-500/30 rounded-2xl p-5 shadow-lg space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                  <Wallet className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Saved Recipient Address</h3>
                  <span className="text-[11px] text-zinc-400">Polygon EVM Wallet (0x...)</span>
                </div>
              </div>

              {!isEditingAddress && savedAddress && (
                <button
                  type="button"
                  onClick={() => {
                    setNewAddressInput(savedAddress);
                    setIsEditingAddress(true);
                  }}
                  className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold cursor-pointer"
                >
                  Edit
                </button>
              )}
            </div>

            {isEditingAddress ? (
              <div className="space-y-3 pt-2 border-t border-zinc-800/80 animate-in fade-in">
                <div>
                  <label className="text-xs text-zinc-300 font-semibold block mb-1.5">
                    Enter EVM Polygon Wallet Address
                  </label>
                  <input
                    type="text"
                    value={newAddressInput}
                    onChange={(e) => setNewAddressInput(e.target.value)}
                    placeholder="0x..."
                    className="w-full bg-[#06080F] border border-zinc-700 focus:border-emerald-500 text-white font-mono text-xs rounded-xl px-3.5 py-2.5 focus:outline-none placeholder:text-zinc-600"
                  />
                </div>

                <div className="flex items-center space-x-2 pt-1">
                  <button
                    type="button"
                    onClick={handleSavePayoutAddress}
                    disabled={isSavingAddress}
                    className="flex-1 py-2 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-black font-bold text-xs rounded-xl flex items-center justify-center space-x-1.5 cursor-pointer disabled:opacity-50 transition-all shadow-md"
                  >
                    {isSavingAddress ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <>
                        <Save className="w-3.5 h-3.5" />
                        <span>Save Address</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditingAddress(false);
                      setNewAddressInput('');
                    }}
                    className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-bold rounded-xl cursor-pointer transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : savedAddress ? (
              <div className="bg-[#06080F] border border-zinc-800 rounded-xl p-3 flex items-center justify-between text-xs font-mono">
                <div className="flex items-center space-x-2 truncate">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="text-zinc-200 truncate">{savedAddress}</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopyAddress(savedAddress)}
                  className="ml-2 text-zinc-400 hover:text-emerald-400 flex items-center space-x-1 transition-colors cursor-pointer shrink-0"
                  title="Copy address"
                >
                  {copiedAddress ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            ) : (
              <div className="bg-[#14120B] border border-amber-500/30 rounded-xl p-3 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="text-xs text-amber-200">No payout address saved yet.</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setNewAddressInput('');
                    setIsEditingAddress(true);
                  }}
                  className="px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/50 text-emerald-300 font-bold text-xs rounded-xl flex items-center space-x-1 cursor-pointer transition-all shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Set Address</span>
                </button>
              </div>
            )}
          </div>

          {/* Withdrawal Request Form Card */}
          <div className="bg-[#0C0E17] border border-zinc-800/90 hover:border-emerald-500/30 rounded-2xl p-5 shadow-lg space-y-4 transition-all">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Request Payout</h3>
              <button
                type="button"
                onClick={handleSwapMode}
                className="flex items-center space-x-1 text-xs text-emerald-400 hover:text-emerald-300 font-semibold cursor-pointer bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20"
              >
                <ArrowUpDown className="w-3 h-3" />
                <span>Switch to {inputMode === 'TOKEN' ? currency : 'TC'}</span>
              </button>
            </div>

            {/* Notification messages */}
            {submitSuccess && (
              <div className="bg-emerald-500/15 border border-emerald-500/40 rounded-xl p-3 text-emerald-300 text-xs font-semibold flex items-start space-x-2 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div className="leading-relaxed">{submitSuccess}</div>
              </div>
            )}

            {submitError && (
              <div className="bg-rose-500/15 border border-rose-500/40 rounded-xl p-3 text-rose-300 text-xs font-semibold flex items-start space-x-2 animate-in fade-in">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div className="leading-relaxed">{submitError}</div>
              </div>
            )}

            {/* Input Amount Box */}
            <div className="bg-[#06080F] border border-zinc-800 focus-within:border-emerald-500/60 rounded-2xl p-4 space-y-3 shadow-inner">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>{inputMode === 'TOKEN' ? 'Withdrawal Amount (TC)' : `Withdrawal Amount (${currency})`}</span>
                <span className="font-mono">Max: {displayBalanceTokens.toLocaleString()} TC</span>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="flex-1">
                  {inputMode === 'TOKEN' ? (
                    <input
                      type="number"
                      step="any"
                      value={tokenAmount}
                      onChange={(e) => handleTokenChange(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-transparent text-2xl font-black font-mono text-white placeholder-zinc-700 focus:outline-none"
                    />
                  ) : (
                    <input
                      type="number"
                      step="any"
                      value={fiatAmount}
                      onChange={(e) => handleFiatChange(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-transparent text-2xl font-black font-mono text-white placeholder-zinc-700 focus:outline-none"
                    />
                  )}
                </div>

                <div className="text-right shrink-0">
                  <span className="text-base font-black font-mono text-emerald-400">
                    {inputMode === 'TOKEN'
                      ? formatCurrency(parseFloat(tokenAmount || '0') * REWARD_RATE_USD)
                      : `${tokenAmount || '0.00'} TC`}
                  </span>
                </div>
              </div>

              {/* Quick Percent Buttons */}
              <div className="grid grid-cols-4 gap-2 pt-2 border-t border-zinc-800/80">
                {[25, 50, 75, 100].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => handleSetPercent(pct)}
                    className="py-1.5 bg-[#121624] hover:bg-emerald-500/20 text-zinc-300 hover:text-emerald-300 border border-zinc-800 hover:border-emerald-500/40 rounded-xl text-xs font-bold font-mono transition-all cursor-pointer"
                  >
                    {pct === 100 ? 'MAX' : `${pct}%`}
                  </button>
                ))}
              </div>
            </div>

            {/* Fee & Network info */}
            <div className="space-y-1.5 text-xs text-zinc-400 bg-[#06080F]/50 p-3 rounded-xl border border-zinc-800/60">
              <div className="flex justify-between">
                <span>Network Fee (Polygon):</span>
                <span className="text-emerald-400 font-bold font-mono">0.00 USDT (Sponsored)</span>
              </div>
              <div className="flex justify-between">
                <span>Estimated Processing Time:</span>
                <span className="text-white font-medium">Instant - 2 Hours</span>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="button"
              onClick={executeWithdrawal}
              disabled={isSubmitting}
              className="w-full py-3.5 bg-gradient-to-r from-[#16A34A] to-[#22C55E] hover:from-[#15803D] hover:to-[#16A34A] disabled:opacity-50 text-black font-black text-xs uppercase tracking-wider rounded-xl shadow-[0_4px_20px_rgba(34,197,94,0.4)] transition-all flex items-center justify-center space-x-2 cursor-pointer disabled:cursor-not-allowed active:scale-[0.99]"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-black" />
                  <span>Processing Withdrawal Request...</span>
                </>
              ) : (
                <>
                  <span>Submit Withdrawal Request</span>
                  <ArrowRight className="w-4 h-4 text-black" />
                </>
              )}
            </button>
          </div>
        </div>

        {/* Right Column: Live History Table & Payout Policy (7 Columns) */}
        <div className="lg:col-span-7 space-y-5">
          {/* History Panel */}
          <div className="bg-[#0C0E17] border border-zinc-800/90 rounded-2xl p-5 shadow-lg space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400">
                  <ReceiptText className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Withdrawal History & Live Status</h3>
                  <span className="text-[11px] text-zinc-400">Real-time status updates from Supabase database</span>
                </div>
              </div>

              {/* Filter Tabs */}
              <div className="flex bg-[#06080F] border border-zinc-800 rounded-xl p-1 space-x-1 text-xs">
                {(['all', 'pending', 'completed'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setHistoryFilter(f)}
                    className={`px-2.5 py-1 rounded-lg font-bold capitalize transition-all cursor-pointer ${
                      historyFilter === f
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            {/* History Table */}
            {isLoadingHistory ? (
              <div className="p-8 text-center space-y-2">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto text-emerald-400" />
                <p className="text-xs text-zinc-400 font-mono">Loading withdrawal records...</p>
              </div>
            ) : filteredHistory.length === 0 ? (
              <div className="p-8 text-center space-y-3 bg-[#06080F] rounded-xl border border-zinc-800/60">
                <Clock className="w-8 h-8 text-zinc-600 mx-auto" />
                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">No Withdrawal Records</h4>
                  <p className="text-xs text-zinc-400 max-w-sm mx-auto">
                    Your submitted withdrawal requests and on-chain transaction hashes will appear here in real time.
                  </p>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-zinc-800/80">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#06080F] text-zinc-400 uppercase text-[10px] tracking-wider border-b border-zinc-800 font-bold">
                    <tr>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Amount</th>
                      <th className="px-4 py-3">Address</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Explorer</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 font-mono">
                    {filteredHistory.map((item, idx) => {
                      const amountUsd = item.amount * REWARD_RATE_USD;
                      return (
                        <tr key={`${item.id || 'wh'}-${idx}`} className="hover:bg-zinc-900/50 transition-colors">
                          <td className="px-4 py-3 text-zinc-300 font-sans text-xs">
                            {new Date(item.created_at).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-bold text-white">{item.amount.toLocaleString()} TC</div>
                            <div className="text-[10px] text-emerald-400 font-sans">
                              ≈ {formatCurrency(amountUsd)}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-zinc-400 truncate max-w-[140px]">
                            {item.destination_address}
                          </td>
                          <td className="px-4 py-3 font-sans">
                            {item.status === 'completed' || item.status === 'approved' ? (
                              <span className="inline-flex items-center space-x-1 text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-full text-[10px] font-bold">
                                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                <span>Completed</span>
                              </span>
                            ) : item.status === 'rejected' ? (
                              <span className="inline-flex items-center space-x-1 text-rose-400 bg-rose-500/10 border border-rose-500/30 px-2 py-0.5 rounded-full text-[10px] font-bold">
                                <AlertCircle className="w-3 h-3 text-rose-400" />
                                <span>Rejected</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center space-x-1 text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-full text-[10px] font-bold">
                                <Clock className="w-3 h-3 text-amber-400 animate-spin" />
                                <span>Pending</span>
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {item.tx_hash ? (
                              <a
                                href={`https://polygonscan.com/tx/${item.tx_hash}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-emerald-400 hover:text-emerald-300 inline-flex items-center space-x-1 text-xs"
                              >
                                <span>Tx</span>
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            ) : (
                              <span className="text-zinc-600 text-[10px]">Processing</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Security & Verification Card */}
          <div className="bg-[#0C0E17] border border-zinc-800/90 rounded-2xl p-5 shadow-lg space-y-3">
            <div className="flex items-center space-x-2 text-emerald-400 font-bold text-xs uppercase tracking-wider">
              <ShieldCheck className="w-4 h-4" />
              <span>TokenCare Automated Payout Engine</span>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Withdrawals are paid in USDT on the Polygon PoS network directly to your saved EVM address. Our automated backend reviews every submission against verified smart contract audits to ensure prompt and secure settlement without gas overhead.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
