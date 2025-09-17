const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class Database {
    constructor() {
        this.dbPath = path.join(__dirname, 'lekker-bezig.db');
        this.db = null;
    }

    async initialize() {
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    console.error('Error opening database:', err.message);
                    reject(err);
                } else {
                    console.log('Connected to SQLite database');
                    this.createTables().then(resolve).catch(reject);
                }
            });
        });
    }

    async createTables() {
        const tables = [
            // Users table
            `CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                google_id TEXT UNIQUE,
                name TEXT NOT NULL,
                email TEXT UNIQUE,
                profile_picture TEXT,
                domain TEXT,
                is_authenticated BOOLEAN DEFAULT 0,
                last_login DATETIME,
                notifications_enabled BOOLEAN DEFAULT 0,
                push_subscription TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            
            // User selections table
            `CREATE TABLE IF NOT EXISTS user_selections (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                selections TEXT NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )`,
            
            // Orders table
            `CREATE TABLE IF NOT EXISTS orders (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                user_name TEXT NOT NULL,
                email TEXT,
                items TEXT NOT NULL,
                total_amount INTEGER DEFAULT 0,
                status TEXT DEFAULT 'pending',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )`,

            // Create indexes for better performance
            `CREATE INDEX IF NOT EXISTS idx_user_selections_user_id ON user_selections(user_id)`,
            `CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id)`,
            `CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)`
        ];

        for (const sql of tables) {
            await this.run(sql);
        }

        console.log('Database tables created/verified');
        
        // Run migrations to update existing tables
        await this.runMigrations();
    }

    async runMigrations() {
        console.log('Running database migrations...');
        
        // Check and add all missing columns individually
        const columnsToCheck = [
            { name: 'google_id', type: 'TEXT' },
            { name: 'profile_picture', type: 'TEXT' },
            { name: 'domain', type: 'TEXT' },
            { name: 'is_authenticated', type: 'BOOLEAN DEFAULT 0' },
            { name: 'last_login', type: 'DATETIME' },
            { name: 'notifications_enabled', type: 'BOOLEAN DEFAULT 0' },
            { name: 'push_subscription', type: 'TEXT' }
        ];
        
        for (const column of columnsToCheck) {
            try {
                // Try to select the column to see if it exists
                await this.get(`SELECT ${column.name} FROM users LIMIT 1`);
                console.log(`Migration: Column '${column.name}' already exists - SKIPPED`);
            } catch (error) {
                if (error.message.includes(`no such column: ${column.name}`)) {
                    // Column doesn't exist, add it
                    try {
                        const alterCommand = `ALTER TABLE users ADD COLUMN ${column.name} ${column.type}`;
                        await this.run(alterCommand);
                        console.log(`Migration: Added column '${column.name}' - SUCCESS`);
                    } catch (alterError) {
                        if (alterError.message.includes('duplicate column name')) {
                            console.log(`Migration: Column '${column.name}' already exists - SKIPPED`);
                        } else {
                            console.log(`Migration: Failed to add column '${column.name}' - ERROR:`, alterError.message);
                        }
                    }
                } else {
                    console.log(`Migration: Unexpected error checking column '${column.name}':`, error.message);
                }
            }
        }
        
        // Create unique index on google_id if it doesn't exist
        try {
            await this.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id)`);
            console.log('Migration: Created/verified unique index on google_id');
        } catch (indexError) {
            console.log('Migration: Index creation failed:', indexError.message);
        }
        
        console.log('Database migrations completed');
    }

    // Wrapper for database operations
    run(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ id: this.lastID, changes: this.changes });
                }
            });
        });
    }

    get(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, result) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(result);
                }
            });
        });
    }

    all(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    // User operations
    async createUser(userData) {
        const { id, googleId, name, email, profilePicture, domain, isAuthenticated } = userData;
        
        return await this.run(
            `INSERT INTO users (id, google_id, name, email, profile_picture, domain, is_authenticated, last_login) 
             VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            [id, googleId, name, email, profilePicture, domain, isAuthenticated ? 1 : 0]
        );
    }

    async updateUser(userId, userData) {
        const { name, email, profilePicture, lastLogin } = userData;
        
        return await this.run(
            `UPDATE users SET name = ?, email = ?, profile_picture = ?, last_login = ?, updated_at = CURRENT_TIMESTAMP 
             WHERE id = ?`,
            [name, email, profilePicture, lastLogin, userId]
        );
    }

    async updateNotificationPreferences(userId, notificationsEnabled, pushSubscription = null) {
        return await this.run(
            `UPDATE users SET notifications_enabled = ?, push_subscription = ?, updated_at = CURRENT_TIMESTAMP 
             WHERE id = ?`,
            [notificationsEnabled ? 1 : 0, pushSubscription, userId]
        );
    }

    async getUserNotificationPreferences(userId) {
        return await this.get(
            `SELECT notifications_enabled, push_subscription FROM users WHERE id = ?`,
            [userId]
        );
    }

    async getUsersWithNotificationsEnabled() {
        return await this.all(
            `SELECT id, name, email, push_subscription FROM users 
             WHERE notifications_enabled = 1 AND push_subscription IS NOT NULL`
        );
    }

    async getUsersWithoutSelections() {
        const today = new Date().toISOString().split('T')[0];
        return await this.all(
            `SELECT u.id, u.name, u.email, u.push_subscription
             FROM users u
             LEFT JOIN user_selections us ON u.id = us.user_id 
             AND DATE(us.timestamp) = ?
             WHERE u.notifications_enabled = 1 
             AND u.push_subscription IS NOT NULL 
             AND us.id IS NULL`,
            [today]
        );
    }

    async createOrUpdateUser(userId, userData) {
        const { userName, email } = userData;
        
        // First try to update existing user
        const updateResult = await this.run(
            `UPDATE users SET name = ?, email = ?, updated_at = CURRENT_TIMESTAMP 
             WHERE id = ?`,
            [userName, email, userId]
        );

        // If no rows were updated, insert new user
        if (updateResult.changes === 0) {
            await this.run(
                `INSERT INTO users (id, name, email) VALUES (?, ?, ?)`,
                [userId, userName, email]
            );
        }
    }

    async getUserByGoogleId(googleId) {
        return await this.get(`SELECT * FROM users WHERE google_id = ?`, [googleId]);
    }

    async getUserByEmail(email) {
        return await this.get(`SELECT * FROM users WHERE email = ?`, [email]);
    }

    async getUser(userId) {
        return await this.get(`SELECT * FROM users WHERE id = ?`, [userId]);
    }

    async getAllUsers() {
        return await this.all(`SELECT * FROM users ORDER BY created_at DESC`);
    }

    // Selection operations
    async saveUserSelection(userId, userData) {
        const { userName, selections, timestamp } = userData;
        
        // Create/update user first
        await this.createOrUpdateUser(userId, { userName });

        // Delete existing selection for this user
        await this.run(`DELETE FROM user_selections WHERE user_id = ?`, [userId]);

        // Insert new selection
        const result = await this.run(
            `INSERT INTO user_selections (user_id, selections, timestamp) 
             VALUES (?, ?, ?)`,
            [userId, JSON.stringify(selections), timestamp || new Date().toISOString()]
        );

        return result;
    }

    async getUserSelection(userId) {
        const result = await this.get(
            `SELECT us.*, u.name as user_name 
             FROM user_selections us 
             JOIN users u ON us.user_id = u.id 
             WHERE us.user_id = ?`,
            [userId]
        );

        if (result) {
            return {
                userId: result.user_id,
                userName: result.user_name,
                selections: JSON.parse(result.selections),
                timestamp: result.timestamp,
                updatedAt: result.updated_at
            };
        }

        return null;
    }

    async getAllSelections() {
        const results = await this.all(
            `SELECT us.*, u.name as user_name,
                    CASE WHEN o.id IS NOT NULL THEN 1 ELSE 0 END as order_submitted,
                    o.id as order_id
             FROM user_selections us 
             JOIN users u ON us.user_id = u.id 
             LEFT JOIN orders o ON us.user_id = o.user_id
             ORDER BY us.updated_at DESC`
        );

        return results.map(row => ({
            userId: row.user_id,
            userName: row.user_name,
            selections: JSON.parse(row.selections),
            timestamp: row.timestamp,
            updatedAt: row.updated_at,
            orderSubmitted: Boolean(row.order_submitted),
            orderId: row.order_id
        }));
    }

    async deleteUserSelection(userId) {
        const result = await this.run(
            `DELETE FROM user_selections WHERE user_id = ?`,
            [userId]
        );
        
        return result.changes > 0;
    }

    // Order operations
    async createOrder(orderData) {
        const { orderId, userId, userName, email, items, totalAmount, status = 'pending' } = orderData;
        
        // Create/update user first
        await this.createOrUpdateUser(userId, { userName, email });

        const result = await this.run(
            `INSERT INTO orders (id, user_id, user_name, email, items, total_amount, status) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [orderId, userId, userName, email, JSON.stringify(items), totalAmount, status]
        );

        return result;
    }

    async getOrder(orderId) {
        const result = await this.get(`SELECT * FROM orders WHERE id = ?`, [orderId]);
        
        if (result) {
            return {
                ...result,
                items: JSON.parse(result.items)
            };
        }

        return null;
    }

    async getUserOrders(userId) {
        const results = await this.all(
            `SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC`,
            [userId]
        );

        return results.map(row => ({
            ...row,
            items: JSON.parse(row.items)
        }));
    }

    async getAllOrders() {
        const results = await this.all(`SELECT * FROM orders ORDER BY created_at DESC`);
        
        return results.map(row => ({
            ...row,
            orderId: row.id,
            userId: row.user_id,
            userName: row.user_name,
            totalAmount: row.total_amount,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            items: JSON.parse(row.items)
        }));
    }

    async updateOrderStatus(orderId, status) {
        return await this.run(
            `UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [status, orderId]
        );
    }

    // Statistics
    async getStats() {
        const userCount = await this.get(`SELECT COUNT(*) as count FROM users`);
        const orderCount = await this.get(`SELECT COUNT(*) as count FROM orders`);
        const selectionCount = await this.get(`SELECT COUNT(*) as count FROM user_selections`);

        return {
            totalUsers: userCount.count,
            totalOrders: orderCount.count,
            totalSelections: selectionCount.count
        };
    }

    // Close database connection
    close() {
        return new Promise((resolve, reject) => {
            this.db.close((err) => {
                if (err) {
                    reject(err);
                } else {
                    console.log('Database connection closed');
                    resolve();
                }
            });
        });
    }
}

module.exports = Database;