import { handler } from '../backend/index';

export default async function saveTokenApi(request: Request): Promise<Response> {
  return handler(request);
}
