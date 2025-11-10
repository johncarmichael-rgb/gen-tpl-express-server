# IAP Authentication - Implementation Checklist

## ✅ Step 1: IAP Middleware (COMPLETE)

**Created Files:**
- ✅ `src/http/nodegen/middleware/iapAuthMiddleware.ts` - JWT validation middleware
- ✅ `IAP_AUTHENTICATION.md` - Comprehensive documentation
- ✅ `IAP_USAGE_EXAMPLE.md` - Practical usage examples

**Installed Dependencies:**
- ✅ `google-auth-library` - Google OAuth client for JWT validation

**Configuration:**
- ✅ Added IAP config to `src/config.ts`
- ✅ Updated `.env.example` with IAP environment variables
- ✅ Exported middleware and types from `src/http/nodegen/middleware/index.ts`

**What It Does:**
- Extracts JWT from `x-goog-iap-jwt-assertion` header
- Validates JWT signature using Google's public keys
- Verifies audience matches your GCP project
- Attaches user data to `req.iapUser`

---

## 📋 Step 2: User Model Updates (TODO)

### Add Google Authentication Fields

**File:** `src/database/models/UserModel.ts`

Add these fields to your User model:

```typescript
@prop({ required: true, unique: true, index: true })
googleId!: string;

@prop()
profilePicture?: string;
```

**Full Example:**
```typescript
import { getModelForClass, modelOptions, prop } from '@typegoose/typegoose';
import { randomUUID } from 'crypto';

@modelOptions({
  schemaOptions: {
    collection: 'users',
    timestamps: true,
  },
})
export class User {
  @prop({ default: () => randomUUID() })
  _id!: string;

  @prop({ required: true, unique: true, index: true })
  email!: string;

  @prop({ required: true, unique: true, index: true })
  googleId!: string;  // <-- ADD THIS

  @prop({ required: true })
  name!: string;

  @prop()
  profilePicture?: string;  // <-- ADD THIS

  @prop({ required: true, index: true })
  companyId!: string;

  public createdAt!: Date;
  public updatedAt!: Date;
}

export const UserModel = getModelForClass(User);
```

---

## 📋 Step 3: User Repository Updates (TODO)

### Add Google ID Lookup Method

**File:** `src/database/UserRepository.ts`

Add this method:

```typescript
/**
 * Find user by Google ID
 */
async findByGoogleId(googleId: string): Promise<User | null> {
  return await UserModel.findOne({ googleId }).exec();
}
```

### Update Create Method

Ensure your `create()` method accepts `googleId` and `profilePicture`:

```typescript
async create(input: {
  email: string;
  googleId: string;
  name: string;
  profilePicture?: string;
  companyId: string;
}): Promise<User> {
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

---

## 📋 Step 4: Company Repository Updates (TODO)

### Add Domain Lookup Method

**File:** `src/database/CompanyRepository.ts`

Add this method if it doesn't exist:

```typescript
/**
 * Find company by email domain
 */
async findByDomain(domain: string): Promise<Company | null> {
  return await CompanyModel.findOne({ domain }).exec();
}
```

### Update Company Model

Ensure your Company model has a `domain` field:

```typescript
@prop({ required: true, unique: true, index: true })
domain!: string;
```

---

## 📋 Step 5: User Upsert Middleware (TODO)

### Create the Middleware

**File:** `src/http/nodegen/middleware/userUpsertMiddleware.ts`

See `IAP_USAGE_EXAMPLE.md` for the complete implementation.

**Key Responsibilities:**
1. Extract user data from `req.iapUser`
2. Find or create user by Google ID
3. Find or create company by email domain
4. Update user profile if data changed
5. Attach user to `req.sessionData`

### Export the Middleware

Add to `src/http/nodegen/middleware/index.ts`:

```typescript
export { default as userUpsertMiddleware } from './userUpsertMiddleware';
```

---

## 📋 Step 6: Apply Middlewares (TODO)

### Update Your Express App

**File:** `src/server.ts` (or wherever you initialize Express)

```typescript
import { 
  iapAuthMiddleware, 
  userUpsertMiddleware 
} from '@/http/nodegen/middleware';

// Apply middlewares in order
app.use(iapAuthMiddleware());      // 1. Validate IAP JWT
app.use(userUpsertMiddleware());   // 2. Upsert user in DB
```

**Order Matters:**
1. `iapAuthMiddleware()` - Validates JWT, sets `req.iapUser`
2. `userUpsertMiddleware()` - Uses `req.iapUser` to create/update user

---

## 📋 Step 7: Environment Configuration (TODO)

### Development (.env)
```env
# Disable IAP for local development
ENABLE_DEV_AUTH_BYPASS=true
IAP_ENABLED=false
```

### Production (GCP Environment Variables)
```env
NODE_ENV=production
IAP_ENABLED=true
GCP_PROJECT_NUMBER=123456789
GCP_PROJECT_ID=your-project-id

# OR for Compute Engine/Load Balancer:
GCP_PROJECT_NUMBER=123456789
GCP_BACKEND_SERVICE_ID=your-backend-service-id
```

---

## 📋 Step 8: GCP IAP Configuration (TODO)

### Enable IAP in Google Cloud Console

1. **Navigate to IAP:**
   - Go to: https://console.cloud.google.com/security/iap
   - Select your project

2. **Enable IAP for Load Balancer:**
   - Find your backend service
   - Toggle IAP to "On"
   - Configure OAuth consent screen

3. **Add Authorized Users:**
   - Click "Add Principal"
   - Enter user emails or Google Groups
   - Assign role: "IAP-secured Web App User"

4. **Get Configuration Values:**
   - Project Number: Found in project settings
   - Project ID: Your GCP project ID
   - Backend Service ID: Found in Load Balancer settings

---

## 📋 Step 9: Database Migration (TODO)

### Create Migration for User Schema Changes

**File:** `migrations/YYYYMMDDHHMMSS-add-google-auth-to-users.ts`

```typescript
export async function up(db, client) {
  await db.collection('users').updateMany(
    {},
    {
      $set: {
        googleId: null,
        profilePicture: null,
      }
    }
  );
  
  // Create indexes
  await db.collection('users').createIndex({ googleId: 1 }, { unique: true, sparse: true });
}

export async function down(db, client) {
  await db.collection('users').updateMany(
    {},
    {
      $unset: {
        googleId: '',
        profilePicture: '',
      }
    }
  );
  
  await db.collection('users').dropIndex('googleId_1');
}
```

Run migration:
```bash
npm run migration:up
```

---

## 📋 Step 10: Testing (TODO)

### Local Development Testing
```bash
# Start with dev auth bypass
ENABLE_DEV_AUTH_BYPASS=true npm run dev:start

# Test endpoints
curl http://localhost:8080/api/v1/users/me
```

### Production Testing (After GCP Deployment)
1. Deploy to GCP with IAP enabled
2. Access app through Load Balancer URL
3. Should redirect to Google OAuth login
4. After login, should see your app
5. Check logs for "IAP Auth: User {email} authenticated"

---

## 🎯 Summary

### What's Done ✅
- IAP JWT validation middleware
- Configuration setup
- Documentation and examples
- Package installation

### What's Next 📋
1. Update User model with `googleId` and `profilePicture`
2. Update UserRepository with `findByGoogleId()`
3. Update CompanyRepository with `findByDomain()`
4. Create `userUpsertMiddleware.ts`
5. Apply middlewares in Express app
6. Configure GCP IAP
7. Run database migration
8. Deploy and test

### Flow Diagram

```
User Browser
    ↓
GCP Load Balancer (IAP)
    ↓ (redirects to Google OAuth)
User Authenticates
    ↓ (JWT in x-goog-iap-jwt-assertion header)
iapAuthMiddleware()
    ↓ (validates JWT, sets req.iapUser)
userUpsertMiddleware()
    ↓ (creates/updates user, sets req.sessionData)
Your Route Handlers
    ↓ (access user via req.sessionData.userId)
Response to User
```

---

## 📚 Documentation Files

- **IAP_AUTHENTICATION.md** - How IAP works, configuration, security
- **IAP_USAGE_EXAMPLE.md** - Code examples and integration guide
- **IAP_IMPLEMENTATION_CHECKLIST.md** - This file (step-by-step guide)

---

## 🆘 Need Help?

**Common Issues:**
- Missing JWT token → Ensure accessing through GCP Load Balancer
- Invalid token → Check GCP project configuration matches env vars
- User not created → Check UserRepository and CompanyRepository methods
- 500 errors → Check logs for database connection issues

**References:**
- [Google Cloud IAP Docs](https://cloud.google.com/iap/docs)
- [IAP JWT Validation](https://cloud.google.com/iap/docs/signed-headers-howto)
