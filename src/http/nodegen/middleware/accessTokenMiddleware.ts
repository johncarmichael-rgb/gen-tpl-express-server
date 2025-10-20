import AccessTokenService, { ValidateRequestOptions } from '@/services/AccessTokenService';
import NodegenRequest from '../../interfaces/NodegenRequest';
import express from 'express';

export default (headerNames: string[], options?: ValidateRequestOptions) => {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    /**
     * The validate request should call the next function on successful token validation
     */
    AccessTokenService.validateRequest(req as NodegenRequest, res, next, headerNames, options);
  };
}
