import { randomUUID } from 'node:crypto';
import { config } from './config';
import { userTokenExists, globalTokenExists, saveUserToken, saveGlobalToken } from './cloudflare';
import { grantReward, verifyUser } from './supabase';

export type TokenSaveRequest = {
  user_id: string;
  token?: Record<string, unknown>;
  [key: string]: unknown;
};

function responseBody(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST,OPTIONS', 'access-control-allow-headers': 'Content-Type, Authorization' } });
}

function extractToken(body: TokenSaveRequest): Record<string, unknown> {
  if (body.token && typeof body.token === 'object' && !Array.isArray(body.token)) return body.token;
  const copy = { ...body };
  delete copy.user_id;
  delete copy.token;
  return copy;
}

function validate(userId: string, token: Record<string, unknown>): string | null {
  if (!userId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) return 'A valid user_id is required';
  const chain = String(token.blockchain || token.chain || '').trim();
  const address = String(token.contractAddress || token.address || token.id || '').trim();
  if (!chain) return 'Token blockchain is required';
  if (!address) return 'Token contractAddress (or id/address) is required';
  if (!String(token.name || '').trim()) return 'Token name is required';
  if (!String(token.symbol || '').trim()) return 'Token symbol is required';
  if (token.chainId === undefined && token.chain_id === undefined) return 'Token chainId is required';
  return null;
}

export async function saveToken(body: TokenSaveRequest, authorization?: string): Promise<Response> {
  const userId = String(body?.user_id || '').trim();
  const token = extractToken(body || {});
  const validationError = validate(userId, token);
  if (validationError) return responseBody({ success: false, error: validationError }, 400);

  await verifyUser(userId, authorization);
  const requestId = randomUUID();

  const [userDuplicate, globalDuplicate] = await Promise.all([
    userTokenExists(userId, token),
    globalTokenExists(token),
  ]);

  if (userDuplicate || globalDuplicate) {
    return responseBody({ success: false, error: 'TOKEN_ALREADY_EXISTS', message: 'Token already exists', user_duplicate: userDuplicate, global_duplicate: globalDuplicate }, 409);
  }

  await saveUserToken(userId, token);
  await saveGlobalToken(token);

  const reward = await grantReward(userId, token, requestId, config.rewardAmount);
  const notification = reward?.notification || {
    id: reward?.notification_id,
    type: 'reward',
    title: 'Token saved successfully',
    message: `You have successfully received ${config.rewardAmount} TC for donating this token.`,
  };

  return responseBody({
    success: true,
    message: 'Token saved successfully',
    request_id: requestId,
    reward: { amount: config.rewardAmount, symbol: 'TC', ledger_id: reward?.ledger_id },
    notification,
  }, 200);
}

// Compatibility adapter for the existing Express/API routes in this repository.
// The new token-save implementation above remains the single source of truth.
export async function uploadToken(body: Record<string, unknown>, authorization?: string): Promise<any> {
  const response = await saveToken(body as TokenSaveRequest, authorization);
  return response.json();
}

export async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return responseBody({}, 204);
  if (request.method === 'GET') return responseBody({ success: true, service: 'TokenCare token-save backend', status: 'ok' });
  if (request.method !== 'POST') return responseBody({ success: false, error: 'METHOD_NOT_ALLOWED' }, 405);

  try {
    const body = await request.json() as TokenSaveRequest;
    return await saveToken(body, request.headers.get('authorization') || undefined);
  } catch (error: any) {
    console.error('[TokenCare backend]', error);
    return responseBody({ success: false, error: 'TOKEN_SAVE_FAILED', message: error?.message || 'Unable to save token' }, 500);
  }
}
