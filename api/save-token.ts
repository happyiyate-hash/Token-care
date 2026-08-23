import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handler } from '../backend/index';

export default async function saveTokenApi(req: VercelRequest, res: VercelResponse) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const rawBody = Buffer.concat(chunks).toString('utf8');

  const request = new Request(`https://${req.headers.host || 'localhost'}${req.url || '/api/save-token'}`, {
    method: req.method || 'POST',
    headers: new Headers({
      'content-type': String(req.headers['content-type'] || 'application/json'),
      ...(req.headers.authorization ? { authorization: String(req.headers.authorization) } : {}),
    }),
    body: ['GET', 'HEAD'].includes(req.method || 'POST') ? undefined : rawBody,
  });

  const response = await handler(request);
  const text = await response.text();
  res.status(response.status);
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-methods', 'POST,OPTIONS');
  res.setHeader('access-control-allow-headers', 'Content-Type, Authorization');
  res.send(text);
}
