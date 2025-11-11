import express = require('express');
import NodegenRequest from '@/http/interfaces/NodegenRequest';
import IapUserSessionService from '@/services/IapUserSessionService';

export interface ValidateRequestOptions {
  passThruWithoutSession: boolean;
}

/**
 * AccessTokenService
 *
 * Processes IAP-authenticated users and manages their sessions.
 *
 * Flow:
 * 1. IAP middleware validates JWT and sets req.iapUser
 * 2. This service creates/finds the user in the database
 * 3. Creates/finds a session for the user
 * 4. Attaches session data to req.sessionData
 *
 * Sessions are stored in the database for tracking and analytics,
 * but authentication is always via IAP JWT, not session cookies.
 */
class AccessTokenService {
  private denyRequest(
    res: express.Response,
    e = 'AccessTokenService did not match the given keys or tokens',
    msg = 'Invalid auth token provided',
    headersProvidedString = ''
  ): void {
    console.error(e);
    res.status(401).json({
      message: msg,
      token: headersProvidedString,
    });
  }

  public async validateRequest(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
    headerNames: string[],
    options?: ValidateRequestOptions
  ): Promise<void> {
    // IAP user must be present (set by iapAuthMiddleware)
    if (!req.iapUser) {
      return this.denyRequest(
        res,
        'No IAP user data',
        'IAP authentication failed. User data not found.'
      );
    }

    // Process the authenticated user and create/find their session
    try {
      console.log(`🔐 Processing IAP user: ${req.iapUser.email}`);
      const sessionData = await IapUserSessionService.handleAuthenticatedUser(
        req.iapUser,
        req
      );
      req.sessionData = sessionData;
      console.log(`✅ IAP user processed: ${req.iapUser.email} -> session ${sessionData.sessionId}`);
      return next();
    } catch (error) {
      console.error('❌ Failed to process IAP user:', error);
      return this.denyRequest(
        res,
        'IAP user processing failed',
        error instanceof Error ? error.message : 'Failed to create user session'
      );
    }
  }
}

export default new AccessTokenService();
