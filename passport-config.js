const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const authConfig = require('./auth-config');

function initializePassport(db) {
    passport.use(new GoogleStrategy({
        clientID: authConfig.google.clientID,
        clientSecret: authConfig.google.clientSecret,
        callbackURL: authConfig.google.callbackURL
    },
    async (accessToken, refreshToken, profile, done) => {
        try {
            const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
            const domain = email ? email.split('@')[1] : null;

            // Check if user's email domain is allowed
            if (domain !== authConfig.allowedDomain) {
                return done(null, false, { 
                    message: `Access restricted to ${authConfig.allowedDomain} domain only` 
                });
            }

            // Check if user exists in database
            let user = await db.getUserByGoogleId(profile.id);
            
            if (user) {
                // Update user info if needed
                await db.updateUser(user.id, {
                    name: profile.displayName,
                    email: email,
                    profilePicture: profile.photos && profile.photos[0] ? profile.photos[0].value : null,
                    lastLogin: new Date().toISOString()
                });
                user = await db.getUserByGoogleId(profile.id);
            } else {
                // Create new user
                const userId = `google_${profile.id}`;
                await db.createUser({
                    id: userId,
                    googleId: profile.id,
                    name: profile.displayName,
                    email: email,
                    profilePicture: profile.photos && profile.photos[0] ? profile.photos[0].value : null,
                    domain: domain,
                    isAuthenticated: true
                });
                user = await db.getUserByGoogleId(profile.id);
            }

            return done(null, user);
        } catch (error) {
            console.error('Error in Google OAuth strategy:', error);
            return done(error, null);
        }
    }));

    passport.serializeUser((user, done) => {
        done(null, user.id);
    });

    passport.deserializeUser(async (id, done) => {
        try {
            const user = await db.getUser(id);
            done(null, user);
        } catch (error) {
            done(error, null);
        }
    });
}

module.exports = initializePassport;