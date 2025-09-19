// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const passport = require('passport');
const jwt = require('jsonwebtoken');
const webpush = require('web-push');
const cron = require('node-cron');
const FirestoreDatabase = require('./firestore-database');
const initializePassport = require('./passport-config');
const authConfig = require('./auth-config');

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize database
const db = new FirestoreDatabase();

// Initialize Passport
initializePassport(db);

// Configure web-push
const vapidKeys = {
    publicKey: process.env.VAPID_PUBLIC_KEY,
    privateKey: process.env.VAPID_PRIVATE_KEY
};

// Validate VAPID keys are configured
if (!vapidKeys.publicKey || !vapidKeys.privateKey) {
    console.error('❌ VAPID keys not configured! Please set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in .env');
    console.log('   Generate keys with: npx web-push generate-vapid-keys');
    process.exit(1);
}

webpush.setVapidDetails(
    'mailto:admin@the-experts.nl',
    vapidKeys.publicKey,
    vapidKeys.privateKey
);

// Middleware
app.use(cors({
    origin: process.env.NODE_ENV === 'production' 
        ? ['https://lekkerbezig-3fffa.web.app']
        : ['http://localhost:3000', 'http://localhost:3001'],
    credentials: true
}));

app.use(express.json());

// Custom static file handler to protect admin.html
app.use((req, res, next) => {
    if (req.path === '/admin.html') {
        return res.redirect('/admin');
    }
    next();
});

app.use(express.static('.'));

// Session configuration
app.use(session({
    secret: authConfig.session.secret,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: authConfig.session.maxAge
    }
}));

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// Authentication middleware
function isAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    res.status(401).json({ error: 'Authentication required' });
}

function requireTheExpertsDomain(req, res, next) {
    if (req.user && req.user.domain === 'the-experts.nl') {
        return next();
    }
    res.status(403).json({ error: 'Access restricted to the-experts.nl domain' });
}

// Authentication Routes
app.get('/auth/google',
    passport.authenticate('google', { scope: ['profile', 'email'] })
);

app.get('/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/?error=auth_failed' }),
    (req, res) => {
        // Generate JWT token
        const token = jwt.sign(
            { 
                userId: req.user.id, 
                email: req.user.email,
                name: req.user.name 
            },
            authConfig.jwt.secret,
            { expiresIn: authConfig.jwt.expiresIn }
        );
        
        // Redirect to frontend with token
        res.redirect(`/?token=${token}&user=${encodeURIComponent(JSON.stringify({
            id: req.user.id,
            name: req.user.name,
            email: req.user.email,
            profilePicture: req.user.profile_picture
        }))}`);
    }
);

app.get('/auth/logout', (req, res) => {
    req.logout((err) => {
        if (err) {
            return res.status(500).json({ error: 'Logout failed' });
        }
        req.session.destroy((err) => {
            if (err) {
                return res.status(500).json({ error: 'Session destruction failed' });
            }
            res.clearCookie('connect.sid');
            res.json({ message: 'Logged out successfully' });
        });
    });
});

app.get('/auth/user', isAuthenticated, (req, res) => {
    res.json({
        id: req.user.id,
        name: req.user.name,
        email: req.user.email,
        profilePicture: req.user.profile_picture,
        domain: req.user.domain,
        isAuthenticated: true
    });
});

// Protected Admin Dashboard Route
app.get('/admin', isAuthenticated, (req, res) => {
    const fs = require('fs');
    const path = require('path');
    
    try {
        // Read the admin.html file
        const adminHtmlPath = path.join(__dirname, 'admin.html');
        let adminHtml = fs.readFileSync(adminHtmlPath, 'utf8');
        
        // Inject user information and authentication token into the HTML
        const userScript = `
        <script>
            window.AUTHENTICATED_USER = {
                id: '${req.user.id}',
                name: '${req.user.name}',
                email: '${req.user.email}',
                domain: '${req.user.domain}'
            };
        </script>`;
        
        // Insert the script before the closing head tag
        adminHtml = adminHtml.replace('</head>', userScript + '\n</head>');
        
        res.send(adminHtml);
    } catch (error) {
        console.error('Error serving admin dashboard:', error);
        res.status(500).send('Error loading admin dashboard');
    }
});

// API Routes (Protected - require authentication)
app.post('/api/selections', isAuthenticated, async (req, res) => {
    try {
        const { userId, selections, userName, timestamp } = req.body;
        
        if (!userId || !selections) {
            return res.status(400).json({ 
                error: 'Missing required fields: userId and selections' 
            });
        }

        // Store user selection in database
        await db.saveUserSelection(userId, {
            userName: userName || `User ${userId}`,
            selections,
            timestamp: timestamp || new Date().toISOString()
        });

        const savedData = await db.getUserSelection(userId);

        res.json({ 
            message: 'Selection saved successfully',
            data: savedData
        });
    } catch (error) {
        console.error('Error saving selection:', error);
        res.status(500).json({ error: 'Failed to save selection' });
    }
});

// Get user's current selection
app.get('/api/selections/:userId', isAuthenticated, async (req, res) => {
    try {
        const { userId } = req.params;
        const selection = await db.getUserSelection(userId);
        
        if (!selection) {
            return res.status(404).json({ error: 'Selection not found' });
        }
        
        res.json(selection);
    } catch (error) {
        console.error('Error retrieving selection:', error);
        res.status(500).json({ error: 'Failed to retrieve selection' });
    }
});

// Get all selections (admin only - protected)
app.get('/api/selections', isAuthenticated, async (req, res) => {
    try {
        const selections = await db.getAllSelections();
        const stats = await db.getStats();
        
        res.json({
            totalUsers: stats.totalSelections,
            selections: selections
        });
    } catch (error) {
        console.error('Error retrieving selections:', error);
        res.status(500).json({ error: 'Failed to retrieve selections' });
    }
});

// Delete user selection (admin only - protected)
app.delete('/api/selections/:userId', isAuthenticated, async (req, res) => {
    try {
        const { userId } = req.params;
        
        if (!userId) {
            return res.status(400).json({ error: 'User ID is required' });
        }
        
        console.log(`Admin ${req.user.email} deleting selection for user: ${userId}`);
        
        const deleted = await db.deleteUserSelection(userId);
        
        if (deleted) {
            res.json({ 
                message: 'User selection deleted successfully',
                userId: userId
            });
        } else {
            res.status(404).json({ error: 'Selection not found' });
        }
    } catch (error) {
        console.error('Error deleting selection:', error);
        res.status(500).json({ error: 'Failed to delete selection' });
    }
});

// Submit order endpoint
app.post('/api/orders', isAuthenticated, async (req, res) => {
    try {
        const { userId, items, totalAmount, userName, email } = req.body;
        
        const orderId = `order_${Date.now()}_${userId}`;
        
        await db.createOrder({
            orderId,
            userId,
            userName: userName || `User ${userId}`,
            email,
            items,
            totalAmount: totalAmount || 0,
            status: 'pending'
        });
        
        const order = await db.getOrder(orderId);
        
        res.json({
            message: 'Order submitted successfully',
            order
        });
    } catch (error) {
        console.error('Error submitting order:', error);
        res.status(500).json({ error: 'Failed to submit order' });
    }
});

// Get all orders (admin only - protected)
app.get('/api/orders', isAuthenticated, async (req, res) => {
    try {
        const orders = await db.getAllOrders();
        
        res.json({
            totalOrders: orders.length,
            orders
        });
    } catch (error) {
        console.error('Error retrieving orders:', error);
        res.status(500).json({ error: 'Failed to retrieve orders' });
    }
});

// Notification endpoints
app.post('/api/notifications/subscribe', isAuthenticated, async (req, res) => {
    try {
        const { subscription } = req.body;
        const userId = req.user.id;
        
        if (!subscription) {
            return res.status(400).json({ error: 'Subscription data required' });
        }

        await db.updateNotificationPreferences(userId, true, JSON.stringify(subscription));
        
        res.json({ 
            message: 'Notification subscription saved successfully',
            subscribed: true
        });
    } catch (error) {
        console.error('Error saving notification subscription:', error);
        res.status(500).json({ error: 'Failed to save notification subscription' });
    }
});

app.post('/api/notifications/unsubscribe', isAuthenticated, async (req, res) => {
    try {
        const userId = req.user.id;
        
        await db.updateNotificationPreferences(userId, false, null);
        
        res.json({ 
            message: 'Notification subscription removed successfully',
            subscribed: false
        });
    } catch (error) {
        console.error('Error removing notification subscription:', error);
        res.status(500).json({ error: 'Failed to remove notification subscription' });
    }
});

app.get('/api/notifications/status', isAuthenticated, async (req, res) => {
    try {
        const userId = req.user.id;
        const preferences = await db.getUserNotificationPreferences(userId);
        
        res.json({
            enabled: preferences ? Boolean(preferences.notifications_enabled) : false,
            hasSubscription: preferences ? Boolean(preferences.push_subscription) : false
        });
    } catch (error) {
        console.error('Error getting notification status:', error);
        res.status(500).json({ error: 'Failed to get notification status' });
    }
});

app.get('/api/notifications/vapid-key', (req, res) => {
    res.json({ publicKey: vapidKeys.publicKey });
});

// EmailJS configuration endpoint (protected)
app.get('/api/emailjs-config', isAuthenticated, (req, res) => {
    const emailConfig = {
        publicKey: process.env.EMAILJS_PUBLIC_KEY,
        serviceId: process.env.EMAILJS_SERVICE_ID,
        templateId: process.env.EMAILJS_TEMPLATE_ID,
        emailTo: process.env.EMAILJS_EMAIL_TO,
        emailFrom: process.env.EMAILJS_EMAIL_FROM || process.env.EMAILJS_EMAIL_TO,
        nameOfExpert: process.env.EMAILJS_NAME_OF_EXPERT
    };

    // Only send config if all required fields are present
    if (!emailConfig.publicKey || !emailConfig.serviceId || !emailConfig.templateId) {
        return res.status(500).json({ 
            error: 'EmailJS not configured. Please set EMAILJS_PUBLIC_KEY, EMAILJS_SERVICE_ID, and EMAILJS_TEMPLATE_ID in .env' 
        });
    }

    res.json(emailConfig);
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
    try {
        const stats = await db.getStats();
        
        res.json({ 
            status: 'ok', 
            timestamp: new Date().toISOString(),
            ...stats
        });
    } catch (error) {
        console.error('Error getting health stats:', error);
        res.json({ 
            status: 'ok', 
            timestamp: new Date().toISOString(),
            totalSelections: 0,
            totalOrders: 0,
            totalUsers: 0
        });
    }
});

// Notification scheduling functions
async function sendNotificationToUser(subscription, payload) {
    try {
        await webpush.sendNotification(JSON.parse(subscription), JSON.stringify(payload));
        console.log('Notification sent successfully');
    } catch (error) {
        console.error('Error sending notification:', error);
        if (error.statusCode === 410) {
            // Subscription expired, remove it
            console.log('Subscription expired, should remove from database');
        }
    }
}

async function sendFridayReminders() {
    try {
        console.log('Checking for users without selections to send reminders...');
        
        const usersWithoutSelections = await db.getUsersWithoutSelections();
        
        console.log(`Found ${usersWithoutSelections.length} users without selections`);
        
        const notificationPayload = {
            title: 'Lekker Bezig - Snack Reminder! 🍟',
            body: 'Don\'t forget to select your snack for today! Selection closes at 12:00 PM.',
            icon: '/icons/icon-192x192.png',
            badge: '/icons/icon-192x192.png',
            tag: 'snack-reminder',
            requireInteraction: true,
            actions: [
                {
                    action: 'select-snack',
                    title: 'Select Snack',
                    icon: '/icons/icon-192x192.png'
                },
                {
                    action: 'dismiss',
                    title: 'Dismiss'
                }
            ],
            data: {
                url: '/',
                timestamp: Date.now()
            }
        };

        for (const user of usersWithoutSelections) {
            if (user.push_subscription) {
                await sendNotificationToUser(user.push_subscription, notificationPayload);
                console.log(`Reminder sent to ${user.name} (${user.email})`);
            }
        }
        
        console.log('Friday reminders completed');
    } catch (error) {
        console.error('Error sending Friday reminders:', error);
    }
}

// Schedule Friday reminders at 11:00 AM
// Cron format: second minute hour day month day-of-week
// This runs at 11:00 AM every Friday (day 5 of the week)
cron.schedule('0 0 11 * * 5', () => {
    console.log('Running Friday 11 AM reminder job...');
    sendFridayReminders();
}, {
    timezone: 'Europe/Amsterdam'
});

// Manual trigger endpoint for testing (admin only)
app.post('/api/notifications/test-friday-reminder', isAuthenticated, async (req, res) => {
    try {
        console.log('Manual trigger of Friday reminders by:', req.user.email);
        await sendFridayReminders();
        res.json({ message: 'Friday reminders sent successfully' });
    } catch (error) {
        console.error('Error in manual Friday reminder:', error);
        res.status(500).json({ error: 'Failed to send Friday reminders' });
    }
});

// Serve the PWA
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Initialize database and start server
async function startServer() {
    try {
        console.log(`Starting server in ${process.env.NODE_ENV || 'development'} mode...`);
        
        // Validate required environment variables
        const requiredEnvVars = [
            'GOOGLE_CLIENT_ID',
            'GOOGLE_CLIENT_SECRET',
            'SESSION_SECRET',
            'JWT_SECRET',
            'FIREBASE_PROJECT_ID',
            'FIREBASE_PRIVATE_KEY',
            'FIREBASE_CLIENT_EMAIL'
        ];

        const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
        
        if (missingEnvVars.length > 0) {
            console.error('❌ Missing required environment variables:');
            missingEnvVars.forEach(varName => console.error(`   - ${varName}`));
            console.error('   Please check your .env file configuration.');
            process.exit(1);
        }

        await db.initialize();
        console.log('✅ Database initialized successfully');
        
        // Start server
        server = app.listen(PORT, () => {
            const isProduction = process.env.NODE_ENV === 'production';
            const host = isProduction ? process.env.PRODUCTION_DOMAIN || 'lekkerbezig-3fffa.web.app' : 'localhost';
            const protocol = isProduction ? 'https' : 'http';
            
            console.log('🚀 Server started successfully!');
            console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
            console.log(`   Port: ${PORT}`);
            
            if (isProduction) {
                console.log(`   🌐 Production URL: ${protocol}://${host}`);
                console.log(`   📡 API: ${protocol}://${host}/api/`);
                console.log(`   ⚙️  Admin: ${protocol}://${host}/admin`);
            } else {
                console.log(`   🏠 Local URL: http://localhost:${PORT}`);
                console.log(`   📡 API: http://localhost:${PORT}/api/`);
                console.log(`   ⚙️  Admin: http://localhost:${PORT}/admin`);
            }
            
            console.log('');
            console.log('📋 Configuration Status:');
            console.log(`   ✅ Google OAuth: ${process.env.GOOGLE_CLIENT_ID ? 'Configured' : '❌ Missing'}`);
            console.log(`   ✅ Firebase: ${process.env.FIREBASE_PROJECT_ID ? 'Configured' : '❌ Missing'}`);
            console.log(`   ✅ VAPID Keys: ${vapidKeys.publicKey ? 'Configured' : '❌ Missing'}`);
            console.log(`   ${process.env.EMAILJS_PUBLIC_KEY ? '✅' : '⚠️ '} EmailJS: ${process.env.EMAILJS_PUBLIC_KEY ? 'Configured' : 'Not configured (optional)'}`);
        });

        // Handle server errors
        server.on('error', (error) => {
            if (error.code === 'EADDRINUSE') {
                console.error(`❌ Port ${PORT} is already in use`);
                console.log('   Try killing existing processes or use a different port');
            } else {
                console.error('❌ Server error:', error.message);
            }
            process.exit(1);
        });

    } catch (error) {
        console.error('❌ Failed to start server:', error.message);
        if (error.message.includes('Firebase') || error.message.includes('Firestore')) {
            console.error('   Please check your Firebase configuration in .env file');
        }
        process.exit(1);
    }
}

// Handle graceful shutdown
let server;

process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down server...');
    try {
        // Close server first
        if (server) {
            await new Promise((resolve) => {
                server.close(resolve);
            });
            console.log('✅ Server closed');
        }
        
        // Close database connection
        await db.close();
        console.log('✅ Database connection closed');
        
        console.log('👋 Server shutdown complete');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error during shutdown:', error);
        process.exit(1);
    }
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
    process.emit('SIGINT');
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// Start the server
startServer().catch((error) => {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
});