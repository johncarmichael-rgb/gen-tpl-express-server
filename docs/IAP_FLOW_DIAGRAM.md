# IAP Authentication Flow - Visual Guide

## Complete Authentication Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         USER AUTHENTICATION FLOW                        │
└─────────────────────────────────────────────────────────────────────────┘

Step 1: User Requests App
┌──────────────┐
│ User Browser │ ──────> https://your-app.example.com
└──────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        GCP Load Balancer (IAP)                          │
│  • Checks if user is authenticated                                      │
│  • If NOT authenticated → Redirect to Google OAuth                      │
└─────────────────────────────────────────────────────────────────────────┘
       │
       ▼
Step 2: Google OAuth Login
┌─────────────────────────────────────────────────────────────────────────┐
│                         Google OAuth Screen                             │
│  • User selects Google account                                          │
│  • User grants permission                                               │
│  • Google validates credentials                                         │
└─────────────────────────────────────────────────────────────────────────┘
       │
       ▼
Step 3: IAP Generates JWT
┌─────────────────────────────────────────────────────────────────────────┐
│                        GCP Load Balancer (IAP)                          │
│  • Receives OAuth token from Google                                     │
│  • Generates signed JWT with user info                                  │
│  • Injects JWT into request header: x-goog-iap-jwt-assertion           │
└─────────────────────────────────────────────────────────────────────────┘
       │
       ▼
Step 4: Request Forwarded to Your App
┌─────────────────────────────────────────────────────────────────────────┐
│                         Your Node.js App                                │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │ iapAuthMiddleware()                                            │    │
│  │  1. Extract JWT from header: x-goog-iap-jwt-assertion         │    │
│  │  2. Validate JWT signature with Google's public keys          │    │
│  │  3. Verify audience matches your GCP project                  │    │
│  │  4. Extract user data from JWT payload                        │    │
│  │  5. Attach to request: req.iapUser = { email, sub, name }    │    │
│  └────────────────────────────────────────────────────────────────┘    │
│         │                                                                │
│         ▼                                                                │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │ userUpsertMiddleware()                                         │    │
│  │  1. Extract data from req.iapUser                             │    │
│  │  2. Parse Google ID from sub field                            │    │
│  │  3. Find user by googleId in database                         │    │
│  │  4. If NOT found:                                             │    │
│  │     • Extract email domain                                     │    │
│  │     • Find or create company by domain                        │    │
│  │     • Create new user with Google data                        │    │
│  │  5. If found:                                                 │    │
│  │     • Update user profile if data changed                     │    │
│  │  6. Attach to request: req.sessionData = { userId, ... }     │    │
│  └────────────────────────────────────────────────────────────────┘    │
│         │                                                                │
│         ▼                                                                │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │ Your Route Handler                                             │    │
│  │  • Access user: req.sessionData.userId                        │    │
│  │  • Access IAP data: req.iapUser.email                         │    │
│  │  • Perform business logic                                      │    │
│  │  • Return response                                             │    │
│  └────────────────────────────────────────────────────────────────┘    │
│         │                                                                │
└─────────┼────────────────────────────────────────────────────────────────┘
          │
          ▼
Step 5: Response to User
┌──────────────┐
│ User Browser │ <────── JSON Response
└──────────────┘
```

---

## JWT Token Structure

### Header (x-goog-iap-jwt-assertion)
```
eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6IjAyNzQ5In0.eyJhdWQiOiIvcHJvamVjdHMvMTIzNDU2Nzg5L2FwcHMveW91ci1wcm9qZWN0LWlkIiwiZW1haWwiOiJ1c2VyQGV4YW1wbGUuY29tIiwiZXhwIjoxNjMwMDAwMDAwLCJnY3AiOnsicHJvamVjdCI6eyJwcm9qZWN0X251bWJlciI6IjEyMzQ1Njc4OSJ9fSwiaWF0IjoxNjI5OTk5MDAwLCJpc3MiOiJodHRwczovL2Nsb3VkLmdvb2dsZS5jb20vaWFwIiwic3ViIjoiYWNjb3VudHMuZ29vZ2xlLmNvbToxMTIzNDU2Nzg5MCJ9.signature
```

### Decoded Payload
```json
{
  "aud": "/projects/123456789/apps/your-project-id",
  "email": "user@example.com",
  "sub": "accounts.google.com:112345678901",
  "name": "John Doe",
  "picture": "https://lh3.googleusercontent.com/...",
  "iss": "https://cloud.google.com/iap",
  "iat": 1629999000,
  "exp": 1630000000
}
```

---

## Data Flow Through Request Object

```typescript
// After iapAuthMiddleware()
req.iapUser = {
  email: "user@example.com",
  sub: "accounts.google.com:112345678901",
  name: "John Doe",
  picture: "https://...",
  aud: "/projects/123456789/apps/your-project-id",
  iss: "https://cloud.google.com/iap",
  iat: 1629999000,
  exp: 1630000000
}

// After userUpsertMiddleware()
req.sessionData = {
  userId: "550e8400-e29b-41d4-a716-446655440000",
  sessionId: "iap-112345678901"
}

// In your route handler
const user = await UserRepository.findById(req.sessionData.userId);
// user = {
//   _id: "550e8400-e29b-41d4-a716-446655440000",
//   email: "user@example.com",
//   googleId: "112345678901",
//   name: "John Doe",
//   profilePicture: "https://...",
//   companyId: "660e8400-e29b-41d4-a716-446655440000",
//   createdAt: "2024-01-01T00:00:00.000Z",
//   updatedAt: "2024-01-01T00:00:00.000Z"
// }
```

---

## Database Operations

### First-Time User Login

```
1. User logs in with user@example.com
   ↓
2. iapAuthMiddleware validates JWT
   ↓
3. userUpsertMiddleware extracts:
   • email: user@example.com
   • googleId: 112345678901
   • domain: example.com
   ↓
4. Check if user exists by googleId
   → NOT FOUND
   ↓
5. Check if company exists by domain "example.com"
   → NOT FOUND
   ↓
6. Create new company:
   {
     _id: "660e8400-...",
     name: "example.com",
     domain: "example.com"
   }
   ↓
7. Create new user:
   {
     _id: "550e8400-...",
     email: "user@example.com",
     googleId: "112345678901",
     name: "John Doe",
     companyId: "660e8400-..."
   }
   ↓
8. Attach to request:
   req.sessionData.userId = "550e8400-..."
```

### Returning User Login

```
1. User logs in with user@example.com
   ↓
2. iapAuthMiddleware validates JWT
   ↓
3. userUpsertMiddleware extracts googleId: 112345678901
   ↓
4. Check if user exists by googleId
   → FOUND
   ↓
5. Check if profile data changed
   → If yes: Update user record
   → If no: Skip update
   ↓
6. Attach to request:
   req.sessionData.userId = "550e8400-..."
```

---

## Development vs Production

### Development Mode (Local)
```
┌──────────────┐
│ User Browser │ ──────> http://localhost:8080/api/users/me
└──────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Your Node.js App                                │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │ iapAuthMiddleware()                                            │    │
│  │  • IAP_ENABLED = false                                        │    │
│  │  • Calls next() immediately (skip validation)                 │    │
│  └────────────────────────────────────────────────────────────────┘    │
│         │                                                                │
│         ▼                                                                │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │ userUpsertMiddleware()                                         │    │
│  │  • req.iapUser is undefined                                   │    │
│  │  • Calls next() immediately (skip upsert)                     │    │
│  └────────────────────────────────────────────────────────────────┘    │
│         │                                                                │
│         ▼                                                                │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │ TEMP_DEV_AUTH_BYPASS (if enabled)                             │    │
│  │  • Auto-creates dev session                                    │    │
│  │  • Sets req.sessionData with dev user                         │    │
│  └────────────────────────────────────────────────────────────────┘    │
│         │                                                                │
│         ▼                                                                │
│  Your Route Handler (works normally)                                    │
└─────────────────────────────────────────────────────────────────────────┘
```

### Production Mode (GCP)
```
┌──────────────┐
│ User Browser │ ──────> https://your-app.example.com/api/users/me
└──────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    GCP Load Balancer (IAP Enabled)                      │
│  • Validates user is authenticated                                      │
│  • Injects x-goog-iap-jwt-assertion header                             │
└─────────────────────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Your Node.js App                                │
│                                                                          │
│  iapAuthMiddleware() → userUpsertMiddleware() → Route Handler          │
│  (Full authentication flow as shown in main diagram)                    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Security Validation Steps

### iapAuthMiddleware Security Checks

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      JWT Validation Process                             │
└─────────────────────────────────────────────────────────────────────────┘

1. Extract JWT from header
   ✓ Header exists: x-goog-iap-jwt-assertion
   ✗ Missing → 401 Unauthorized

2. Fetch Google's public keys
   ✓ Keys retrieved from Google
   ✗ Failed → 500 Configuration Error

3. Verify JWT signature
   ✓ Signature valid (signed by Google)
   ✗ Invalid → 401 Invalid token

4. Verify audience claim
   ✓ aud matches: /projects/{number}/apps/{id}
   ✗ Mismatch → 401 Invalid token

5. Verify issuer
   ✓ iss = https://cloud.google.com/iap
   ✗ Wrong issuer → 401 Invalid token

6. Verify expiration
   ✓ exp > current time
   ✗ Expired → 401 Invalid token

7. Extract user data
   ✓ All checks passed
   → Attach to req.iapUser
```

---

## Error Handling Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Error Scenarios                                 │
└─────────────────────────────────────────────────────────────────────────┘

Scenario 1: Missing IAP Header
  Request → iapAuthMiddleware()
    ↓
  No x-goog-iap-jwt-assertion header
    ↓
  Response: 401 Unauthorized
  {
    "error": "Unauthorized",
    "message": "Missing IAP JWT token. This application must be accessed through Google Cloud IAP."
  }

Scenario 2: Invalid JWT Token
  Request → iapAuthMiddleware()
    ↓
  JWT validation fails (bad signature, expired, wrong audience)
    ↓
  Response: 401 Unauthorized
  {
    "error": "Unauthorized",
    "message": "Invalid or expired IAP token."
  }

Scenario 3: Database Error During Upsert
  Request → iapAuthMiddleware() ✓
    ↓
  userUpsertMiddleware()
    ↓
  Database connection error
    ↓
  Response: 500 Internal Server Error
  {
    "error": "Internal Server Error",
    "message": "Failed to process user authentication"
  }

Scenario 4: User Not Found (After Upsert)
  Request → iapAuthMiddleware() ✓
    ↓
  userUpsertMiddleware() ✓
    ↓
  Route Handler
    ↓
  UserRepository.findById() returns null
    ↓
  Response: 404 Not Found
  {
    "error": "User not found"
  }
```

---

## Quick Reference

### Environment Variables
```bash
# Development
ENABLE_DEV_AUTH_BYPASS=true
IAP_ENABLED=false

# Production
NODE_ENV=production
IAP_ENABLED=true
GCP_PROJECT_NUMBER=123456789
GCP_PROJECT_ID=your-project-id
```

### Request Object Properties
```typescript
req.iapUser          // IAP user data (after iapAuthMiddleware)
req.sessionData      // Session data (after userUpsertMiddleware)
```

### Import Statements
```typescript
import { iapAuthMiddleware, IAPRequest, IAPUserData } from '@/http/nodegen/middleware';
import { userUpsertMiddleware } from '@/http/nodegen/middleware';
```

### Middleware Order
```typescript
app.use(iapAuthMiddleware());      // 1. Validate IAP JWT
app.use(userUpsertMiddleware());   // 2. Upsert user
app.use('/api', routes);           // 3. Your routes
```
