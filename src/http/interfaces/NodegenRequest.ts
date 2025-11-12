import express from 'express';
import { IAPUserData } from '@/http/nodegen/middleware/iapAuthMiddleware';
import { SessionData } from '@/services/SessionService';

declare global {
  namespace Express {
    export interface Request {
      jwtData: any;
      originalToken: string;
      clientIp?: string;
      iapUser?: IAPUserData;

      // sessionData is defined in SessionService outside of the http layer for each
      sessionData: SessionData
    }
  }
}

type NodegenRequest = express.Request;
export default NodegenRequest;
