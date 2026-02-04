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
export function getIAPConfig(): IAPConfig {
  return {
    enabled: config.env === 'production' || config.iap.enabled,
    projectNumber: config.iap.projectNumber,
    projectId: config.iap.projectId,
    backendServiceId: config.iap.backendServiceId,
    devAutoSeed: config.env !== 'production' && config.iap.devAutoSeed ? config.iap.devAutoSeed : undefined,
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
export function buildExpectedAudience(iapConfig: IAPConfig): string | null {
  const { projectNumber, projectId, backendServiceId } = iapConfig;

  // Prioritize backendServiceId (Load Balancer) over projectId (App Engine)
  if (projectNumber && backendServiceId) {
    // Expected Audience for Compute Engine / Load Balancer
    return `/projects/${projectNumber}/global/backendServices/${backendServiceId}`;
  } else if (projectNumber && projectId) {
    // Expected Audience for App Engine
    return `/projects/${projectNumber}/apps/${projectId}`;
  }

  return null;
}

/**
 * Create a development IAP user object from config
 */
export function createDevIAPUser(): IAPUserData {
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
export async function validateIAPToken(token: string, expectedAudience: string): Promise<IAPUserData> {
  const oAuth2Client = new OAuth2Client();

  // Get Google's public keys and verify the JWT
  const response = await oAuth2Client.getIapPublicKeys();

  // Decode token to see actual audience (for debugging)
  const parts = token.split('.');
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
      console.verbose('🔍 IAP Token Debug:');
      console.verbose('  Expected audience:', expectedAudience);
      console.verbose('  Actual audience:  ', payload.aud);
      console.verbose('  Match:', payload.aud === expectedAudience);
    } catch (e) {
      // Ignore decode errors
    }
  }

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
export default function iapAuthMiddleware() {
  const iapConfig = getIAPConfig();

  return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      // Skip IAP validation if not enabled (typically development mode)
      if (!iapConfig.enabled && !iapConfig.devAutoSeed) {
        throw new UnauthorizedException('IAP authentication is not enabled');
      }

      // Handle the IAP parsing
      if (iapConfig.enabled) {
        const iapJwt = req.header('x-goog-iap-jwt-assertion');

        if (!iapJwt) {
          throw new UnauthorizedException('Missing IAP JWT token. This application must be accessed through Google Cloud IAP.');
        }

        // Build expected audience for validation
        const expectedAudience = buildExpectedAudience(iapConfig);

        if (!expectedAudience) {
          console.error('IAP configuration error: Missing project configuration');
          throw new InternalServerErrorException();
        }

        req.iapUser = await validateIAPToken(iapJwt, expectedAudience);
      }
      // handle auto seed for local development
      else if (iapConfig.devAutoSeed) {
        req.iapUser = createDevIAPUser();
        console.log(`IAP Auth DEV: User ${req.iapUser?.email} authenticated`);
      }
      // Else the catch-all is, error out
      else {
        throw new UnauthorizedException('Unknown authentication issue');
      }

      req.sessionData = await IapUserSessionService.handleAuthenticatedUser(req.iapUser, req);

      next();
    } catch (error) {
      // Pass any errors above to Express error handling middleware
      next(error);
    }
  };
}
