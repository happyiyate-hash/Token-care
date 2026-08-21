import { TokenUploadResponse } from '../types/upload';
import { authenticateUser } from './auth';
import { validateTokenSubmission } from './validation';
import { verifyToken } from './verification';
import { storeUserToken, publishPublicToken } from './storage';
import { calculateReward, creditUser } from './rewards';

/**
 * Token Upload Orchestrator
 *
 * Coordinates the full token submission lifecycle:
 *   1. Authenticate user
 *   2. Validate token submission
 *   3. Verification step (placeholder)
 *   4. Store token for user (placeholder)
 *   5. Publish token to public directory (placeholder)
 *   6. Calculate reward (placeholder)
 *   7. Credit user (placeholder)
 *   8. Return result
 */
export async function uploadTokenWorkflow(
  payload: any,
  authHeader?: string
): Promise<TokenUploadResponse> {
  const timestamp = new Date().toISOString();

  // Step 1: Authenticate User
  const auth = await authenticateUser(authHeader);
  // Note: For now, if no auth header is present, we still allow proceeding in skeleton mode with placeholder userId
  const userId = auth.userId || 'anonymous-user';

  // Step 2: Validate Token Submission
  const validation = validateTokenSubmission(payload);
  if (!validation.isValid || !validation.token) {
    return {
      success: false,
      status: 'failed',
      error: {
        code: 'VALIDATION_FAILED',
        message: validation.error || 'Token submission validation failed',
      },
      timestamp,
    };
  }

  const token = validation.token;

  try {
    // Step 3: Verification Step (Placeholder)
    const verification = await verifyToken(token);
    if (!verification.isVerified) {
      return {
        success: false,
        status: 'failed',
        token,
        userId,
        error: {
          code: 'VERIFICATION_FAILED',
          message: verification.message || 'Token verification failed',
        },
        timestamp,
      };
    }

    // Step 4: Store Token for User (Placeholder for User Cloudflare Worker)
    const userStoreResult = await storeUserToken(userId, token);

    // Step 5: Publish Token to Public Directory (Placeholder for Public Cloudflare Worker)
    const publicPublishResult = await publishPublicToken(token);

    // Step 6: Calculate Reward (Placeholder)
    const rewardAmount = await calculateReward(userId, token);

    // Step 7: Credit User (Placeholder for Supabase account reward)
    const rewardResult = await creditUser(userId, rewardAmount);

    // Step 8: Return Unified Result
    return {
      success: true,
      status: 'success',
      token,
      userId,
      storage: {
        userStoreStatus: userStoreResult.success ? 'stored' : 'failed',
        publicDirectoryStatus: publicPublishResult.success ? 'published' : 'failed',
        userTokenRecordId: userStoreResult.recordId,
        publicDirectoryRecordId: publicPublishResult.directoryId,
      },
      reward: rewardResult,
      timestamp,
    };
  } catch (err: any) {
    console.error('[uploadTokenWorkflow Error]:', err);
    return {
      success: false,
      status: 'failed',
      token,
      userId,
      error: {
        code: 'UPLOAD_WORKFLOW_ERROR',
        message: err?.message || 'An error occurred during token upload processing',
      },
      timestamp,
    };
  }
}
