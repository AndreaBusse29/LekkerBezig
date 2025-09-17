# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Lekker Bezig is a Progressive Web App (PWA) built with vanilla HTML, CSS, and JavaScript. The name "LekkerBezig" is Dutch for "Well Done" or "Good Job".

## Development Commands

- `npm start` or `npm run dev` - Start development server on localhost:3000 (frontend only)
- `npm run server` - Start the backend server on localhost:3001 (with database and authentication)
- `npm install` - Install all dependencies (backend and frontend)

## Project Structure

```
/
├── index.html          # Main HTML file with PWA meta tags and authentication UI
├── manifest.json       # Web App Manifest for PWA features
├── sw.js              # Service Worker for offline functionality
├── app.js             # Main JavaScript application logic with authentication
├── styles.css         # CSS styling with responsive design and auth styles
├── server.js          # Express.js backend server with authentication
├── database.js        # SQLite database management
├── auth-config.js     # Authentication configuration
├── passport-config.js # Passport.js Google OAuth2 strategy
├── email.js           # Email functionality (EmailJS integration)
├── environment.js     # Environment detection utilities
├── admin.html         # Admin dashboard for viewing orders and selections
├── .env               # Environment variables (not committed to git)
├── .env.example       # Environment variables template
├── .gitignore         # Git ignore rules
├── *.db              # SQLite database files (auto-generated)
├── icons/             # PWA icons directory
│   ├── icon-template.svg      # SVG template for generating icons
│   ├── generate-icons.js      # Script to create icon placeholders
│   └── icon-*.png            # PWA icons (various sizes)
└── package.json       # Node.js dependencies and scripts
```

## PWA Architecture

### Service Worker (`sw.js`)
- Caches essential files for offline functionality
- Implements cache-first strategy for faster loading
- Automatically updates cache when new versions are deployed

### Web App Manifest (`manifest.json`)
- Defines app metadata for installation
- Configures display mode as "standalone"
- Specifies icons for various device sizes
- Sets theme colors and orientation preferences

### Main Application (`app.js`)
- Registers service worker
- Handles PWA installation prompts
- Detects if app is running in standalone mode
- Updates status indicators

## Icon Generation

Icons are currently placeholders. To generate proper PWA icons:

1. Edit `icons/icon-template.svg` with your design
2. Use online tools like PWA Asset Generator or RealFaviconGenerator
3. Replace placeholder PNG files with generated icons

## PWA Testing

To test PWA features:
1. Run `npm start` to serve the app locally
2. Open Chrome DevTools > Application > Manifest
3. Check Service Workers and Storage tabs
4. Use Lighthouse for PWA audit

## Development Environment

- Requires Node.js for the development server
- Uses `serve` package for local HTTPS serving  
- Compatible with modern browsers supporting PWA features

## Environment Configuration

This project uses environment variables for configuration. Follow these steps to set up:

### 1. Create Environment File
```bash
cp .env.example .env
```

### 2. Configure Google OAuth2
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select existing project
3. Enable Google+ API
4. Go to Credentials section
5. Create OAuth 2.0 Client ID
6. Add authorized redirect URI: `http://localhost:3001/auth/google/callback`
7. Copy Client ID and Client Secret to your `.env` file

### 3. Generate Secure Secrets
Generate secure random strings for production:
```bash
# For SESSION_SECRET
openssl rand -base64 32

# For JWT_SECRET  
openssl rand -base64 64
```

### 4. Update .env File
Edit `.env` with your actual values:
```env
NODE_ENV=development
GOOGLE_CLIENT_ID=your-actual-client-id
GOOGLE_CLIENT_SECRET=your-actual-client-secret
SESSION_SECRET=your-generated-session-secret
JWT_SECRET=your-generated-jwt-secret
PORT=3001
```

## Authentication System

### Google SSO Integration
- **Domain Restriction**: Only `@the-experts.nl` email addresses are allowed
- **OAuth2 Flow**: Standard Google OAuth2 with Passport.js
- **Session Management**: Express sessions with secure cookies
- **JWT Tokens**: For stateless authentication
- **Protected Routes**: All core API endpoints require authentication

### Authentication Flow
1. User clicks "Login with Google" 
2. Redirected to Google OAuth2 consent screen
3. Google validates user and returns to callback URL
4. Server verifies user domain (`the-experts.nl` only)
5. JWT token generated and sent to frontend
6. Frontend stores token and user data in localStorage
7. All API requests include JWT token in Authorization header

## Database Architecture

### SQLite Database (`database.js`)
- **File-based**: `lekker-bezig.db` (auto-created)
- **Tables**: `users`, `user_selections`, `orders`
- **Relationships**: Foreign keys between users and their data
- **Persistence**: Data survives server restarts

### Database Schema
```sql
users (
  id TEXT PRIMARY KEY,
  google_id TEXT UNIQUE,
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  profile_picture TEXT,
  domain TEXT,
  is_authenticated BOOLEAN DEFAULT 0,
  last_login DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)

user_selections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  selections TEXT NOT NULL, -- JSON array
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id)
)

orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  email TEXT,
  items TEXT NOT NULL, -- JSON array
  total_amount INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id)
)
```

## API Endpoints

### Authentication Routes
- `GET /auth/google` - Initiate Google OAuth2 login
- `GET /auth/google/callback` - OAuth2 callback handler
- `GET /auth/logout` - User logout
- `GET /auth/user` - Get current authenticated user

### Protected API Routes (require authentication)
- `POST /api/selections` - Save user's snack selections
- `GET /api/selections/:userId` - Get user's current selections
- `POST /api/orders` - Submit an order
- `GET /api/selections` - Get all selections (admin)
- `GET /api/orders` - Get all orders (admin)
- `GET /api/health` - Health check with statistics

## Admin Dashboard

Access the admin dashboard at `http://localhost:3001/admin.html` to view:
- All user selections
- Submitted orders
- User statistics
- Real-time data updates