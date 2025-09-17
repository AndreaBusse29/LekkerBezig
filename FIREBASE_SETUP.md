# Firebase Setup Guide for Lekker Bezig

## Prerequisites
- Firebase account (Google account required)
- Existing SQLite data (optional - for migration)

## Step 1: Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Click "Create a project" or "Add project"
3. Enter project name (e.g., "lekker-bezig-pwa")
4. Configure Google Analytics (optional)
5. Click "Create project"

## Step 2: Enable Firestore Database

1. In your Firebase project console, navigate to "Firestore Database"
2. Click "Create database"
3. Choose "Start in production mode" (we'll configure rules later)
4. Select your preferred region (Europe for better latency)
5. Click "Enable"

## Step 3: Generate Service Account Key

1. Go to Project Settings (gear icon) > "Service accounts" tab
2. Click "Generate new private key"
3. Download the JSON file (keep it secure!)
4. Extract the following values from the JSON file:
   - `project_id`
   - `private_key_id`
   - `private_key`
   - `client_email`
   - `client_id`

## Step 4: Configure Environment Variables

1. Copy `.env.example` to `.env`
2. Update the Firebase configuration variables:

```env
FIREBASE_PROJECT_ID=your-project-id-from-json
FIREBASE_PRIVATE_KEY_ID=your-private-key-id-from-json
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR-ACTUAL-PRIVATE-KEY-HERE\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
FIREBASE_CLIENT_ID=your-client-id-from-json
FIREBASE_DATABASE_URL=https://your-project-id-default-rtdb.firebaseio.com
```

**Important**: Replace newlines in the private key with `\n` when putting it in the .env file.

## Step 5: Configure Firestore Security Rules

In Firebase Console > Firestore Database > Rules, update the rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can only read/write their own user document
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      // Admin can read all users (for admin dashboard)
      allow read: if request.auth != null;
    }
    
    // Selections are readable by authenticated users, writable by document owner
    match /selections/{selectionId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && 
                     (resource == null || resource.data.user_id == request.auth.uid);
    }
    
    // Orders are readable by authenticated users
    match /orders/{orderId} {
      allow read, write: if request.auth != null;
    }
  }
}
```

## Step 6: Create Firestore Indexes

In Firebase Console > Firestore Database > Indexes, create these composite indexes:

1. **Users Collection**:
   - `notifications_enabled` (Ascending) + `push_subscription` (Ascending)

2. **Selections Collection**:
   - `user_id` (Ascending) + `timestamp` (Descending)
   - `timestamp` (Ascending) + `user_id` (Ascending)

3. **Orders Collection**:
   - `user_id` (Ascending) + `created_at` (Descending)
   - `status` (Ascending) + `created_at` (Descending)

## Step 7: Data Migration (if migrating from SQLite)

Run the migration script to transfer existing data:

```bash
node migrate-to-firestore.js
```

This will:
- Export data from your SQLite database
- Transform it for Firestore format
- Import it to your Firestore collections
- Verify the migration

## Step 8: Test the Setup

1. Start the server: `npm run server`
2. Check the logs for "Connected to Firestore database"
3. Try logging in with Google OAuth
4. Make a test selection and verify it appears in Firebase Console

## Firestore Data Structure

### Collections:

**users/**
```javascript
{
  google_id: "string",
  name: "string", 
  email: "string",
  profile_picture: "string",
  domain: "string",
  is_authenticated: boolean,
  notifications_enabled: boolean,
  push_subscription: "string",
  last_login: timestamp,
  created_at: timestamp,
  updated_at: timestamp
}
```

**selections/** (document ID = user ID)
```javascript
{
  user_id: "string",
  selections: ["array", "of", "strings"],
  timestamp: timestamp,
  updated_at: timestamp
}
```

**orders/**
```javascript
{
  user_id: "string",
  user_name: "string",
  email: "string", 
  items: ["array", "of", "items"],
  total_amount: number,
  status: "string",
  created_at: timestamp,
  updated_at: timestamp
}
```

## Benefits of Firestore Migration

✅ **Scalability**: Auto-scaling cloud database  
✅ **Real-time**: Live data synchronization  
✅ **Reliability**: 99.95+ uptime SLA  
✅ **Security**: Built-in authentication integration  
✅ **Maintenance**: No server management required  

## Troubleshooting

### Common Issues:

1. **"Private key is not valid"**
   - Ensure private key in .env has proper newlines as `\n`
   - Check that the entire key is included including headers/footers

2. **"Permission denied"**
   - Verify Firestore security rules allow your operations
   - Check that user authentication is working

3. **"Collection not found"**
   - Collections are created automatically on first write
   - No need to manually create them

4. **"Index not found"**
   - Create required indexes in Firebase Console
   - Wait for index creation to complete (can take a few minutes)

## Cost Estimation

Firestore pricing is based on:
- Reads: $0.60 per 1M operations
- Writes: $1.80 per 1M operations  
- Storage: $0.18 per GB/month

For typical usage of Lekker Bezig PWA:
- ~100-200 users
- ~50-100 operations per user per week
- Estimated cost: $1-5 per month

## Support

If you encounter issues:
1. Check Firebase Console logs
2. Review server console for errors
3. Verify all environment variables are set correctly
4. Check Firestore security rules