# IAP Authentication - Usage Examples

This document provides practical examples of how to use the IAP authentication middleware in your application.

## Table of Contents
1. [Basic Setup](#basic-setup)
2. [User Upsert Middleware](#user-upsert-middleware)
3. [Route Handler Examples](#route-handler-examples)
4. [Complete Integration Example](#complete-integration-example)

---

## Basic Setup

### 1. Apply Middleware Globally

In your main Express app file (e.g., `src/server.ts` or `src/app.ts`):

```typescript
import express from 'express';
import { iapAuthMiddleware } from '@/http/nodegen/middleware';

const app = express();

// Apply IAP authentication to all routes
// This runs BEFORE any route handlers
app.use(iapAuthMiddleware());

// Your routes
app.use('/api', apiRoutes);

app.listen(8080, () => {
  console.log('Server running on port 8080');
});
```

---

## User Upsert Middleware

Create a middleware that automatically upserts users after IAP validation:

### File: `src/http/nodegen/middleware/userUpsertMiddleware.ts`

```typescript
import express from 'express';
import { IAPRequest } from './iapAuthMiddleware';
import UserRepository from '@/database/UserRepository';
import CompanyRepository from '@/database/CompanyRepository';

/**
 * Middleware to upsert user from IAP data and attach to request
 * 
 * This middleware should run AFTER iapAuthMiddleware
 * It extracts user data from req.iapUser and:
 * 1. Finds or creates the user in the database
 * 2. Attaches user to req.sessionData for downstream use
 */
export default function userUpsertMiddleware() {
  return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const iapReq = req as IAPRequest;

    // Skip if IAP is not enabled (development mode)
    if (!iapReq.iapUser) {
      return next();
    }

    try {
      const { email, sub, name, picture } = iapReq.iapUser;

      // Extract Google ID from sub (format: "accounts.google.com:1234567890")
      const googleId = sub.split(':')[1] || sub;

      // Find or create user by Google ID
      let user = await UserRepository.findByGoogleId(googleId);

      if (!user) {
        // User doesn't exist, create new user
        console.log(`Creating new user from IAP: ${email}`);

        // Extract company domain from email (e.g., "example.com" from "user@example.com")
        const emailDomain = email.split('@')[1];

        // Find or create company by domain
        let company = await CompanyRepository.findByDomain(emailDomain);
        
        if (!company) {
          // Create new company
          company = await CompanyRepository.create({
            name: emailDomain,
            domain: emailDomain,
          });
          console.log(`Created new company: ${emailDomain}`);
        }

        // Create user
        user = await UserRepository.create({
          email: email,
          googleId: googleId,
          name: name || email.split('@')[0],
          profilePicture: picture,
          companyId: company._id,
        });
      } else {
        // User exists, update profile data if changed
        const updates: any = {};
        
        if (user.email !== email) updates.email = email;
        if (name && user.name !== name) updates.name = name;
        if (picture && user.profilePicture !== picture) updates.profilePicture = picture;

        if (Object.keys(updates).length > 0) {
          await UserRepository.update({
            _id: user._id,
            updates: updates,
          });
          console.log(`Updated user profile: ${email}`);
        }
      }

      // Attach user data to request for downstream use
      iapReq.sessionData = {
        userId: user._id,
        sessionId: `iap-${googleId}`, // Generate session ID from Google ID
      };

      console.log(`IAP Auth: User ${email} (${user._id}) authenticated`);
      next();
    } catch (error) {
      console.error('User upsert error:', error);
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to process user authentication',
      });
    }
  };
}
```

### Export from middleware index

Add to `src/http/nodegen/middleware/index.ts`:

```typescript
export { default as userUpsertMiddleware } from './userUpsertMiddleware';
```

### Apply in your app

```typescript
import { iapAuthMiddleware, userUpsertMiddleware } from '@/http/nodegen/middleware';

// Apply both middlewares in order
app.use(iapAuthMiddleware());      // 1. Validate IAP token
app.use(userUpsertMiddleware());   // 2. Upsert user in database
```

---

## Route Handler Examples

### Example 1: Get Current User Profile

```typescript
import { IAPRequest } from '@/http/nodegen/middleware';
import UserRepository from '@/database/UserRepository';

export default async (req: IAPRequest, res: express.Response) => {
  try {
    // User ID is available from sessionData (set by userUpsertMiddleware)
    const userId = req.sessionData.userId;
    
    const user = await UserRepository.findById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      id: user._id,
      email: user.email,
      name: user.name,
      profilePicture: user.profilePicture,
      companyId: user.companyId,
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
```

### Example 2: Access IAP User Data Directly

```typescript
import { IAPRequest } from '@/http/nodegen/middleware';

export default async (req: IAPRequest, res: express.Response) => {
  // Access raw IAP user data (if needed)
  const iapUser = req.iapUser;
  
  if (!iapUser) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  res.json({
    email: iapUser.email,
    googleId: iapUser.sub,
    name: iapUser.name,
    picture: iapUser.picture,
  });
};
```

### Example 3: Company-Scoped Data Access

```typescript
import { IAPRequest } from '@/http/nodegen/middleware';
import UserRepository from '@/database/UserRepository';
import DataRepository from '@/database/DataRepository';

export default async (req: IAPRequest, res: express.Response) => {
  try {
    const userId = req.sessionData.userId;
    
    // Get user to access their company
    const user = await UserRepository.findById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Fetch data scoped to user's company
    const companyData = await DataRepository.findByCompanyId({
      companyId: user.companyId,
      offset: 0,
      limit: 50,
    });

    res.json({
      companyId: user.companyId,
      data: companyData,
    });
  } catch (error) {
    console.error('Get company data error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
```

---

## Complete Integration Example

### File: `src/server.ts`

```typescript
import express from 'express';
import config from '@/config';
import { 
  iapAuthMiddleware, 
  userUpsertMiddleware,
  corsMiddleware,
  handleHttpException,
  handleExpress404,
} from '@/http/nodegen/middleware';

const app = express();

// Basic middleware
app.use(express.json());
app.use(corsMiddleware());

// ============================================
// IAP Authentication Flow
// ============================================
// 1. Validate IAP JWT token (extracts user data from Google)
app.use(iapAuthMiddleware());

// 2. Upsert user in database (creates/updates user record)
app.use(userUpsertMiddleware());

// ============================================
// Routes (all protected by IAP)
// ============================================
app.use('/api/v1', apiRoutes);

// Error handlers
app.use(handleExpress404);
app.use(handleHttpException);

// Start server
const PORT = config.port || 8080;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`IAP Authentication: ${config.iap.enabled ? 'ENABLED' : 'DISABLED'}`);
  console.log(`Dev Auth Bypass: ${config.enableDevAuthBypass ? 'ENABLED' : 'DISABLED'}`);
});
```

---

## User Repository Methods Needed

You'll need to add these methods to your `UserRepository`:

```typescript
// src/database/UserRepository.ts

/**
 * Find user by Google ID
 */
async findByGoogleId(googleId: string): Promise<UserModel | null> {
  return await UserModel.findOne({ googleId }).exec();
}

/**
 * Create user with Google authentication data
 */
async create(input: {
  email: string;
  googleId: string;
  name: string;
  profilePicture?: string;
  companyId: string;
}): Promise<UserModel> {
  const user = new UserModel({
    _id: randomUUID(),
    email: input.email,
    googleId: input.googleId,
    name: input.name,
    profilePicture: input.profilePicture,
    companyId: input.companyId,
  });
  
  return await user.save();
}
```

## User Model Updates Needed

Add `googleId` field to your User model:

```typescript
// src/database/models/UserModel.ts

@modelOptions({
  schemaOptions: {
    collection: 'users',
    timestamps: true,
  },
})
export class User implements IUser {
  @prop({ default: () => randomUUID() })
  _id!: string;

  @prop({ required: true, unique: true, index: true })
  email!: string;

  @prop({ required: true, unique: true, index: true })
  googleId!: string;  // <-- ADD THIS

  @prop({ required: true })
  name!: string;

  @prop()
  profilePicture?: string;  // <-- ADD THIS (optional)

  @prop({ required: true, index: true })
  companyId!: string;

  public createdAt!: Date;
  public updatedAt!: Date;
}

export const UserModel = getModelForClass(User);
```

---

## Testing

### Development Mode (IAP Disabled)
```bash
# .env
ENABLE_DEV_AUTH_BYPASS=true
IAP_ENABLED=false
```

### Production Mode (IAP Enabled)
```bash
# .env
NODE_ENV=production
IAP_ENABLED=true
GCP_PROJECT_NUMBER=123456789
GCP_PROJECT_ID=your-project-id
```

### Test with curl (Production)
```bash
# This will fail without IAP header
curl http://localhost:8080/api/v1/users/me

# In production, requests come through GCP Load Balancer with IAP header
# You cannot manually test IAP locally - deploy to GCP to test
```

---

## Summary

1. ✅ **IAP Middleware** validates Google JWT tokens
2. ✅ **User Upsert Middleware** creates/updates users automatically
3. ✅ **Route Handlers** access authenticated user via `req.sessionData.userId`
4. ✅ **Development Mode** bypasses IAP for local testing
5. ✅ **Production Mode** enforces IAP authentication

**Next Steps:**
1. Add `googleId` and `profilePicture` fields to User model
2. Add `findByGoogleId()` method to UserRepository
3. Create `userUpsertMiddleware.ts`
4. Apply middlewares in your Express app
5. Deploy to GCP with IAP enabled
