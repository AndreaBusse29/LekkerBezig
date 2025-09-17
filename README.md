# 🍟 Lekker Bezig - PWA Lunch Ordering System

**Lekker Bezig** (Dutch for "Well Done" or "Good Job") is a Progressive Web App designed for The Experts employees to order their Friday lunch snacks. The app features Google SSO authentication, real-time order management, and a sleek mobile-first design.

## ✨ Features

### 🔐 **Authentication & Security**
- **Google SSO Integration** with domain restriction to `@the-experts.nl`
- **JWT-based** stateless authentication
- **Session management** with secure cookies
- **Protected API routes** requiring authentication

### 📱 **Progressive Web App**
- **Installable** on mobile devices and desktop
- **Offline functionality** with service worker caching
- **Responsive design** optimized for mobile-first usage
- **Native app-like** experience

### 🥪 **Order Management**
- **Real-time selection** of lunch items (Kroket, Vega Kroket, Frikandel)
- **Persistent storage** of user selections
- **Order submission** with email integration
- **Admin dashboard** for viewing all orders and selections

### 🔔 **Push Notifications**
- **Friday reminders** at 11:00 AM for users without selections
- **User-controlled** notification preferences (default OFF)
- **Browser push notifications** with actionable buttons
- **One-time setup** memo shown to new users

### 💾 **Data Persistence**
- **SQLite database** for reliable data storage
- **User profiles** with Google account integration
- **Order history** tracking
- **Real-time statistics**

## 🚀 Quick Start

### Prerequisites
- **Node.js** (v16 or higher)
- **Google Cloud Console** account for OAuth2 setup

### 1. Clone & Install
```bash
git clone <repository-url>
cd LekkerBezig
npm install
```

### 2. Environment Setup
```bash
# Copy environment template
cp .env.example .env

# Generate secure secrets
openssl rand -base64 32  # Copy this for SESSION_SECRET
openssl rand -base64 64  # Copy this for JWT_SECRET
```

### 3. Google OAuth2 Configuration
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select existing
3. Enable **Google+ API**
4. Create **OAuth 2.0 Client ID**
5. Add authorized redirect URI: `http://localhost:3001/auth/google/callback`
6. Copy Client ID and Secret to your `.env` file

### 4. Push Notification Setup (Optional)
```bash
# Generate VAPID keys for push notifications
npx web-push generate-vapid-keys
```

### 5. Update `.env` File
```env
NODE_ENV=development
GOOGLE_CLIENT_ID=your-actual-client-id
GOOGLE_CLIENT_SECRET=your-actual-client-secret
SESSION_SECRET=your-generated-session-secret
JWT_SECRET=your-generated-jwt-secret
VAPID_PUBLIC_KEY=your-vapid-public-key
VAPID_PRIVATE_KEY=your-vapid-private-key
PORT=3001
```

### 5. Start the Application
```bash
# Start backend server (includes database and authentication)
npm run server

# Or start frontend only (for development)
npm start
```

### 6. Access the Application
- **Main App**: http://localhost:3001
- **Admin Dashboard**: http://localhost:3001/admin.html
- **API Health**: http://localhost:3001/api/health

## 📖 Usage

### For Employees
1. **Login** with your `@the-experts.nl` Google account
2. **Select** your preferred lunch item
3. **Submit** your order before Friday 12:00 PM
4. **View** countdown timer for order deadline

### For Administrators
1. Access the **admin dashboard** at `/admin.html`
2. **View all user selections** in real-time
3. **Monitor submitted orders** and statistics
4. **Export data** for lunch ordering

## 🏗️ Architecture

### Frontend (PWA)
- **Vanilla JavaScript** with modern ES6+ features
- **CSS Grid & Flexbox** for responsive layouts
- **Service Worker** for offline functionality
- **Web App Manifest** for installability

### Backend (Node.js/Express)
- **Express.js** web framework
- **Passport.js** for Google OAuth2 authentication
- **SQLite** database with proper relationships
- **JWT tokens** for stateless authentication
- **CORS** configured for secure cross-origin requests

### Database Schema (Firestore)

The application uses **Firebase Firestore** for cloud-based data storage:

**Collections:**
- `users/` - User profiles, authentication, and notification preferences
- `selections/` - User snack selections (one per user, using user ID as document ID)
- `orders/` - Submitted orders with items and status tracking

**Data Structure:**
```javascript
// users/{userId}
{
  google_id, name, email, profile_picture, domain,
  is_authenticated, notifications_enabled, push_subscription,
  last_login, created_at, updated_at
}

// selections/{userId}  
{
  user_id, selections[], timestamp, updated_at
}

// orders/{orderId}
{
  user_id, user_name, email, items[], total_amount,
  status, created_at, updated_at
}
```

**Migration from SQLite:** See `FIREBASE_SETUP.md` for migration guide.

## 🔧 Development

### Project Structure
```
/
├── 📄 index.html          # Main PWA interface
├── 📱 manifest.json       # PWA manifest
├── ⚙️ sw.js              # Service worker
├── 🎨 styles.css         # Responsive styling
├── 🧠 app.js             # Frontend logic + auth
├── 🖥️ server.js          # Express backend
├── 🗄️ database.js        # SQLite operations
├── 🔐 auth-config.js     # Authentication config
├── 🎫 passport-config.js # OAuth2 strategy
├── 📧 email.js           # Email integration
├── 🌍 environment.js     # Environment utilities
├── 📊 admin.html         # Admin dashboard
├── 🔒 .env               # Environment variables
├── 📋 .env.example       # Environment template
└── 📚 CLAUDE.md          # Development guide
```

### API Endpoints

#### Authentication Routes
- `GET /auth/google` - Initiate Google login
- `GET /auth/google/callback` - OAuth2 callback
- `GET /auth/logout` - User logout
- `GET /auth/user` - Current user info

#### Protected API Routes
- `POST /api/selections` - Save user selections
- `GET /api/selections/:userId` - Get user selections
- `GET /api/selections` - Get all selections (admin)
- `POST /api/orders` - Submit order
- `GET /api/orders` - Get all orders (admin)
- `GET /api/health` - Health check & statistics

#### Notification API Routes
- `GET /api/notifications/vapid-key` - Get VAPID public key
- `POST /api/notifications/subscribe` - Subscribe to push notifications (protected)
- `POST /api/notifications/unsubscribe` - Unsubscribe from notifications (protected)
- `GET /api/notifications/status` - Get notification status (protected)
- `POST /api/notifications/test-friday-reminder` - Manual test trigger (protected)

### Development Commands
```bash
npm start          # Frontend dev server (port 3000)
npm run server     # Backend server (port 3001)
npm install        # Install dependencies
```

## 🔒 Security Features

- **Domain Restriction**: Only `@the-experts.nl` emails allowed
- **HTTPS Enforcement**: Secure cookies in production
- **CORS Protection**: Configured allowed origins
- **Environment Variables**: Sensitive data in `.env`
- **SQL Injection Protection**: Parameterized queries
- **Session Security**: Secure session configuration

## 📱 PWA Features

- **App Installation**: Add to home screen on mobile/desktop
- **Offline Support**: Service worker caches essential files
- **Push Notifications**: Friday reminder system with user preferences
- **Background Sync**: Notification scheduling and delivery
- **App Shell**: Fast loading with cached shell

## 🔔 Push Notification System

### 📋 **User Experience**
1. **First Login** → Optional notification memo appears (dismissible)
2. **Settings Access** → Bell icon in user bar opens preferences
3. **Permission Flow** → Browser permission → Push subscription → Server storage
4. **Friday 11:00 AM** → Automated reminders for users without selections
5. **Click Action** → Notification opens/focuses app for selection

### ⚙️ **Technical Implementation**
- **VAPID Authentication** for secure push message delivery
- **Web Push Protocol** with actionable notification buttons
- **Cron Scheduler** running every Friday at 11:00 AM (Amsterdam timezone)  
- **Database Integration** storing user preferences and push subscriptions
- **Service Worker** handling notification display and click actions

### 🔧 **Configuration**
```bash
# Generate VAPID keys for your instance
npx web-push generate-vapid-keys

# Add to your .env file
VAPID_PUBLIC_KEY=your-generated-public-key
VAPID_PRIVATE_KEY=your-generated-private-key
```

## 🚀 Deployment

### Environment Variables (Production)
```env
NODE_ENV=production
GOOGLE_CLIENT_ID=your-production-client-id
GOOGLE_CLIENT_SECRET=your-production-client-secret
SESSION_SECRET=secure-random-session-secret
JWT_SECRET=secure-random-jwt-secret
VAPID_PUBLIC_KEY=your-production-vapid-public-key
VAPID_PRIVATE_KEY=your-production-vapid-private-key
PORT=3001
PRODUCTION_DOMAIN=https://your-domain.com
```

### Production Setup
1. **Update OAuth2 redirect URI** to production domain
2. **Configure HTTPS** with proper SSL certificates
3. **Set environment variables** on hosting platform
4. **Enable production optimizations** in Express
5. **Configure reverse proxy** (nginx/Apache) if needed

## 🤝 Contributing

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Commit** your changes (`git commit -m 'Add amazing feature'`)
4. **Push** to the branch (`git push origin feature/amazing-feature`)
5. **Open** a Pull Request

## 📄 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

## 🏢 About The Experts

This application is specifically designed for **The Experts** internal use, featuring domain-restricted authentication and Dutch language elements reflecting the company's Netherlands-based operations.

## 📞 Support

For technical support or questions:
- **Create an issue** on GitHub
- **Contact IT department** at The Experts
- **Check the documentation** in `CLAUDE.md`

---

**Made with ❤️ for The Experts team**