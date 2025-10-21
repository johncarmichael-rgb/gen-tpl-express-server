import config from '@/config';
import cors from 'cors';

/**
 * CORS middleware
 * Add to your config: config.corsWhiteList
 * The value should be a comma separated list of permitted domains
 */
export default () => {
  const whitelist = config.corsWhiteList.split(',');
  console.log('CORS whitelist:', whitelist);

  if (whitelist.length === 1 && whitelist[0] === '*') {
    // Allow all origins but with credentials support (reflect the origin)
    return cors({
      origin: true,
      credentials: true, // Allow credentials (cookies, auth headers)
    });
  }

  return cors({
    origin: (origin: string | undefined, callback: any) => {
      if (!origin || whitelist.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true, // Allow credentials - aka cookies
  });
}
