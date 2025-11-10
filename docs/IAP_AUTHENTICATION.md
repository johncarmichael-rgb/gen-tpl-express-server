# Google Cloud IAP Authentication

This document explains how Google Cloud Identity-Aware Proxy (IAP) authentication works in this application.

## Overview

In production, this application is protected by Google Cloud IAP, which handles user authentication via Google OAuth. IAP injects a signed JWT token into every request, which this application validates to identify the user.

## How It Works

```
┌─────────────────┐
│  User Browser   │
└────────┬────────┘
         │ 1. Requests app
         ▼
┌─────────────────────────┐
│  GCP Load Balancer      │
│  (IAP Enabled)          │
└────────┬────────────────┘
         │ 2. Redirects to Google OAuth
         │ 3. User authenticates
         │ 4. Injects JWT in x-goog-iap-jwt-assertion header
         ▼
┌─────────────────────────┐
│  Your Node.js App       │
│  - iapAuthMiddleware    │
│  - Validates JWT        │
│  - Extracts user info   │
└─────────────────────────┘
```

## Middleware: `iapAuthMiddleware`

### What It Does

1. **Checks if IAP is enabled** - Skips validation in development mode
2. **Extracts JWT** from `x-goog-iap-jwt-assertion` header
3. **Validates JWT signature** using Google's public keys
4. **Verifies audience** matches your GCP project configuration
5. **Attaches user data** to `req.iapUser` for downstream use

### User Data Structure

After successful validation, `req.iapUser` contains:

```typescript
{
  email: string;           // user@example.com
  sub: string;             // Google user ID: "accounts.google.com:1234567890"
  name?: string;           // User's full name
  picture?: string;        // Profile picture URL
  aud: string;             // Audience claim
  iss: string;             // Issuer: "https://cloud.google.com/iap"
  iat: number;             // Issued at timestamp
  exp: number;             // Expiration timestamp
}
```

## Configuration

### Environment Variables

**Production (Required):**
```env
# Automatically enabled when NODE_ENV=production
IAP_ENABLED=true
GCP_PROJECT_NUMBER=123456789
GCP_PROJECT_ID=your-project-id

# OR for Compute Engine/Load Balancer:
GCP_PROJECT_NUMBER=123456789
GCP_BACKEND_SERVICE_ID=your-backend-service-id
```

**Development (Local):**
```env
# Disable IAP for local development
ENABLE_DEV_AUTH_BYPASS=true
```

### Configuration in `src/config.ts`

```typescript
iap: {
  enabled: ProcEnvHelper.getOrSetDefault('IAP_ENABLED', false),
  projectNumber: ProcEnvHelper.getOrSetDefault('GCP_PROJECT_NUMBER', ''),
  projectId: ProcEnvHelper.getOrSetDefault('GCP_PROJECT_ID', ''),
  backendServiceId: ProcEnvHelper.getOrSetDefault('GCP_BACKEND_SERVICE_ID', ''),
}
```

## Usage

### Apply Middleware Globally

In your Express app setup (e.g., `server.ts` or `app.ts`):

```typescript
import { iapAuthMiddleware } from '@/http/nodegen/middleware';

// Apply IAP authentication to all routes
app.use(iapAuthMiddleware());

// Your routes here...
app.use('/api', apiRoutes);
```

### Apply to Specific Routes

```typescript
import { iapAuthMiddleware } from '@/http/nodegen/middleware';

// Only protect specific routes
app.use('/api/protected', iapAuthMiddleware(), protectedRoutes);
```

### Access User Data in Routes

```typescript
import { IAPRequest } from '@/http/nodegen/middleware/iapAuthMiddleware';

app.get('/api/me', (req: IAPRequest, res) => {
  if (!req.iapUser) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  res.json({
    email: req.iapUser.email,
    name: req.iapUser.name,
    googleId: req.iapUser.sub,
  });
});
```

## Next Steps: User Upsert

After validating the IAP token, you'll typically want to:

1. **Extract user data** from `req.iapUser`
2. **Upsert user** in your database (create if new, update if exists)
3. **Attach user to session** for use throughout the request

Example flow:

```typescript
// In a middleware or route handler
const iapReq = req as IAPRequest;
const { email, sub, name } = iapReq.iapUser;

// Find or create user in database
const user = await UserRepository.findOrCreateByGoogleId({
  googleId: sub,
  email: email,
  name: name,
});

// Attach to request for downstream use
req.sessionData = {
  userId: user._id,
  // ... other session data
};
```

## Development vs Production

### Development Mode
- IAP is **disabled** (`IAP_ENABLED=false` or not set)
- Middleware calls `next()` immediately without validation
- Use `ENABLE_DEV_AUTH_BYPASS=true` for local auth bypass

### Production Mode
- IAP is **enabled** (`NODE_ENV=production` or `IAP_ENABLED=true`)
- All requests must have valid `x-goog-iap-jwt-assertion` header
- Invalid/missing tokens return 401 Unauthorized

## Security Notes

✅ **JWT Signature Validation** - Uses Google's public keys to verify authenticity  
✅ **Audience Verification** - Ensures token is for your specific GCP project  
✅ **Issuer Verification** - Confirms token is from Google Cloud IAP  
✅ **Expiration Check** - Automatically handled by `verifySignedJwtWithCertsAsync`  

⚠️ **Never disable IAP in production** - Always validate tokens  
⚠️ **Don't trust client-provided data** - Only trust `req.iapUser` after validation  
⚠️ **Log authentication failures** - Monitor for suspicious activity  

## Troubleshooting

### "Missing IAP JWT token"
- Ensure app is accessed through GCP Load Balancer with IAP enabled
- Check that IAP is properly configured in GCP Console

### "Invalid or expired IAP token"
- Verify `GCP_PROJECT_NUMBER` and `GCP_PROJECT_ID` are correct
- Check GCP IAP configuration matches your environment variables
- Ensure system clock is synchronized (JWT validation is time-sensitive)

### "IAP authentication is not properly configured"
- Set either `GCP_PROJECT_ID` (App Engine) or `GCP_BACKEND_SERVICE_ID` (Compute Engine)
- Verify `GCP_PROJECT_NUMBER` is set

## References

- [Google Cloud IAP Documentation](https://cloud.google.com/iap/docs)
- [Securing your app with signed headers](https://cloud.google.com/iap/docs/signed-headers-howto)
- [IAP JWT Validation Sample](https://cloud.google.com/iap/docs/samples/iap-validate-jwt)
