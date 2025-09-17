// Google OAuth2 Configuration
// To set up Google SSO:
// 1. Go to Google Cloud Console (console.cloud.google.com)
// 2. Create a new project or select existing project
// 3. Enable Google+ API
// 4. Go to Credentials section
// 5. Create OAuth 2.0 Client ID
// 6. Set authorized redirect URI to: http://localhost:3001/auth/google/callback (for development)
// 7. For production, use your actual domain: https://yourdomain.com/auth/google/callback
// 8. Copy Client ID and Client Secret below

const authConfig = {
    google: {
        clientID: process.env.GOOGLE_CLIENT_ID || 'your-google-client-id-here',
        clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'your-google-client-secret-here',
        callbackURL: process.env.NODE_ENV === 'production' 
            ? 'https://your-production-domain.com/auth/google/callback'
            : 'http://localhost:3001/auth/google/callback'
    },
    session: {
        secret: process.env.SESSION_SECRET || 'your-super-secret-session-key-change-this-in-production',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    },
    jwt: {
        secret: process.env.JWT_SECRET || 'your-jwt-secret-change-this-in-production',
        expiresIn: '7d'
    },
    allowedDomain: 'the-experts.nl'
};

module.exports = authConfig;