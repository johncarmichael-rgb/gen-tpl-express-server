import express = require('express');
import NodegenRequest from '@/http/interfaces/NodegenRequest';
import SessionRepository from '@/database/SessionRepository';

export interface ValidateRequestOptions {
  passThruWithoutSession: boolean;
}

/**
 * AccessTokenService
 *
 * Validates session cookies for authenticated requests.
 *
 * NOTE: In production, sessions are created by iapAuthMiddleware.
 * This service only validates that a valid session exists.
 *
 * For development without IAP, sessions must be created manually via API.
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
    req: NodegenRequest,
    res: express.Response,
    next: express.NextFunction,
    headerNames: string[],
    options?: ValidateRequestOptions
  ): Promise<void> {
    // Check if session data was already set by iapAuthMiddleware
    if (req.sessionData) {
      // Session already validated by IAP middleware, continue
      return next();
    }

    // No session data from IAP middleware, check for session cookie
    const sessionId = req.cookies?.session;

    if (!sessionId) {
      if (options && options.passThruWithoutSession) {
        return next();
      }
      return this.denyRequest(
        res,
        'No session provided',
        'Authentication required. Please access through Google Cloud IAP or create a session.',
        JSON.stringify(req.cookies)
      );
    }

    try {
      const session = await SessionRepository.findBySessionId(sessionId);

      if (!session) {
        return this.denyRequest(res, 'Invalid session', 'Session not found or expired.');
      }

      // Update last accessed time (fire and forget)
      SessionRepository.updateLastAccessed(sessionId).catch((err: any) =>
        console.error('Failed to update session last accessed:', err)
      );

      // Attach minimal session data to request
      req.sessionData = {
        sessionId: session.sessionId,
        userId: session.userId,
      };

      next();
    } catch (error) {
      console.error('Session validation error:', error);
      this.denyRequest(res, 'Session validation failed', 'Invalid session.');
    }
  }
}

export default new AccessTokenService();
