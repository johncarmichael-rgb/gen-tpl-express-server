import express from 'express';
import { randomUUID } from 'crypto';
import SessionRepository from '@/database/SessionRepository';
import { SessionClass } from '@/database/models/SessionModel';

/**
 * SessionService
 *
 * Centralized service for session management:
 * - Creates sessions with proper expiry
 * - Sets secure HTTP-only cookies
 * - Validates existing sessions
 * - Handles session renewal
 */
class SessionService {
  private readonly SESSION_COOKIE_NAME = 'session';
  private readonly SESSION_EXPIRY_DAYS = 30;

  /**
   * Create a new session for a user and set the session cookie
   *
   * @param userId - User ID to create session for
   * @param res - Express response to set cookie on
   * @param req - Express request for IP and user agent
   * @returns Created session
   */
  async createSessionWithCookie(
    userId: string,
    res: express.Response,
    req: express.Request
  ): Promise<SessionClass> {
    const sessionId = randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + this.SESSION_EXPIRY_DAYS);

    // Create session in database
    const session = await SessionRepository.create({
      sessionId,
      userId,
      expiresAt,
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
    });

    // Set secure HTTP-only cookie
    this.setSessionCookie(res, sessionId, expiresAt);

    console.log(`✅ Session created for user ${userId}: ${sessionId}`);
    return session;
  }

  /**
   * Find or create a session for a user
   * If a valid session exists, return it
   * Otherwise, create a new session
   *
   * @param userId - User ID
   * @param res - Express response to set cookie on
   * @param req - Express request for IP and user agent
   * @returns Existing or new session
   */
  async findOrCreateSession(
    userId: string,
    res: express.Response,
    req: express.Request
  ): Promise<SessionClass> {
    // Check if user has any valid sessions
    const existingSessions = await SessionRepository.findByUserId(userId);

    if (existingSessions && existingSessions.length > 0) {
      // Use the most recent session
      const session = existingSessions[0];

      // Refresh the cookie to ensure it's set
      this.setSessionCookie(res, session.sessionId, session.expiresAt);

      console.log(`♻️  Reusing existing session for user ${userId}: ${session.sessionId}`);
      return session;
    }

    // No valid session exists, create new one
    return this.createSessionWithCookie(userId, res, req);
  }

  /**
   * Set session cookie with secure flags
   *
   * @param res - Express response
   * @param sessionId - Session ID to set in cookie
   * @param expiresAt - Cookie expiration date
   */
  private setSessionCookie(
    res: express.Response,
    sessionId: string,
    expiresAt: Date
  ): void {
    res.cookie(this.SESSION_COOKIE_NAME, sessionId, {
      httpOnly: true,      // Prevent JavaScript access (XSS protection)
      secure: process.env.NODE_ENV === 'production', // HTTPS only in production
      sameSite: 'lax',     // CSRF protection
      expires: expiresAt,  // Cookie expiry matches session expiry
      path: '/',           // Available for all routes
    });
  }

}

export default new SessionService();
