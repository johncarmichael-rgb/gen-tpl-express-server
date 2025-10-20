import express from 'express';
import NodegenRequest from '../../interfaces/NodegenRequest';
import CacheService from '@/services/CacheService';

/**
 * Express middleware to control the http headers for caching only
 * @returns {Function}
 */
export default (transformOutputMap: any) => {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    CacheService.middleware(req as NodegenRequest, res, next, transformOutputMap);
  }
}
