import express from 'express';
import { IAPUserData } from '@/http/nodegen/middleware/iapAuthMiddleware';

declare global {
  namespace Express {
    export interface Request {
      jwtData: any;
      originalToken: string;
      clientIp?: string;
      iapUser?: IAPUserData;

      /** If content-negotiation fails, default to this Content-Type instead of throwing. Can be set in the domain. */
      defaultContentType?: string;

      // From RequestExtension
      sessionData: {
        sessionId: string;
        userId: string;
      };
    }
  }
}

type NodegenRequest = express.Request;
export default NodegenRequest;
