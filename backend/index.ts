import { uploadTokenWorkflow } from './upload/orchestrator';
import {
  TokenUploadRequest,
  TokenUploadResponse,
  AuthContext,
  ValidationResult,
  VerificationResult,
  StorageResult,
  RewardResult,
} from './types/upload';

/**
 * Main Token Upload API entry point.
 *
 * Orchestrates:
 * 1. User Authentication
 * 2. Token Input Validation
 * 3. Token Verification (placeholder)
 * 4. Storing Token for User (placeholder)
 * 5. Publishing Token to Public Directory (placeholder)
 * 6. Reward Calculation (placeholder)
 * 7. Crediting User Reward (placeholder)
 */
export async function uploadToken(
  payload: any,
  authHeader?: string
): Promise<TokenUploadResponse> {
  return uploadTokenWorkflow(payload, authHeader);
}

export {
  uploadTokenWorkflow,
};

export type {
  TokenUploadRequest,
  TokenUploadResponse,
  AuthContext,
  ValidationResult,
  VerificationResult,
  StorageResult,
  RewardResult,
};
