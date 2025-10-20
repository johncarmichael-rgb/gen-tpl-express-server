import express from 'express';

import NodegenRequest from '../../interfaces/NodegenRequest';
import HttpHeadersCacheService from '@/services/HttpHeadersCacheService';

/**
 * Express middleware to control the http headers for caching only
 * @returns {Function}
 */
export default () => {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    HttpHeadersCacheService.middleware(req as NodegenRequest, res, next);
  }
}
