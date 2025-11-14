import express from 'express';
import UserRepository from '@/database/UserRepository';
import CompanyRepository from '@/database/CompanyRepository';
import SessionService from '@/services/SessionService';
import { getIAPConfig, IAPUserData } from '@/http/nodegen/middleware/iapAuthMiddleware';
import { BadRequestException, ForbiddenException } from '@/http/nodegen/errors';
import { SessionClass } from '@/database/models/SessionModel';
import { AiModel } from '@/http/nodegen/interfaces/Company';

/**
 * IapUserSessionService
 *
 * Handles all database and session operations for IAP-authenticated users.
 * This service is called by iapAuthMiddleware after JWT validation.
 *
 * Responsibilities:
 * - Find or create users based on IAP data
 * - Create companies for new users
 * - Manage sessions and cookies
 * - Attach session data to requests
 */
class IapUserSessionService {
  /**
   * Handle complete user and session setup for IAP-authenticated request
   *
   * This is the main entry point called by AccessTokenService.
   *
   * Flow:
   * 1. Find or create user (and company if needed)
   * 2. Find or create session (for tracking/analytics)
   * 3. Return session data to attach to request
   *
   * @param iapUserData - Validated IAP user data from JWT
   * @param req - Express request (for IP and user agent)
   * @returns Session data to attach to request
   */
  async handleAuthenticatedUser(iapUserData: IAPUserData, req: express.Request): Promise<SessionClass> {
    // Find or create user (and company if needed)
    const user = await this.findOrCreateUser(iapUserData);

    // Find or create session (for tracking/analytics)
    const session = await SessionService.findOrCreateSession(user._id, req);

    console.log(`🔐 IAP Auth complete: ${user.email} → Session: ${session.sessionId}`);

    // Return session data to attach to request
    return session;
  }

  /**
   * Find or create user based on IAP user data
   *
   * Flow:
   * 1. Look up user by externalId (Google sub)
   * 2. If user exists, return user
   * 3. If user doesn't exist:
   *    - Extract email domain
   *    - Look up company by domain
   *    - If company found, create user and assign to that company
   *    - If no company found, reject (admin must create company first)
   *
   * @param iapUser - Validated IAP user data from JWT
   * @returns User document
   * @throws Error if no company exists for the user's domain
   */
  private async findOrCreateUser(iapUser: IAPUserData) {
    // Try to find existing user by Google sub (externalId)
    let user = await UserRepository.findByExternalId(iapUser.sub);

    if (user) {
      console.verbose(`✅ Existing user found: ${user.email} (${user._id})`);
      return user;
    }

    // User doesn't exist - look up company by email domain
    console.log(`🆕 New user attempting to sign in: ${iapUser.email}`);

    // Extract email domain
    const emailDomain = iapUser.email.split('@')[1];
    if (!emailDomain) {
      throw new BadRequestException('Invalid email format - no domain found');
    }

    // Look up company by domain
    let company = await CompanyRepository.findByDomain(emailDomain);

    if (!company) {
      const iapConfig = getIAPConfig();
      if (!iapConfig.enabled && iapConfig.devAutoSeed) {
        company = await this.createDummyCompany(iapConfig.devAutoSeed.user.email.split('@')[1]);
        console.log('🏢 Dummy Company created: ', iapConfig);
      } else {
        console.error(`❌ No company found for domain: ${emailDomain}`);
        throw new ForbiddenException({
          message: `Access denied: No company exists for domain "${emailDomain}"`,
          details: 'Please contact your administrator to set up your company account.',
          domain: emailDomain,
        });
      }
    }

    console.log(`🏢 Company found for domain ${emailDomain}: ${company.name} (${company._id})`);

    // Parse name into first and last name
    const nameParts = (iapUser.name || iapUser.email.split('@')[0]).split(' ');
    const firstName = nameParts[0] || 'User';
    const lastName = nameParts.slice(1).join(' ') || '';

    // Create user and assign to company
    user = await UserRepository.create({
      email: iapUser.email,
      firstName,
      lastName,
      companyId: company._id,
      externalId: iapUser.sub,
      avatar: iapUser.picture,
      displayName: iapUser.name,
      createdBy: 'system',
    });

    console.log(`👤 User created and assigned to ${company.name}: ${user.email} (${user._id})`);

    return user;
  }

  /**
   * Creates a dummy company based on the iap.devAutoSeed.user.email domain
   * Upserts dummy user and automatically links on creation
   */
  private createDummyCompany(domain: string) {
    return CompanyRepository.create({
      createdBy: 'system',
      name: domain,
      aiModel: AiModel.ClaudeHaiku45,
      domains: [domain],
    });
  }
}

export default new IapUserSessionService();
