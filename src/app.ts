import http, { Http } from '@/http';
import startup from '@/utils/startup';

/**
 * Returns an instance to the server.ts
 */
export default async (port: number): Promise<Http> => {
  await startup()

  // argument. See the @/http/index.ts
  return http(port);
};
