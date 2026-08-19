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
