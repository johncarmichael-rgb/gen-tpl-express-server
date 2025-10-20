import express from 'express';

import NodegenRequest from '../../interfaces/NodegenRequest';
import PermissionService from '@/services/PermissionService';

/**
 * Express middleware to control the http headers for caching only
 * @returns {Function}
 */
export default (permission: string) => {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    PermissionService.middleware(req as NodegenRequest, res, next, permission)
  }
}
