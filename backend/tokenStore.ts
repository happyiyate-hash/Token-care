/**
 * In-Memory Token Store for Local & Fallback Backend Operations
 */

export interface TokenRecord {
  id?: string;
  name: string;
  symbol: string;
  contractAddress: string;
  blockchain: string;
  blockchainSymbol?: string;
  chainId?: number;
  logoUrl?: string;
  submittedAt?: string;
  updatedAt?: string | null;
  verified?: boolean;
  userId?: string;
  category?: string;
  description?: string;
  minDonation?: number;
  featured?: boolean;
  acceptDonations?: boolean;
}

// Initial curated token dataset
const initialTokens: TokenRecord[] = [
  {
    id: 'tok-usdt-poly',
    name: 'Tether USD',
    symbol: 'USDT',
    contractAddress: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
    blockchain: 'Polygon',
    blockchainSymbol: 'POL',
    chainId: 137,
    logoUrl: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/polygon/assets/0xc2132D05D31c914a87C6611C10748AEb04B58e8F/logo.png',
    submittedAt: new Date().toISOString(),
    verified: true,
    category: 'DeFi',
    featured: true,
    acceptDonations: true,
    minDonation: 1,
    description: 'Tether USD token verified contract on Polygon for instant Web3 donations.',
  },
  {
    id: 'tok-usdc-poly',
    name: 'USD Coin',
    symbol: 'USDC',
    contractAddress: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
    blockchain: 'Polygon',
    blockchainSymbol: 'POL',
    chainId: 137,
    logoUrl: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/polygon/assets/0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359/logo.png',
    submittedAt: new Date().toISOString(),
    verified: true,
    category: 'DeFi',
    featured: true,
    acceptDonations: true,
    minDonation: 1,
    description: 'USD Coin official native token on Polygon Network.',
  },
  {
    id: 'tok-weth-poly',
    name: 'Wrapped Ether',
    symbol: 'WETH',
    contractAddress: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
    blockchain: 'Polygon',
    blockchainSymbol: 'POL',
    chainId: 137,
    logoUrl: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/polygon/assets/0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619/logo.png',
    submittedAt: new Date().toISOString(),
    verified: true,
    category: 'Ecosystem',
    featured: true,
    acceptDonations: true,
    minDonation: 0.001,
    description: 'Wrapped Ethereum on Polygon network for fast and low-cost transfers.',
  },
  {
    id: 'tok-djt-rh',
    name: 'Trump Media',
    symbol: 'DJT',
    contractAddress: '0xFED508E349C47F669E57c1A1Ba476E5E0e6b918e',
    blockchain: 'robinhood',
    blockchainSymbol: 'ETH',
    chainId: 1,
    logoUrl: 'https://cdn.dexscreener.com/cms/images/BB2Q1zhIPewVvZ9V?width=800&height=800&quality=95&format=auto',
    submittedAt: '2026-08-14T14:19:01.185Z',
    verified: true,
    category: 'Community',
    acceptDonations: true,
  },
  {
    id: 'tok-dos-bsc',
    name: 'DAPPOS',
    symbol: 'DOS',
    contractAddress: '0xb0f09ea9ae0515c3551080d4a745c8115aa30e37',
    blockchain: 'binance smart chain',
    blockchainSymbol: 'BNB',
    chainId: 56,
    logoUrl: 'https://coin-images.coingecko.com/coins/images/102175433/large/DOS.png?1786300290',
    submittedAt: '2026-08-12T20:38:53.225Z',
    verified: true,
    category: 'Infrastructure',
    acceptDonations: true,
  },
];

class TokenStore {
  private tokens: TokenRecord[] = [...initialTokens];

  public getAll(): TokenRecord[] {
    return [...this.tokens];
  }

  public getByUser(userId: string): TokenRecord[] {
    if (!userId) return [];
    const normalized = userId.trim().toLowerCase();
    return this.tokens.filter(
      (t) => t.userId && t.userId.trim().toLowerCase() === normalized
    );
  }

  public getByAddress(contractAddress: string, blockchain?: string): TokenRecord | null {
    if (!contractAddress) return null;
    const normAddr = contractAddress.trim().toLowerCase();
    const normChain = blockchain ? blockchain.trim().toLowerCase() : null;

    const found = this.tokens.find((t) => {
      const addrMatch = t.contractAddress.trim().toLowerCase() === normAddr;
      if (!addrMatch) return false;
      if (normChain) {
        return t.blockchain.trim().toLowerCase() === normChain;
      }
      return true;
    });

    return found || null;
  }

  public saveTokens(userId: string, newTokens: Partial<TokenRecord>[]): {
    saved: TokenRecord[];
    rejected: Array<{ contractAddress?: string; reason: string }>;
  } {
    const saved: TokenRecord[] = [];
    const rejected: Array<{ contractAddress?: string; reason: string }> = [];

    for (const item of newTokens) {
      if (!item.contractAddress || !item.contractAddress.trim()) {
        rejected.push({
          contractAddress: item.contractAddress,
          reason: 'Contract address is required.',
        });
        continue;
      }

      const normAddr = item.contractAddress.trim().toLowerCase();
      const normChain = (item.blockchain || 'Polygon').trim().toLowerCase();

      // Check if already exists in store
      const existingIndex = this.tokens.findIndex(
        (t) =>
          t.contractAddress.trim().toLowerCase() === normAddr &&
          t.blockchain.trim().toLowerCase() === normChain
      );

      const tokenRecord: TokenRecord = {
        id: item.id || `tok-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        name: item.name || item.symbol || 'Unknown Token',
        symbol: (item.symbol || 'TOK').toUpperCase(),
        contractAddress: item.contractAddress.trim(),
        blockchain: item.blockchain || 'Polygon',
        blockchainSymbol: item.blockchainSymbol || 'MATIC',
        chainId: item.chainId || 137,
        logoUrl: item.logoUrl || '',
        submittedAt: item.submittedAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        verified: item.verified ?? true,
        userId: userId || item.userId || 'anonymous_user',
        category: item.category || 'Ecosystem',
        description: item.description || '',
        minDonation: item.minDonation || 1,
        featured: item.featured ?? true,
        acceptDonations: item.acceptDonations ?? true,
      };

      if (existingIndex >= 0) {
        // Update existing record
        this.tokens[existingIndex] = {
          ...this.tokens[existingIndex],
          ...tokenRecord,
        };
        saved.push(this.tokens[existingIndex]);
      } else {
        // Insert new record at beginning
        this.tokens.unshift(tokenRecord);
        saved.push(tokenRecord);
      }
    }

    return { saved, rejected };
  }
}

export const globalTokenStore = new TokenStore();
