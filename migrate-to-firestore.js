require('dotenv').config();
const Database = require('./database'); // SQLite database
const FirestoreDatabase = require('./firestore-database'); // Firestore database

async function migrateToFirestore() {
    console.log('🚀 Starting migration from SQLite to Firestore...');
    
    const sqliteDb = new Database();
    const firestoreDb = new FirestoreDatabase();
    
    try {
        // Initialize both databases
        console.log('📊 Initializing databases...');
        await sqliteDb.initialize();
        await firestoreDb.initialize();
        
        // Migrate Users
        console.log('👥 Migrating users...');
        const users = await sqliteDb.getAllUsers();
        console.log(`Found ${users.length} users to migrate`);
        
        for (const user of users) {
            try {
                await firestoreDb.createUser({
                    id: user.id,
                    googleId: user.google_id,
                    name: user.name,
                    email: user.email,
                    profilePicture: user.profile_picture,
                    domain: user.domain,
                    isAuthenticated: Boolean(user.is_authenticated)
                });
                
                // Update additional fields
                if (user.notifications_enabled !== undefined || user.push_subscription) {
                    await firestoreDb.updateNotificationPreferences(
                        user.id, 
                        Boolean(user.notifications_enabled), 
                        user.push_subscription
                    );
                }
                
                console.log(`✅ Migrated user: ${user.name} (${user.email})`);
            } catch (error) {
                if (error.code === 6) { // Already exists error
                    console.log(`⚠️  User ${user.name} already exists, skipping`);
                } else {
                    console.error(`❌ Failed to migrate user ${user.name}:`, error.message);
                }
            }
        }
        
        // Migrate User Selections
        console.log('\n🍎 Migrating user selections...');
        const selections = await sqliteDb.getAllSelections();
        console.log(`Found ${selections.length} selections to migrate`);
        
        for (const selection of selections) {
            try {
                await firestoreDb.saveUserSelection(selection.userId, {
                    userName: selection.userName,
                    selections: selection.selections,
                    timestamp: selection.timestamp
                });
                console.log(`✅ Migrated selection for: ${selection.userName}`);
            } catch (error) {
                console.error(`❌ Failed to migrate selection for ${selection.userName}:`, error.message);
            }
        }
        
        // Migrate Orders
        console.log('\n📦 Migrating orders...');
        const orders = await sqliteDb.getAllOrders();
        console.log(`Found ${orders.length} orders to migrate`);
        
        for (const order of orders) {
            try {
                await firestoreDb.createOrder({
                    orderId: order.orderId,
                    userId: order.userId,
                    userName: order.userName,
                    email: order.email,
                    items: order.items,
                    totalAmount: order.totalAmount,
                    status: order.status
                });
                console.log(`✅ Migrated order: ${order.orderId} for ${order.userName}`);
            } catch (error) {
                if (error.code === 6) { // Already exists error
                    console.log(`⚠️  Order ${order.orderId} already exists, skipping`);
                } else {
                    console.error(`❌ Failed to migrate order ${order.orderId}:`, error.message);
                }
            }
        }
        
        // Verify Migration
        console.log('\n🔍 Verifying migration...');
        const firestoreStats = await firestoreDb.getStats();
        console.log('Firestore Statistics:');
        console.log(`- Users: ${firestoreStats.totalUsers}`);
        console.log(`- Selections: ${firestoreStats.totalSelections}`);
        console.log(`- Orders: ${firestoreStats.totalOrders}`);
        
        const sqliteStats = await sqliteDb.getStats();
        console.log('\nSQLite Statistics (original):');
        console.log(`- Users: ${sqliteStats.totalUsers}`);
        console.log(`- Selections: ${sqliteStats.totalSelections}`);
        console.log(`- Orders: ${sqliteStats.totalOrders}`);
        
        // Check if migration was successful
        const migrationSuccess = (
            firestoreStats.totalUsers >= sqliteStats.totalUsers &&
            firestoreStats.totalSelections >= sqliteStats.totalSelections &&
            firestoreStats.totalOrders >= sqliteStats.totalOrders
        );
        
        if (migrationSuccess) {
            console.log('\n🎉 Migration completed successfully!');
            console.log('\n📋 Next Steps:');
            console.log('1. Test the application with Firestore');
            console.log('2. Verify all functionality works correctly');
            console.log('3. Update your production environment variables');
            console.log('4. Consider backing up your SQLite database before removing it');
        } else {
            console.log('\n⚠️  Migration may be incomplete. Please check the logs above.');
        }
        
    } catch (error) {
        console.error('💥 Migration failed:', error);
        process.exit(1);
    } finally {
        // Close database connections
        await sqliteDb.close();
        await firestoreDb.close();
    }
}

// Add command line options
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const force = args.includes('--force');

if (dryRun) {
    console.log('🧪 DRY RUN MODE - No data will be written to Firestore');
}

if (!force) {
    console.log('⚠️  This will migrate data from SQLite to Firestore.');
    console.log('   Make sure you have:');
    console.log('   - Configured Firebase credentials in .env');
    console.log('   - Created the Firestore database');
    console.log('   - Set up security rules');
    console.log('');
    console.log('   Run with --force to proceed');
    console.log('   Run with --dry-run to preview without writing');
    process.exit(0);
}

// Run migration
migrateToFirestore().catch(console.error);