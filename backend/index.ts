import { uploadTokenWorkflow } from './upload/orchestrator';
import { verifyToken } from './verification/tokenVerifier';
import {
  TokenUploadRequest,
  TokenUploadResponse,
  AuthContext,
  ValidationResult,
  VerificationResult,
  StorageResult,
  RewardResult,
} from './types/upload';

/** Main Token Upload API entry point. */
export async function uploadToken(payload: any, authHeader?: string): Promise<TokenUploadResponse> {
  return uploadTokenWorkflow(payload, authHeader);
}

export { uploadTokenWorkflow, verifyToken };

export type {
  TokenUploadRequest,
  TokenUploadResponse,
  AuthContext,
  ValidationResult,
  VerificationResult,
  StorageResult,
  RewardResult,
};
