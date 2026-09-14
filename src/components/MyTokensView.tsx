import React, { useState, useMemo, useEffect } from 'react';
import {
  Box,
  Search,
  Filter,
  CheckCircle2,
  PlusCircle,
  Zap,
  X,
  Copy,
  Check,
  ArrowUpRight,
  Globe,
  Clock,
  Coins,
  ShieldCheck,
  Flame,
} from 'lucide-react';
import { SubmittedToken } from '../types';
import { getChainInfo } from '../constants/chains';
import { resolveChainLogo, NEUTRAL_CHAIN_LOGO } from '../services/chainLogos';
import { CachedTokenLogo } from './CachedTokenLogo';
import { PromoCarousel } from './PromoCarousel';
import { TickerNumber } from './TickerNumber';
import { useTranslation } from '../utils/i18n';
import {
  formatSmartCurrency,
  formatSmartNumber,
  formatTokenSupply,
  calculateTokenUsdValue,
  parseCleanNumber,
} from '../utils/numberFormatting';
import {
  getAllTokensLocal,
  storedTokenToSubmittedToken,
} from '../services/localTokenStore';

interface MyTokensViewProps {
  tokens: SubmittedToken[];
  onNavigateAddToken: () => void;
  onSelectToken?: (token: SubmittedToken) => void;
  onOpenHowItWorks?: () => void;
  onOpenRewardModal?: () => void;
}

const FILTER_NETWORKS: { id: string; label: string }[] = [
  { id: 'ALL', label: 'All Chains' },
  { id: 'ethereum', label: 'Ethereum' },
  { id: 'base', label: 'Base' },
  { id: 'polygon', label: 'Polygon' },
  { id: 'solana', label: 'Solana' },
  { id: 'ton', label: 'TON Network' },
  { id: 'xrpl', label: 'XRP Ledger' },
  { id: 'arbitrum', label: 'Arbitrum' },
  { id: 'optimism', label: 'Optimism' },
  { id: 'bsc', label: 'BNB Smart Chain' },
  { id: 'linea', label: 'Linea' },
  { id: 'avalanche', label: 'Avalanche' },
  { id: 'near', label: 'NEAR Protocol' },
  { id: 'cardano', label: 'Cardano' },
  { id: 'sui', label: 'Sui' },
  { id: 'aptos', label: 'Aptos' },
  { id: 'tron', label: 'TRON' },
  { id: 'cosmos', label: 'Cosmos' },
];

type SortCategory = 'all' | 'verified' | 'highest_value' | 'recent';

// Default sample tokens with realistic total supplies if user has no tokens yet
const DEFAULT_SAMPLE_TOKENS: Array<{
  id: string;
  name: string;
  symbol: string;
  chain: string;
  chainId: string;
  logoUrl: string;
  amountFormatted: string;
  usdValueFormatted: string;
  usdValNumber: number;
  verified: boolean;
  priceUsd: number;
  change24h: number;
  rawToken?: SubmittedToken;
}> = [
  {
    id: 'sample-1',
    name: 'SuperVerse',
    symbol: 'SUPER',
    chain: 'Polygon',
    chainId: '137',
    logoUrl: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/polygon/assets/0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174/logo.png',
    amountFormatted: '1,000,000,000 SUPER',
    usdValueFormatted: '$4,250.25',
    usdValNumber: 4250.25,
    priceUsd: 1.42,
    change24h: 3.45,
    verified: true,
  },
  {
    id: 'sample-2',
    name: 'DogeCare Token',
    symbol: 'DOGECARE',
    chain: 'Polygon',
    chainId: '137',
    logoUrl: 'https://images.unsplash.com/photo-1622979135225-d2ba269bc1bd?auto=format&fit=crop&w=120&q=80',
    amountFormatted: '500,000,000 DOGECARE',
    usdValueFormatted: '$2,125.50',
    usdValNumber: 2125.50,
    priceUsd: 0.00425,
    change24h: 12.8,
    verified: true,
  },
  {
    id: 'sample-3',
    name: 'Wave Protocol',
    symbol: 'WAVE',
    chain: 'Polygon',
    chainId: '137',
    logoUrl: 'https://images.unsplash.com/photo-1639762681485-074b7f938ba0?auto=format&fit=crop&w=120&q=80',
    amountFormatted: '100,000,000 WAVE',
    usdValueFormatted: '$1,980.00',
    usdValNumber: 1980.00,
    priceUsd: 0.0198,
    change24h: -1.2,
    verified: true,
  },
  {
    id: 'sample-4',
    name: 'BlockTrust',
    symbol: 'BTRUST',
    chain: 'Polygon',
    chainId: '137',
    logoUrl: 'https://images.unsplash.com/photo-1622979135240-caa6648190b6?auto=format&fit=crop&w=120&q=80',
    amountFormatted: '25,000,000 BTRUST',
    usdValueFormatted: '$1,875.00',
    usdValNumber: 1875.00,
    priceUsd: 0.075,
    change24h: 5.6,
    verified: true,
  },
  {
    id: 'sample-5',
    name: 'Nexa Token',
    symbol: 'NEXA',
    chain: 'Polygon',
    chainId: '137',
    logoUrl: 'https://images.unsplash.com/photo-1621416894569-0f39ed31d247?auto=format&fit=crop&w=120&q=80',
    amountFormatted: '21,000,000,000 NEXA',
    usdValueFormatted: '$1,640.00',
    usdValNumber: 1640.00,
    priceUsd: 0.000078,
    change24h: 8.2,
    verified: true,
  },
  {
    id: 'sample-6',
    name: 'LinkLayer',
    symbol: 'LAYER',
    chain: 'Polygon',
    chainId: '137',
    logoUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=120&q=80',
    amountFormatted: '1,000,000,000 LAYER',
    usdValueFormatted: '$1,120.00',
    usdValNumber: 1120.00,
    priceUsd: 0.00112,
    change24h: 0.5,
    verified: true,
  },
];

export const MyTokensView: React.FC<MyTokensViewProps> = ({
  tokens,
  onNavigateAddToken,
  onSelectToken,
}) => {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedChainFilter, setSelectedChainFilter] = useState('ALL');
  const [activeSort, setActiveSort] = useState<SortCategory>('all');
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const [selectedTokenDetails, setSelectedTokenDetails] = useState<any | null>(null);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [localTokenRevision, setLocalTokenRevision] = useState(0);

  useEffect(() => {
    const handleUpdate = () => {
      setLocalTokenRevision((r) => r + 1);
    };
    window.addEventListener('tokencare_local_tokens_updated', handleUpdate);
    window.addEventListener('tokencare_saved_tokens_updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);
    return () => {
      window.removeEventListener('tokencare_local_tokens_updated', handleUpdate);
      window.removeEventListener('tokencare_saved_tokens_updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  // Map real user tokens combining App tokens prop with device localTokenStore
  const mappedRealTokens = useMemo(() => {
    const seen = new Set<string>();
    const seenIds = new Set<string>();

    // Read device-local tokens directly from localTokenStore
    let localStoredTokens: SubmittedToken[] = [];
    try {
      const stored = getAllTokensLocal();
      if (Array.isArray(stored)) {
        localStoredTokens = stored.map((s, i) => storedTokenToSubmittedToken(s, i));
      }
    } catch {}

    const combinedList = [...tokens, ...localStoredTokens];

    return combinedList
      .filter((t) => {
        if (!t) return false;
        const chain = String(t.chainId || '').trim().toLowerCase();
        const addr = String(t.address || t.metadata?.address || t.id || '').trim().toLowerCase();
        const composite = `${chain}:${addr}`;
        if (seen.has(composite)) return false;
        seen.add(composite);
        return true;
      })
      .map((t, idx) => {
        const rawSupply =
          t.metadata?.totalSupply ||
          (t.metadata as any)?.total_supply ||
          (t as any)?.total_supply ||
          (t.marketData as any)?.totalSupplyCG ||
          (t.metadata as any)?.supply ||
          '1000000000';

        const supplyNum = parseCleanNumber(rawSupply);
        const price = t.marketData?.priceUsd || 0;
        const marketCap = t.marketData?.marketCapUsd || (supplyNum > 0 && price > 0 ? supplyNum * price : 0);
        const usdValNumber = marketCap > 0 ? marketCap : (price > 0 ? price : 1250);

        const chainName =
          t.metadata.blockchainName ||
          (t.metadata as any)?.blockchain_name ||
          (t.metadata as any)?.blockchain ||
          t.metadata.chainName ||
          t.metadata.network ||
          getChainInfo(t.metadata.chainId || t.chainId).name ||
          t.chainId ||
          'polygon';

        let safeId = t.id || t.address || `tok-${t.chainId}-${idx}`;
        if (seenIds.has(safeId)) {
          safeId = `${safeId}-${idx}`;
        }
        seenIds.add(safeId);

        return {
          id: safeId,
          name: t.metadata.name,
          symbol: t.metadata.symbol,
          chain: chainName,
          chainId: t.metadata.chainId || t.chainId || '137',
          logoUrl: t.metadata.logoUrl,
          amountFormatted: formatTokenSupply(rawSupply, t.metadata.symbol),
          usdValueFormatted: calculateTokenUsdValue(rawSupply, price, marketCap),
          usdValNumber,
          priceUsd: price || 1.25,
          change24h: t.marketData?.change24h || 2.5,
          verified: t.verified !== false,
          rawToken: t,
        };
      });
  }, [tokens, localTokenRevision]);

  const displayList = mappedRealTokens.length > 0 ? mappedRealTokens : DEFAULT_SAMPLE_TOKENS;

  // Filter list by searchQuery and chain
  const filteredTokens = useMemo(() => {
    let result = displayList.filter((item) => {
      const q = searchQuery.toLowerCase().trim();
      const nameMatch = item.name.toLowerCase().includes(q);
      const symbolMatch = item.symbol.toLowerCase().includes(q);
      const chainMatch = item.chain.toLowerCase().includes(q);
      const addrMatch = item.id.toLowerCase().includes(q);
      if (q && !(nameMatch || symbolMatch || chainMatch || addrMatch)) return false;

      if (selectedChainFilter !== 'ALL') {
        const chainInfo = resolveChainLogo(item.chain, item.chainId);
        const reqChain = resolveChainLogo(selectedChainFilter, selectedChainFilter);
        if (
          chainInfo.id !== reqChain.id &&
          !item.chain.toLowerCase().includes(selectedChainFilter.toLowerCase()) &&
          !chainInfo.shortName.toLowerCase().includes(selectedChainFilter.toLowerCase())
        ) {
          return false;
        }
      }
      return true;
    });

    if (activeSort === 'verified') {
      result = [...result].sort((a, b) => (b.verified ? 1 : 0) - (a.verified ? 1 : 0));
    } else if (activeSort === 'highest_value') {
      result = [...result].sort((a, b) => (b.usdValNumber || 0) - (a.usdValNumber || 0));
    }

    return result;
  }, [displayList, searchQuery, selectedChainFilter, activeSort]);

  const totalTokenCount = displayList.length;
  const totalValueUsd = displayList.reduce((sum, item) => sum + (item.usdValNumber || 0), 0);

  const handleCopy = (address: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    navigator.clipboard.writeText(address);
    setCopiedAddress(address);
    setTimeout(() => setCopiedAddress(null), 2000);
  };

  const handleOpenDetail = (item: any) => {
    setSelectedTokenDetails(item);
  };

  return (
    <div className="w-full h-full flex flex-col min-h-0 overflow-hidden bg-[#06080E] text-white font-sans animate-in fade-in duration-200 relative">
      {/* 1. FIXED TOP NAVIGATION HEADER & CONTROLS (Unified with Explore styling) */}
      <div className="shrink-0 bg-[#06080E] px-2 py-2 space-y-2 z-30">
        {/* Top Metric Header */}
        <div className="flex items-center justify-between px-1 pt-1 pb-0.5">
          {/* Left Metric: Total Tokens Added */}
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-xl bg-[#15803D]/20 border border-[#22C55E]/40 flex items-center justify-center text-[#4ADE80] shrink-0">
              <Box className="w-4 h-4 text-[#4ADE80]" />
            </div>

            <div>
              <div className="text-[9px] text-zinc-400 font-bold uppercase tracking-wider">{t('tokens.totalTokens')}</div>
              <div className="text-xs font-black text-white tracking-tight flex items-center gap-1 font-mono">
                <TickerNumber value={formatSmartNumber(totalTokenCount)} />
                <span className="font-sans font-normal text-zinc-300">{t('tokens.added')}</span>
                <span className="text-[8px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-1 rounded font-mono font-medium">
                  {t('common.verified')}
                </span>
              </div>
            </div>
          </div>

          {/* Right Metric: Total Value (USD) + Add/Donate Button */}
          <div className="flex items-center space-x-2.5">
            <div className="text-right">
              <div className="text-[8.5px] text-zinc-400 font-bold uppercase tracking-wider">{t('tokens.totalValue')}</div>
              <div className="text-xs font-black text-white font-mono tracking-tight flex items-center justify-end">
                <TickerNumber value={formatSmartCurrency(totalValueUsd)} />
              </div>
            </div>

            <button
              type="button"
              onClick={onNavigateAddToken}
              className="p-1.5 px-2.5 bg-[#22C55E] hover:bg-[#16A34A] text-black rounded-xl font-bold transition-all shadow-[0_2px_10px_rgba(34,197,94,0.3)] cursor-pointer shrink-0 flex items-center space-x-1.5 active:scale-95"
              title={t('tokens.addNewToken')}
            >
              <PlusCircle className="w-4 h-4 fill-black/20" />
              <span className="text-[10px] font-extrabold uppercase tracking-wider">{t('nav.donate', 'Donate')}</span>
            </button>
          </div>
        </div>

        {/* Search and Chain Filter Row */}
        <div className="flex items-center space-x-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('tokens.searchPlaceholder', 'Search by token name, symbol, or chain...')}
              className="w-full bg-[#0B0E17] border border-zinc-800/90 text-white text-xs rounded-xl pl-9 pr-8 py-2.5 focus:outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/30 placeholder:text-zinc-600 transition-all font-sans"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setIsFilterSheetOpen(true)}
            className={`px-3.5 py-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 shrink-0 ${
              selectedChainFilter !== 'ALL'
                ? 'bg-emerald-500/20 text-[#4ADE80] border-emerald-500/50 shadow-sm'
                : 'bg-[#0B0E17] text-zinc-300 border-zinc-800 hover:border-zinc-700 hover:text-white'
            }`}
          >
            <Filter className="w-3.5 h-3.5 text-[#4ADE80]" />
            <span>{t('common.filter')}</span>
            {selectedChainFilter !== 'ALL' && <span className="w-2 h-2 rounded-full bg-[#22C55E]" />}
          </button>
        </div>

        {/* Selected Chain Badge */}
        {selectedChainFilter !== 'ALL' && (
          <div className="flex items-center space-x-2 pt-0.5">
            <span className="text-[11px] font-bold text-zinc-300 bg-zinc-900 border border-zinc-800 px-2.5 py-0.5 rounded-lg flex items-center gap-1.5">
              <span>{t('tokens.chain')}: {resolveChainLogo(selectedChainFilter, selectedChainFilter).name}</span>
              <X
                className="w-3 h-3 text-zinc-500 hover:text-white cursor-pointer"
                onClick={() => setSelectedChainFilter('ALL')}
              />
            </span>
          </div>
        )}

        {/* Promo Carousel Banner */}
        <div className="w-full">
          <PromoCarousel
            tokens={tokens}
            onNavigateAddToken={onNavigateAddToken}
            onSelectToken={(tok) => {
              if (onSelectToken) onSelectToken(tok);
            }}
          />
        </div>

        {/* Category / Sort Pills (Explore-style) */}
        <div className="flex items-center space-x-1.5 overflow-x-auto scrollbar-none pt-0.5 pb-0.5">
          {[
            { id: 'all', label: 'All Tokens', icon: Box },
            { id: 'verified', label: 'Verified Only', icon: ShieldCheck },
            { id: 'highest_value', label: 'Highest Value', icon: Coins },
            { id: 'recent', label: 'Recently Added', icon: Clock },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeSort === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveSort(tab.id as SortCategory)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-extrabold flex items-center space-x-1.5 transition-all cursor-pointer whitespace-nowrap shrink-0 border ${
                  isActive
                    ? 'bg-emerald-500/15 text-[#4ADE80] border-emerald-500/40 shadow-sm'
                    : 'bg-[#0B0E17] text-zinc-400 hover:text-white border-zinc-800/80 hover:border-zinc-700'
                }`}
              >
                <Icon className={`w-3 h-3 ${isActive ? 'text-[#4ADE80]' : 'text-zinc-500'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. MAIN TOKEN LIST CONTENT (Clean Explore-style layout) */}
      <div className="flex-1 min-h-0 overflow-y-auto px-2 py-1 pb-28 scrollbar-thin max-w-7xl w-full mx-auto">
        {filteredTokens.length === 0 ? (
          <div className="bg-[#0B0E17] border border-zinc-800/80 rounded-2xl p-8 text-center space-y-2 mt-2">
            <div className="w-9 h-9 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto text-zinc-500">
              <Search className="w-4 h-4" />
            </div>
            <h3 className="text-xs font-bold text-white">{t('tokens.noTokensFound', { query: searchQuery })}</h3>
            <p className="text-[11px] text-zinc-500 max-w-xs mx-auto">
              Submit contract address via the Donate page to add tokens to your verified list.
            </p>
          </div>
        ) : (
          /* Responsive Layout: Sleek Rows on mobile, 2-to-3 columns on tablet/desktop */
          <div className="divide-y divide-zinc-800/40 md:divide-y-0 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-3">
            {filteredTokens.map((item, idx) => {
              const chainInfo = resolveChainLogo(item.chain, item.chainId);
              const isPositive = (item.change24h || 0) >= 0;

              return (
                <div
                  key={`${item.chainId || ''}:${item.id || item.symbol || 'tok'}:${idx}`}
                  onClick={() => handleOpenDetail(item)}
                  className="py-2.5 px-2 md:p-3 hover:bg-white/[0.03] active:bg-white/[0.06] md:bg-[#0B0E17]/90 md:hover:bg-[#111422] md:border md:border-zinc-800/80 md:hover:border-emerald-500/40 md:rounded-2xl transition-all cursor-pointer group flex items-center justify-between gap-2.5 rounded-lg"
                >
                  {/* Left: Token Logo with Circular Chain Overlay Badge + Name & Network */}
                  <div className="flex items-center space-x-3 min-w-0">
                    <div className="relative shrink-0">
                      <CachedTokenLogo
                        src={item.logoUrl || chainInfo.logoUrl}
                        chain={item.chain || item.chainId || 'polygon'}
                        address={item.id}
                        symbol={item.symbol}
                        alt={item.name}
                        className="w-9 h-9 sm:w-10 sm:h-10 rounded-full object-cover bg-zinc-900 border border-zinc-800/80 p-0.5"
                      />
                      {/* Small circular chain badge at bottom-right corner */}
                      <div
                        className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border border-black/90 flex items-center justify-center bg-zinc-900 overflow-hidden ring-1 ring-black/80 shadow"
                        title={chainInfo.name}
                      >
                        <img
                          src={chainInfo.logoUrl}
                          alt={chainInfo.name}
                          className="w-2.5 h-2.5 object-contain rounded-full"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = NEUTRAL_CHAIN_LOGO;
                          }}
                        />
                      </div>
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center space-x-1.5">
                        <h4 className="text-xs sm:text-sm font-bold text-white truncate group-hover:text-[#4ADE80] transition-colors">
                          {item.name}
                        </h4>
                        {item.verified && (
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#22C55E] shrink-0" title="Verified Token" />
                        )}
                      </div>
                      <div className="flex items-center space-x-1.5 mt-0.5">
                        <span className="text-[11px] font-semibold text-zinc-400 font-mono">
                          ${item.symbol}
                        </span>
                        <span className="text-[10px] sm:text-[10.5px] text-zinc-500 font-sans truncate">
                          · {chainInfo.name}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Supply Amount & USD Value / 24h Change */}
                  <div className="text-right shrink-0 font-mono">
                    <div className="text-xs sm:text-sm font-bold text-white">
                      {item.usdValueFormatted || formatSmartCurrency(item.priceUsd)}
                    </div>
                    <div className={`text-[10px] sm:text-[10.5px] font-semibold ${isPositive ? 'text-[#4ADE80]' : 'text-rose-400'}`}>
                      {isPositive ? '+' : ''}{(item.change24h || 0).toFixed(2)}%
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 3. CHAIN FILTER BOTTOM SHEET / MODAL */}
      {isFilterSheetOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in duration-150"
          onClick={() => setIsFilterSheetOpen(false)}
        >
          <div
            className="w-full max-w-md bg-[#0B0E17] border border-zinc-800 rounded-t-2xl sm:rounded-2xl p-4 space-y-3 shadow-2xl animate-in slide-in-from-bottom duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800/80">
              <div className="flex items-center space-x-2">
                <Globe className="w-4 h-4 text-[#4ADE80]" />
                <h3 className="text-sm font-bold text-white">{t('explore.selectChain', 'Select Blockchain')}</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsFilterSheetOpen(false)}
                className="text-zinc-500 hover:text-white p-1 rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-1.5 max-h-[60vh] overflow-y-auto pr-1">
              {FILTER_NETWORKS.map((net) => {
                const chainInfo = net.id === 'ALL' ? null : resolveChainLogo(net.id, net.id);
                const isSelected = selectedChainFilter === net.id;
                const count =
                  net.id === 'ALL'
                    ? displayList.length
                    : displayList.filter((item) => {
                        const info = resolveChainLogo(item.chain, item.chainId);
                        return (
                          info.id === chainInfo?.id ||
                          info.shortName.toLowerCase() === net.id.toLowerCase() ||
                          item.chain.toLowerCase().includes(net.id.toLowerCase())
                        );
                      }).length;

                return (
                  <button
                    key={net.id}
                    type="button"
                    onClick={() => {
                      setSelectedChainFilter(net.id);
                      setIsFilterSheetOpen(false);
                    }}
                    className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-500/15 border-emerald-500/50 text-white font-bold'
                        : 'bg-[#070A12] border-zinc-800/80 text-zinc-300 hover:bg-zinc-900 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5">
                      {chainInfo ? (
                        <img
                          src={chainInfo.logoUrl}
                          alt={net.label}
                          className="w-5 h-5 rounded-full object-contain bg-zinc-900 border border-zinc-800"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = NEUTRAL_CHAIN_LOGO;
                          }}
                        />
                      ) : (
                        <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-[#4ADE80] flex items-center justify-center font-bold text-[9px] font-mono">
                          ALL
                        </div>
                      )}
                      <span className="text-xs">{net.id === 'ALL' ? t('explore.allChains', 'All Chains') : net.label}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-[10px] text-zinc-500 font-mono">{count} tokens</span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-[#4ADE80]" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 4. INTERACTIVE TOKEN DETAILS MODAL (Explore-style) */}
      {selectedTokenDetails && (() => {
        const item = selectedTokenDetails;
        const chainInfo = resolveChainLogo(item.chain, item.chainId);
        const isPositive = (item.change24h || 0) >= 0;

        return (
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in duration-150"
            onClick={() => setSelectedTokenDetails(null)}
          >
            <div
              className="w-full max-w-lg bg-[#0B0E17] border border-zinc-800 rounded-t-2xl sm:rounded-2xl p-4 sm:p-5 space-y-4 shadow-2xl max-h-[85vh] overflow-y-auto animate-in slide-in-from-bottom duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header: Logo, Name, Symbol, Chain, Close */}
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-3">
                  <div className="relative shrink-0">
                    <CachedTokenLogo
                      src={item.logoUrl || chainInfo.logoUrl}
                      chain={item.chain || item.chainId || 'polygon'}
                      address={item.id}
                      symbol={item.symbol}
                      alt={item.name}
                      className="w-12 h-12 rounded-xl object-cover bg-zinc-900 border border-zinc-800 p-0.5"
                    />
                    <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-zinc-900 border border-black flex items-center justify-center overflow-hidden">
                      <img
                        src={chainInfo.logoUrl}
                        alt="chain"
                        className="w-3.5 h-3.5 rounded-full object-contain"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = NEUTRAL_CHAIN_LOGO;
                        }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center space-x-1.5">
                      <h3 className="text-base font-black text-white">{item.name}</h3>
                      {item.verified && (
                        <span className="bg-emerald-500/15 text-[#4ADE80] border border-emerald-500/30 text-[9px] font-bold px-1.5 py-0.2 rounded">
                          {t('common.verified')}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center space-x-2 mt-0.5">
                      <span className="text-xs font-bold text-zinc-400 font-mono">${item.symbol}</span>
                      <span className="text-[10px] text-zinc-500 font-sans">{chainInfo.name}</span>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedTokenDetails(null)}
                  className="text-zinc-500 hover:text-white p-1 rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Contract Address Bar */}
              <div className="bg-[#06080E] border border-zinc-800 rounded-xl p-3 space-y-1">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">
                  {t('explore.contractAddress', 'Contract Address')}
                </span>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-mono text-zinc-200 truncate select-all">{item.id}</span>
                  <button
                    type="button"
                    onClick={(e) => handleCopy(item.id, e)}
                    className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-[11px] font-bold rounded-lg border border-zinc-800 transition-colors cursor-pointer flex items-center space-x-1 shrink-0"
                  >
                    {copiedAddress === item.id ? (
                      <>
                        <Check className="w-3 h-3 text-[#4ADE80]" />
                        <span className="text-[#4ADE80]">{t('common.copied')}</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>{t('common.copy')}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* 6 Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <div className="bg-[#070A12] border border-zinc-800/80 rounded-xl p-2.5">
                  <span className="text-[9.5px] text-zinc-500 font-bold uppercase block">{t('explore.price', 'Price')}</span>
                  <span className="text-xs font-mono font-bold text-white mt-0.5 block">{formatSmartCurrency(item.priceUsd)}</span>
                </div>
                <div className="bg-[#070A12] border border-zinc-800/80 rounded-xl p-2.5">
                  <span className="text-[9.5px] text-zinc-500 font-bold uppercase block">{t('explore.change24h', '24h Change')}</span>
                  <span className={`text-xs font-mono font-bold mt-0.5 block ${isPositive ? 'text-[#4ADE80]' : 'text-rose-400'}`}>
                    {isPositive ? '+' : ''}{(item.change24h || 0).toFixed(2)}%
                  </span>
                </div>
                <div className="bg-[#070A12] border border-zinc-800/80 rounded-xl p-2.5">
                  <span className="text-[9.5px] text-zinc-500 font-bold uppercase block">Total Supply</span>
                  <span className="text-xs font-mono font-bold text-white mt-0.5 block">{item.amountFormatted}</span>
                </div>
                <div className="bg-[#070A12] border border-zinc-800/80 rounded-xl p-2.5">
                  <span className="text-[9.5px] text-zinc-500 font-bold uppercase block">{t('explore.marketCap', 'Value / Market Cap')}</span>
                  <span className="text-xs font-mono font-bold text-white mt-0.5 block">{item.usdValueFormatted}</span>
                </div>
                <div className="bg-[#070A12] border border-zinc-800/80 rounded-xl p-2.5">
                  <span className="text-[9.5px] text-zinc-500 font-bold uppercase block">{t('explore.liquidity', 'Liquidity')}</span>
                  <span className="text-xs font-mono font-bold text-white mt-0.5 block">$524,000.00</span>
                </div>
                <div className="bg-[#070A12] border border-zinc-800/80 rounded-xl p-2.5">
                  <span className="text-[9.5px] text-zinc-500 font-bold uppercase block">{t('explore.trustScore', 'Trust Score')}</span>
                  <span className="text-xs font-mono font-bold text-[#4ADE80] mt-0.5 block">98/100</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center space-x-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    if (item.rawToken && onSelectToken) {
                      onSelectToken(item.rawToken);
                    }
                    onNavigateAddToken();
                    setSelectedTokenDetails(null);
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-[#16A34A] to-[#22C55E] hover:from-[#15803D] hover:to-[#16A34A] text-black font-extrabold text-xs transition-all cursor-pointer shadow-md flex items-center justify-center space-x-1.5"
                >
                  <span>{t('explore.supportToken', 'Donate to Token')}</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedTokenDetails(null)}
                  className="px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-bold transition-colors cursor-pointer"
                >
                  {t('common.close')}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
