export interface TokenUploadRequest {
  blockchain: string;
  chainId: string | number;
  contractAddress: string;
  name: string;
  symbol: string;
  decimals?: number;
  totalSupply?: string;
  logoUrl?: string;
  websiteUrl?: string;
  twitterUrl?: string;
  telegramUrl?: string;
}

export interface AuthContext {
  isAuthenticated: boolean;
  userId: string | null;
  email?: string | null;
  authError?: string | null;
}

export interface ValidationResult {
  isValid: boolean;
  error?: string;
  token?: TokenUploadRequest;
}

export interface VerificationResult {
  isVerified: boolean;
  message?: string;
  details?: Record<string, unknown>;
}

export interface StorageResult {
  userStoreStatus: 'stored' | 'pending' | 'skipped' | 'failed';
  publicDirectoryStatus: 'published' | 'pending' | 'skipped' | 'failed';
  userTokenRecordId?: string;
  publicDirectoryRecordId?: string;
}

export interface RewardResult {
  amountUsd: number;
  credited: boolean;
  transactionId?: string;
}

export interface TokenUploadResponse {
  success: boolean;
  status: 'success' | 'partial' | 'failed';
  token?: TokenUploadRequest;
  userId?: string | null;
  storage?: StorageResult;
  reward?: RewardResult;
  error?: {
    code: string;
    message: string;
  };
  timestamp: string;
}
