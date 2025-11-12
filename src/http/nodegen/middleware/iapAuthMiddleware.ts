import { OAuth2Client } from 'google-auth-library';
import express from 'express';
import config from '@/config';
import { InternalServerErrorException, UnauthorizedException } from '../errors';
import IapUserSessionService from '@/services/IapUserSessionService';

/**
 * IAP JWT payload structure from Google Cloud IAP
 */
export interface IAPUserData {
  email: string;
  sub: string; // Google user ID in format "accounts.google.com:1234567890"
  name?: string;
  picture?: string;
  aud: string; // Audience claim
  iss: string; // Issuer (should be https://cloud.google.com/iap)
  iat: number; // Issued at timestamp
  exp: number; // Expiration timestamp
}

/**
 * Configuration for IAP authentication
 */
export interface IAPConfig {
  enabled: boolean;
  projectNumber?: string;
  projectId?: string;
  backendServiceId?: string;
  devAutoSeed?: {
    enabled: boolean;
    user: {
      email: string;
      name: string;
    };
  };
}

/**
 * Get IAP configuration from environment variables
 */
export function getIAPConfig (): IAPConfig {
  return {
    enabled: config.env === 'production' || config.iap.enabled,
    projectNumber: config.iap.projectNumber,
    projectId: config.iap.projectId,
    backendServiceId: config.iap.backendServiceId,
    devAutoSeed: config.iap.devAutoSeed,
  };
}

/**
 * Build the expected audience string for JWT validation
 * What is the Audience Claim?
 * The aud (audience) field in the JWT specifies which application the token was issued
 * for. It's a critical security mechanism to prevent token reuse attacks.
 *
 * This builds the expected audience string that matches your specific GCP configuration:
 *  App Engine: /projects/123456789/apps/your-project-id
 *  Load Balancer: /projects/123456789/global/backendServices/your-backend-service-id
 *  Then verifySignedJwtWithCertsAsync() compares this against the token's aud claim.
 *
 * TL;DR
 * ✅ Required for security - Prevents token reuse from other apps
 * ✅ Required by Google's library - Can't skip this parameter
 * ✅ Matches your GCP setup - Ensures token was issued for YOUR app specifically
 */
function buildExpectedAudience (iapConfig: IAPConfig): string | null {
  const { projectNumber, projectId, backendServiceId } = iapConfig;

  if (projectNumber && projectId) {
    // Expected Audience for App Engine
    return `/projects/${projectNumber}/apps/${projectId}`;
  } else if (projectNumber && backendServiceId) {
    // Expected Audience for Compute Engine / Load Balancer
    return `/projects/${projectNumber}/global/backendServices/${backendServiceId}`;
  }

  return null;
}

/**
 * Create a development IAP user object from config
 */
function createDevIAPUser (): IAPUserData {
  const now = Math.floor(Date.now() / 1000);
  return {
    email: config.iap.devAutoSeed?.user.email || '',
    sub: `accounts.google.com:dev-${config.iap.devAutoSeed?.user.email}`,
    name: config.iap.devAutoSeed?.user.name,
    picture: undefined,
    aud: '/projects/dev/apps/dev',
    iss: 'https://cloud.google.com/iap',
    iat: now,
    exp: now + 3600, // 1 hour from now
  };
}

/**
 * Validate IAP JWT token and extract user data
 */
async function validateIAPToken (token: string, expectedAudience: string): Promise<IAPUserData> {
  const oAuth2Client = new OAuth2Client();

  // Get Google's public keys and verify the JWT
  const response = await oAuth2Client.getIapPublicKeys();
  const ticket = await oAuth2Client.verifySignedJwtWithCertsAsync(token, response.pubkeys, expectedAudience, [
    'https://cloud.google.com/iap',
  ]);

  const payload = ticket.getPayload();
  if (!payload) {
    throw new UnauthorizedException('Invalid JWT payload');
  }

  if (!payload.email || !payload.sub || !payload.iat || !payload.exp) {
    throw new UnauthorizedException('Invalid JWT payload - missing email, sub, iat, or exp');
  }

  return {
    email: payload.email,
    sub: payload.sub,
    name: payload.name,
    picture: payload.picture,
    aud: payload.aud as string,
    iss: payload.iss as string,
    iat: payload.iat,
    exp: payload.exp,
  };
}

/**
 * Express middleware to validate Google Cloud IAP JWT tokens
 *
 * This middleware:
 * 1. Checks if IAP authentication is enabled
 * 2. Extracts JWT from x-goog-iap-jwt-assertion header
 * 3. Validates the JWT signature using Google's public keys
 * 4. Attaches validated user data to req.iapUser
 *
 * @returns Express middleware function
 */
export default function iapAuthMiddleware () {
  const iapConfig = getIAPConfig();

  return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      // Skip IAP validation if not enabled (typically development mode)
      if (!iapConfig.enabled) {
        if (iapConfig.devAutoSeed) {
          req.iapUser = createDevIAPUser();
          console.log(`IAP Auth DEV: User ${req.iapUser?.email} authenticated`);
          return next();
        }
        throw new UnauthorizedException('IAP authentication is not enabled');
      }

      // Extract JWT from IAP header
      const iapJwt = req.header('x-goog-iap-jwt-assertion');

      if (!iapJwt) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Missing IAP JWT token. This application must be accessed through Google Cloud IAP.',
        });
      }

      // Build expected audience for validation
      const expectedAudience = buildExpectedAudience(iapConfig);

      if (!expectedAudience) {
        console.error('IAP configuration error: Missing project configuration');
        throw new InternalServerErrorException();
      }

      // Attach user data and session data to the request for downstream use
      req.iapUser = await validateIAPToken(iapJwt, expectedAudience);
      req.sessionData = await IapUserSessionService.handleAuthenticatedUser(req.iapUser, req);

      next();
    } catch (error) {
      // Pass any errors above to Express error handling middleware
      next(error);
    }
  };
}
