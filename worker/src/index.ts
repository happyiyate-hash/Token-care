/**
 * Cloudflare Worker: User Token Cache (KV)
 *
 * Single production-ready file for storing & retrieving multi-token arrays per user.
 *
 * Endpoints:
 *   - GET  /tokens?user_id=USER_ID_HERE
 *   - POST /tokens  { "user_id": "USER_ID_HERE", "tokens": [...], "mode": "merge" | "replace" }
 *   - OPTIONS (CORS preflight)
 *
 * KV Key Scheme:
 *   "tokens:{user_id}"
 *
 * KV Value Scheme:
 *   {
 *     "user_id": "USER_ID_HERE",
 *     "tokens": [
 *       { "blockchain": "polygon", "id": "TOKEN_ID_1" },
 *       { "blockchain": "base", "id": "TOKEN_ID_2" }
 *     ]
 *   }
 */

export interface Env {
  // Cloudflare KV Namespace binding
  TOKEN_CACHE: KVNamespace;
}

export interface TokenItem {
  blockchain: string;
  id: string;
  [key: string]: unknown; // forwards optional extra metadata if passed
}

export interface UserTokenPayload {
  user_id: string;
  tokens: TokenItem[];
}

export interface SaveTokensRequest {
  user_id: string;
  tokens: TokenItem[];
  mode?: 'merge' | 'replace'; // defaults to 'merge' (with deduplication by blockchain + id)
}

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
  'Access-Control-Max-Age': '86400',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...CORS_HEADERS,
    },
  });
}

function errorResponse(message: string, status = 400, details?: unknown): Response {
  return jsonResponse(
    {
      success: false,
      error: message,
      ...(details ? { details } : {}),
    },
    status
  );
}

/**
 * Creates a unique composite deduplication key for a token: "blockchain:id"
 */
function tokenKey(token: TokenItem): string {
  const chain = String(token.blockchain || '').trim().toLowerCase();
  const id = String(token.id || '').trim().toLowerCase();
  return `${chain}:${id}`;
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    // 1. Handle CORS Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS,
      });
    }

    if (!env.TOKEN_CACHE) {
      return errorResponse('KV binding TOKEN_CACHE is missing in worker environment.', 500);
    }

    const url = new URL(request.url);
    const pathname = url.pathname.replace(/\/+$/, '') || '/';

    // Health check endpoint
    if (pathname === '' || pathname === '/' || pathname === '/health') {
      return jsonResponse({
        status: 'ok',
        service: 'cloudflare-worker-token-cache',
        timestamp: new Date().toISOString(),
      });
    }

    // 2. Submit single token endpoint: POST /submit
    if (pathname === '/submit' && request.method === 'POST') {
      try {
        const body: any = await request.json();
        const userId = (body?.userId || body?.user_id || 'anonymous_user').trim();
        const contractAddress = String(body?.contractAddress || body?.address || '').trim().toLowerCase();
        const blockchain = String(body?.blockchain || 'ethereum').trim().toLowerCase();

        if (!contractAddress) {
          return errorResponse("Field 'contractAddress' is required.", 400);
        }

        const tokenObj = {
          name: body.name || body.symbol || 'Unknown Token',
          symbol: String(body.symbol || 'TOK').toUpperCase(),
          contractAddress,
          blockchain,
          logoUrl: body.logoUrl || '',
          submittedAt: new Date().toISOString(),
          updatedAt: null,
          verified: false,
          userId,
        };

        // Save token to global registry key in KV
        const regKey = `token:${blockchain}:${contractAddress}`;
        await env.TOKEN_CACHE.put(regKey, JSON.stringify(tokenObj));

        // Also append to user list
        const userKvKey = `tokens:${userId}`;
        const rawUserTokens = await env.TOKEN_CACHE.get(userKvKey, 'text');
        let userList: any[] = [];
        if (rawUserTokens) {
          try {
            const parsed = JSON.parse(rawUserTokens);
            userList = Array.isArray(parsed.tokens) ? parsed.tokens : [];
          } catch {}
        }
        // Deduplicate
        userList = userList.filter(
          (t) => !(t.blockchain?.toLowerCase() === blockchain && t.contractAddress?.toLowerCase() === contractAddress)
        );
        userList.push(tokenObj);
        await env.TOKEN_CACHE.put(userKvKey, JSON.stringify({ user_id: userId, tokens: userList }));

        return jsonResponse({
          success: true,
          token: {
            name: tokenObj.name,
            symbol: tokenObj.symbol,
            contractAddress: tokenObj.contractAddress,
            blockchain: tokenObj.blockchain,
            logoUrl: tokenObj.logoUrl,
            submittedAt: tokenObj.submittedAt,
            updatedAt: tokenObj.updatedAt,
            verified: tokenObj.verified,
          },
        });
      } catch (err: any) {
        return errorResponse(err?.message || 'Failed to submit token.', 400);
      }
    }

    // 3. Action-based POST Gateway (handles verifyTokensBatch, batchSaveTokens, getAllTokens, getTokensByUser)
    if (request.method === 'POST') {
      try {
        const clonedReq = request.clone();
        const body: any = await clonedReq.json().catch(() => null);
        const action = body?.action || body?.key;

        // Function 1: verifyTokensBatch — Check Before Saving
        if (action === 'verifyTokensBatch') {
          const inputTokens: Array<{ blockchain: string; contractAddress: string }> = Array.isArray(body.tokens)
            ? body.tokens
            : body.contractAddress
              ? [{ blockchain: body.blockchain || 'ethereum', contractAddress: body.contractAddress }]
              : [];

          const results = [];
          for (const item of inputTokens) {
            const chain = String(item.blockchain || 'ethereum').trim().toLowerCase();
            const addr = String(item.contractAddress || '').trim().toLowerCase();
            const regKey = `token:${chain}:${addr}`;
            const existingRaw = await env.TOKEN_CACHE.get(regKey, 'text');
            let existingObj: any = null;
            if (existingRaw) {
              try { existingObj = JSON.parse(existingRaw); } catch {}
            }

            const exists = !!existingObj;
            results.push({
              blockchain: item.blockchain || 'ethereum',
              contractAddress: item.contractAddress,
              exists,
              ownedBy: exists ? (existingObj?.userId || 'registered_user') : null,
              ...(exists ? { error: 'Token already exists' } : {}),
            });
          }

          const existedCount = results.filter((r) => r.exists).length;
          return jsonResponse({
            success: true,
            total: results.length,
            existed: existedCount,
            notExisted: results.length - existedCount,
            results,
          });
        }

        // Function 2: batchSaveTokens — Save Multiple Tokens at Once
        if (action === 'batchSaveTokens') {
          const userId = String(body.userId || body.user_id || 'anonymous_user').trim();
          const tokens = Array.isArray(body.tokens) ? body.tokens : [];

          if (tokens.length === 0) {
            return errorResponse('No tokens provided to batch save.', 400);
          }

          const chainCounts: Record<string, { added: number; total: number }> = {};
          const savedItems: any[] = [];

          for (const t of tokens) {
            const chain = String(t.blockchain || 'ethereum').trim().toLowerCase();
            const addr = String(t.contractAddress || t.address || '').trim().toLowerCase();
            if (!addr) continue;

            const tokenObj = {
              name: t.name || t.symbol || 'Unknown Token',
              symbol: String(t.symbol || 'TOK').toUpperCase(),
              contractAddress: addr,
              blockchain: chain,
              logoUrl: t.logoUrl || '',
              submittedAt: new Date().toISOString(),
              updatedAt: null,
              verified: false,
              userId,
            };

            const regKey = `token:${chain}:${addr}`;
            await env.TOKEN_CACHE.put(regKey, JSON.stringify(tokenObj));
            savedItems.push(tokenObj);

            if (!chainCounts[chain]) chainCounts[chain] = { added: 0, total: 0 };
            chainCounts[chain].added += 1;
            chainCounts[chain].total += 1;
          }

          // Also save under user tokens
          const userKvKey = `tokens:${userId}`;
          const rawUser = await env.TOKEN_CACHE.get(userKvKey, 'text');
          let existingUserTokens: any[] = [];
          if (rawUser) {
            try {
              const p = JSON.parse(rawUser);
              existingUserTokens = Array.isArray(p.tokens) ? p.tokens : [];
            } catch {}
          }
          const merged = [...existingUserTokens, ...savedItems];
          await env.TOKEN_CACHE.put(userKvKey, JSON.stringify({ user_id: userId, tokens: merged }));

          const blockchains = Object.keys(chainCounts).map((chain) => ({
            blockchain: chain,
            added: chainCounts[chain].added,
            total: chainCounts[chain].total,
          }));

          return jsonResponse({
            success: true,
            userId,
            saved: savedItems.length,
            blockchains,
          });
        }

        // Function 4: getAllTokens — Get Every Token
        if (action === 'getAllTokens') {
          const listRes = await env.TOKEN_CACHE.list({ prefix: 'token:' });
          const allTokens: any[] = [];
          for (const key of listRes.keys) {
            const raw = await env.TOKEN_CACHE.get(key.name, 'text');
            if (raw) {
              try {
                allTokens.push(JSON.parse(raw));
              } catch {}
            }
          }
          return jsonResponse({
            tokens: allTokens,
          });
        }

        // Function 5: getTokensByUser — Get Tokens for One User
        if (action === 'getTokensByUser') {
          const targetUser = String(body.userId || body.user_id || '').trim();
          if (!targetUser) {
            return jsonResponse({ userId: '', count: 0, tokens: [] });
          }
          const rawUser = await env.TOKEN_CACHE.get(`tokens:${targetUser}`, 'text');
          let tokens: any[] = [];
          if (rawUser) {
            try {
              const parsed = JSON.parse(rawUser);
              tokens = Array.isArray(parsed.tokens) ? parsed.tokens : [];
            } catch {}
          }
          return jsonResponse({
            userId: targetUser,
            count: tokens.length,
            tokens,
          });
        }
      } catch (err: any) {
        console.error('Worker POST action parsing error:', err);
      }
    }

    // Routing: /tokens
    if (pathname === '/tokens') {
      // ---------------------------------------------------------
      // GET /tokens?user_id=USER_ID_HERE
      // ---------------------------------------------------------
      if (request.method === 'GET') {
        const userId = url.searchParams.get('user_id')?.trim();

        if (!userId) {
          return errorResponse("Query parameter 'user_id' is required (e.g. /tokens?user_id=USER_123).", 400);
        }

        const kvKey = `tokens:${userId}`;
        const rawData = await env.TOKEN_CACHE.get(kvKey, 'text');

        if (!rawData) {
          // Return empty token list if user has no tokens saved yet
          return jsonResponse({
            user_id: userId,
            tokens: [],
          });
        }

        try {
          const parsed = JSON.parse(rawData);
          return jsonResponse({
            user_id: parsed.user_id || userId,
            tokens: Array.isArray(parsed.tokens) ? parsed.tokens : [],
          });
        } catch {
          // If stored KV was corrupt, return empty list safely
          return jsonResponse({
            user_id: userId,
            tokens: [],
          });
        }
      }

      // ---------------------------------------------------------
      // POST /tokens
      // ---------------------------------------------------------
      if (request.method === 'POST') {
        let body: SaveTokensRequest;

        try {
          body = await request.json();
        } catch {
          return errorResponse('Invalid JSON body.', 400);
        }

        // Validation: user_id
        if (!body || typeof body.user_id !== 'string' || !body.user_id.trim()) {
          return errorResponse("Field 'user_id' is required and must be a non-empty string.", 400);
        }

        const userId = body.user_id.trim();

        // Validation: tokens array
        if (!Array.isArray(body.tokens)) {
          return errorResponse("Field 'tokens' must be an array of token objects.", 400);
        }

        // Validation: validate each token item
        const validIncomingTokens: TokenItem[] = [];
        const validationErrors: string[] = [];

        for (let i = 0; i < body.tokens.length; i++) {
          const t = body.tokens[i];
          if (!t || typeof t !== 'object') {
            validationErrors.push(`Item at index ${i} is not a valid object.`);
            continue;
          }

          const blockchain = typeof t.blockchain === 'string' ? t.blockchain.trim() : '';
          const id = typeof t.id === 'string' || typeof t.id === 'number' ? String(t.id).trim() : '';

          if (!blockchain) {
            validationErrors.push(`Item at index ${i} is missing 'blockchain'.`);
          }
          if (!id) {
            validationErrors.push(`Item at index ${i} is missing 'id'.`);
          }

          if (blockchain && id) {
            validIncomingTokens.push({
              ...t,
              blockchain,
              id,
            });
          }
        }

        if (validationErrors.length > 0) {
          return errorResponse('Invalid token items in request.', 400, validationErrors);
        }

        const kvKey = `tokens:${userId}`;
        const mode = body.mode === 'replace' ? 'replace' : 'merge';

        let finalTokens: TokenItem[] = [];

        if (mode === 'replace') {
          // Deduplicate incoming tokens by blockchain + id
          const seen = new Set<string>();
          for (const token of validIncomingTokens) {
            const k = tokenKey(token);
            if (!seen.has(k)) {
              seen.add(k);
              finalTokens.push(token);
            }
          }
        } else {
          // Merge mode (default): fetch existing tokens first
          const rawExisting = await env.TOKEN_CACHE.get(kvKey, 'text');
          let existingTokens: TokenItem[] = [];

          if (rawExisting) {
            try {
              const parsed = JSON.parse(rawExisting);
              if (Array.isArray(parsed.tokens)) {
                existingTokens = parsed.tokens;
              }
            } catch {
              existingTokens = [];
            }
          }

          // Merge: existing + incoming (incoming overrides older duplicates)
          const tokenMap = new Map<string, TokenItem>();

          for (const t of existingTokens) {
            if (t && t.blockchain && t.id) {
              tokenMap.set(tokenKey(t), t);
            }
          }

          for (const t of validIncomingTokens) {
            tokenMap.set(tokenKey(t), t);
          }

          finalTokens = Array.from(tokenMap.values());
        }

        const payload: UserTokenPayload = {
          user_id: userId,
          tokens: finalTokens,
        };

        // Write directly to KV under "tokens:{user_id}"
        await env.TOKEN_CACHE.put(kvKey, JSON.stringify(payload));

        return jsonResponse(
          {
            success: true,
            user_id: userId,
            count: finalTokens.length,
            tokens: finalTokens,
          },
          200
        );
      }

      return errorResponse(`Method ${request.method} not allowed on /tokens.`, 405);
    }

    return errorResponse(`Endpoint not found: ${pathname}`, 404);
  },
};
