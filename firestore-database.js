const admin = require('firebase-admin');

class FirestoreDatabase {
    constructor() {
        this.db = null;
        this.initialized = false;
    }

    async initialize() {
        try {
            if (this.initialized) {
                return;
            }

        // export interface ServiceAccount
        //     {
        //         projectId ? : string
        //         clientEmail ? : string
        //         privateKey ? : string
        //     }
                // Initialize Firebase Admin SDK
            const serviceAccount = {
                type: "service_account",
                project_id: process.env.FIREBASE_PROJECT_ID,
                private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
                private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
                client_email: process.env.FIREBASE_CLIENT_EMAIL,
                client_id: process.env.FIREBASE_CLIENT_ID,
                auth_uri: "https://accounts.google.com/o/oauth2/auth",
                token_uri: "https://oauth2.googleapis.com/token",
                auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
                client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${process.env.FIREBASE_CLIENT_EMAIL}`
            };

            console.log('admin.apps.length', admin.apps.length)

            if (!admin.apps.length) {
                admin.initializeApp({
                    credential: admin.credential.cert(serviceAccount)
                });
            }

            // databaseAuthVariableOverride?: object | null
            // databaseURL?: string
            // serviceAccountId?: string
            // storageBucket?: string
            // projectId?: string
            // httpAgent?: Agent

            this.db = admin.firestore();
            this.db.settings({ ignoreUndefinedProperties: true });
            this.initialized = true;
            console.log('Connected to Firestore database');
            
            // Run initial setup (create indexes, etc.)
            await this.createCollections();
            
        } catch (error) {
            console.log('admin.apps.length', admin.apps.length)
            console.error('Error initializing Firestore:', error.message);
            throw error;
        }
    }

    async createCollections() {
        console.log('Firestore collections initialized/verified');
        // Firestore creates collections automatically, so no table creation needed
        // We can set up any initial data or indexes here if needed
    }

    // Helper method to get collection reference
    getCollection(name) {
        if (!this.db) {
            throw new Error('Database not initialized');
        }
        return this.db.collection(name);
    }

    // Helper method to convert Firestore timestamp to ISO string
    timestampToString(timestamp) {
        if (!timestamp) return null;
        if (timestamp.toDate) {
            return timestamp.toDate().toISOString();
        }
        return timestamp;
    }

    // Helper method to convert document data
    convertDocumentData(doc) {
        if (!doc.exists) return null;
        
        const data = doc.data();
        const result = { id: doc.id, ...data };
        
        // Convert Firestore timestamps to ISO strings
        if (result.created_at && result.created_at.toDate) {
            result.created_at = result.created_at.toDate().toISOString();
        }
        if (result.updated_at && result.updated_at.toDate) {
            result.updated_at = result.updated_at.toDate().toISOString();
        }
        if (result.last_login && result.last_login.toDate) {
            result.last_login = result.last_login.toDate().toISOString();
        }
        if (result.timestamp && result.timestamp.toDate) {
            result.timestamp = result.timestamp.toDate().toISOString();
        }
        
        return result;
    }

    // User operations
    async createUser(userData) {
        const { id, googleId, name, email, profilePicture, domain, isAuthenticated } = userData;
        
        const userDoc = {
            google_id: googleId,
            name,
            email,
            profile_picture: profilePicture || null,
            domain,
            is_authenticated: Boolean(isAuthenticated),
            notifications_enabled: false,
            push_subscription: null,
            last_login: admin.firestore.FieldValue.serverTimestamp(),
            created_at: admin.firestore.FieldValue.serverTimestamp(),
            updated_at: admin.firestore.FieldValue.serverTimestamp()
        };

        await this.getCollection('users').doc(id).set(userDoc);
        return { id };
    }

    async updateUser(userId, userData) {
        const { name, email, profilePicture, lastLogin } = userData;
        
        const updateDoc = {
            name,
            email,
            profile_picture: profilePicture || null,
            updated_at: admin.firestore.FieldValue.serverTimestamp()
        };

        if (lastLogin) {
            updateDoc.last_login = new Date(lastLogin);
        }

        await this.getCollection('users').doc(userId).update(updateDoc);
        return { changes: 1 };
    }

    async updateNotificationPreferences(userId, notificationsEnabled, pushSubscription = null) {
        const updateDoc = {
            notifications_enabled: Boolean(notificationsEnabled),
            push_subscription: pushSubscription,
            updated_at: admin.firestore.FieldValue.serverTimestamp()
        };

        await this.getCollection('users').doc(userId).update(updateDoc);
        return { changes: 1 };
    }

    async getUserNotificationPreferences(userId) {
        const doc = await this.getCollection('users').doc(userId).get();
        if (!doc.exists) return null;
        
        const data = doc.data();
        return {
            notifications_enabled: data.notifications_enabled || false,
            push_subscription: data.push_subscription || null
        };
    }

    async getUsersWithNotificationsEnabled() {
        const snapshot = await this.getCollection('users')
            .where('notifications_enabled', '==', true)
            .where('push_subscription', '!=', null)
            .get();

        return snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                name: data.name,
                email: data.email,
                push_subscription: data.push_subscription
            };
        });
    }

    async getUsersWithoutSelections() {
        const today = new Date().toISOString().split('T')[0];
        const startOfDay = new Date(today + 'T00:00:00.000Z');
        const endOfDay = new Date(today + 'T23:59:59.999Z');

        // First get users with notifications enabled
        const usersSnapshot = await this.getCollection('users')
            .where('notifications_enabled', '==', true)
            .where('push_subscription', '!=', null)
            .get();

        const usersWithNotifications = usersSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        // Then get selections for today
        const selectionsSnapshot = await this.getCollection('selections')
            .where('timestamp', '>=', startOfDay)
            .where('timestamp', '<=', endOfDay)
            .get();

        const userIdsWithSelections = new Set(selectionsSnapshot.docs.map(doc => doc.data().user_id));

        // Filter users who don't have selections today
        return usersWithNotifications
            .filter(user => !userIdsWithSelections.has(user.id))
            .map(user => ({
                id: user.id,
                name: user.name,
                email: user.email,
                push_subscription: user.push_subscription
            }));
    }

    async createOrUpdateUser(userId, userData) {
        const { userName, email } = userData;
        
        const userDoc = {
            name: userName,
            email,
            updated_at: admin.firestore.FieldValue.serverTimestamp()
        };

        // Use merge to update if exists, create if doesn't exist
        await this.getCollection('users').doc(userId).set(userDoc, { merge: true });
        return { changes: 1 };
    }

    async getUserByGoogleId(googleId) {
        const snapshot = await this.getCollection('users')
            .where('google_id', '==', googleId)
            .limit(1)
            .get();

        if (snapshot.empty) return null;
        
        return this.convertDocumentData(snapshot.docs[0]);
    }

    async getUserByEmail(email) {
        const snapshot = await this.getCollection('users')
            .where('email', '==', email)
            .limit(1)
            .get();

        if (snapshot.empty) return null;
        
        return this.convertDocumentData(snapshot.docs[0]);
    }

    async getUser(userId) {
        const doc = await this.getCollection('users').doc(userId).get();
        return this.convertDocumentData(doc);
    }

    async getAllUsers() {
        const snapshot = await this.getCollection('users')
            .orderBy('created_at', 'desc')
            .get();

        return snapshot.docs.map(doc => this.convertDocumentData(doc));
    }

    // Selection operations
    async saveUserSelection(userId, userData) {
        const { userName, selections, timestamp } = userData;
        
        // Create/update user first
        await this.createOrUpdateUser(userId, { userName });

        // Use user ID as document ID to ensure one selection per user
        const selectionDoc = {
            user_id: userId,
            selections,
            timestamp: timestamp ? new Date(timestamp) : admin.firestore.FieldValue.serverTimestamp(),
            updated_at: admin.firestore.FieldValue.serverTimestamp()
        };

        await this.getCollection('selections').doc(userId).set(selectionDoc);
        return { id: userId };
    }

    async getUserSelection(userId) {
        const selectionDoc = await this.getCollection('selections').doc(userId).get();
        
        if (!selectionDoc.exists) return null;

        const selectionData = selectionDoc.data();
        
        // Get user name
        const userDoc = await this.getCollection('users').doc(userId).get();
        const userData = userDoc.exists ? userDoc.data() : {};

        return {
            userId: selectionData.user_id,
            userName: userData.name || `User ${userId}`,
            selections: selectionData.selections,
            timestamp: this.timestampToString(selectionData.timestamp),
            updatedAt: this.timestampToString(selectionData.updated_at)
        };
    }

    async getAllSelections() {
        const selectionsSnapshot = await this.getCollection('selections')
            .orderBy('updated_at', 'desc')
            .get();

        const results = [];
        
        for (const selectionDoc of selectionsSnapshot.docs) {
            const selectionData = selectionDoc.data();
            
            // Get user data
            const userDoc = await this.getCollection('users').doc(selectionData.user_id).get();
            const userData = userDoc.exists ? userDoc.data() : {};

            // Check if user has submitted an order
            const orderSnapshot = await this.getCollection('orders')
                .where('user_id', '==', selectionData.user_id)
                .limit(1)
                .get();

            const hasOrder = !orderSnapshot.empty;
            const orderId = hasOrder ? orderSnapshot.docs[0].id : null;

            results.push({
                userId: selectionData.user_id,
                userName: userData.name || `User ${selectionData.user_id}`,
                selections: selectionData.selections,
                timestamp: this.timestampToString(selectionData.timestamp),
                updatedAt: this.timestampToString(selectionData.updated_at),
                orderSubmitted: hasOrder,
                orderId
            });
        }

        return results;
    }

    async deleteUserSelection(userId) {
        try {
            await this.getCollection('selections').doc(userId).delete();
            return true;
        } catch (error) {
            console.error('Error deleting user selection:', error);
            return false;
        }
    }

    // Order operations
    async createOrder(orderData) {
        const { orderId, userId, userName, email, items, totalAmount, status = 'pending' } = orderData;
        
        // Create/update user first
        await this.createOrUpdateUser(userId, { userName, email });

        const orderDoc = {
            user_id: userId,
            user_name: userName,
            email,
            items,
            total_amount: totalAmount || 0,
            status,
            created_at: admin.firestore.FieldValue.serverTimestamp(),
            updated_at: admin.firestore.FieldValue.serverTimestamp()
        };

        await this.getCollection('orders').doc(orderId).set(orderDoc);
        return { id: orderId };
    }

    async getOrder(orderId) {
        const doc = await this.getCollection('orders').doc(orderId).get();
        return this.convertDocumentData(doc);
    }

    async getUserOrders(userId) {
        const snapshot = await this.getCollection('orders')
            .where('user_id', '==', userId)
            .orderBy('created_at', 'desc')
            .get();

        return snapshot.docs.map(doc => this.convertDocumentData(doc));
    }

    async getAllOrders() {
        const snapshot = await this.getCollection('orders')
            .orderBy('created_at', 'desc')
            .get();

        return snapshot.docs.map(doc => {
            const data = this.convertDocumentData(doc);
            return {
                ...data,
                orderId: data.id,
                userId: data.user_id,
                userName: data.user_name,
                totalAmount: data.total_amount,
                createdAt: data.created_at,
                updatedAt: data.updated_at
            };
        });
    }

    async updateOrderStatus(orderId, status) {
        await this.getCollection('orders').doc(orderId).update({
            status,
            updated_at: admin.firestore.FieldValue.serverTimestamp()
        });
        return { changes: 1 };
    }

    // Statistics
    async getStats() {
        const [usersSnapshot, ordersSnapshot, selectionsSnapshot] = await Promise.all([
            this.getCollection('users').get(),
            this.getCollection('orders').get(),
            this.getCollection('selections').get()
        ]);

        return {
            totalUsers: usersSnapshot.size,
            totalOrders: ordersSnapshot.size,
            totalSelections: selectionsSnapshot.size
        };
    }

    // Close database connection (no-op for Firestore)
    async close() {
        console.log('Firestore connection closed');
        // Firestore doesn't require explicit connection closing
        return Promise.resolve();
    }
}

module.exports = FirestoreDatabase;