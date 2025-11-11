import express from 'express';
import { randomUUID } from 'crypto';
import SessionRepository from '@/database/SessionRepository';
import { SessionClass } from '@/database/models/SessionModel';

/**
 * SessionService
 *
 * Manages user sessions in the database for tracking and analytics.
 * Sessions are created per login and stored for audit purposes.
 * Authentication is handled by IAP JWT, not session cookies.
 */
class SessionService {
  private readonly SESSION_EXPIRY_DAYS = 30;

  /**
   * Create a new session for a user
   *
   * @param userId - User ID to create session for
   * @param req - Express request for IP and user agent
   * @returns Created session
   */
  async createSession(
    userId: string,
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

    console.log(`✅ Session created for user ${userId}: ${sessionId}`);
    return session;
  }

  /**
   * Find or create a session for a user
   * If a valid session exists, return it
   * Otherwise, create a new session
   *
   * @param userId - User ID
   * @param req - Express request for IP and user agent
   * @returns Existing or new session
   */
  async findOrCreateSession(
    userId: string,
    req: express.Request
  ): Promise<SessionClass> {
    // Check if user has any valid sessions
    const existingSessions = await SessionRepository.findByUserId(userId);

    if (existingSessions && existingSessions.length > 0) {
      // Use the most recent session
      const session = existingSessions[0];
      console.log(`♻️  Reusing existing session for user ${userId}: ${session.sessionId}`);
      return session;
    }

    // No valid session exists, create new one
    return this.createSession(userId, req);
  }

}

export default new SessionService();
