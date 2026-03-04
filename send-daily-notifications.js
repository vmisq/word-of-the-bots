const admin = require('firebase-admin');
const fs = require('fs');

// Configuration
const SERVICE_ACCOUNT_PATH = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || "./service-account.json";
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID;

if (!PROJECT_ID) {
    console.error("Error: FIREBASE_PROJECT_ID environment variable is required.");
    process.exit(1);
}

// Get time of day from command line arguments
const timeOfDay = process.argv[2];

if (!timeOfDay) {
    console.error("Please provide a time of day (e.g., morning, afternoon, evening, night)");
    process.exit(1);
}

const validTimes = ['morning', 'afternoon', 'evening', 'night'];
if (!validTimes.includes(timeOfDay.toLowerCase())) {
    console.warn(`Warning: '${timeOfDay}' is not a standard time of day (${validTimes.join(', ')}). Proceeding anyway.`);
}

async function sendDailyNotifications() {
    try {
        let serviceAccount;
        if (process.env.FIREBASE_SERVICE_ACCOUNT) {
            console.log("Using service account from environment variable.");
            serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        } else if (fs.existsSync(SERVICE_ACCOUNT_PATH)) {
            console.log(`Using service account from file: ${SERVICE_ACCOUNT_PATH}`);
            serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
        } else {
            throw new Error("No service account found (check FIREBASE_SERVICE_ACCOUNT env or file).");
        }

        if (!admin.apps.length) {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
        }

        const db = admin.firestore();

        // 1. Fetch current daily message
        console.log("Fetching latest daily message...");
        const messageDoc = await db.collection('data').doc('dailyMessage').get();
        if (!messageDoc.exists) {
            throw new Error("No daily message found in Firestore.");
        }
        const dailyData = messageDoc.data();
        const notificationTitle = `${dailyData.seed || 'Someone'} says:`;
        const notificationBody = dailyData.text || 'Check out today\'s message!';
        const notificationIcon = `https://api.dicebear.com/9.x/bottts/png?seed=${dailyData.seed}`;

        // 2. Query subscribers for this time of day
        console.log(`Querying subscribers for time: ${timeOfDay}...`);
        const snapshot = await db.collection('subscriptions')
            .where('enabled', '==', true)
            .where('preferredTimes', 'array-contains', timeOfDay.toLowerCase())
            .get();

        if (snapshot.empty) {
            console.log(`No active subscriptions found for ${timeOfDay}.`);
            return;
        }

        console.log(`Found ${snapshot.size} subscriber(s). Sending notifications...`);

        const messages = [];
        snapshot.forEach(doc => {
            const token = doc.id;
            messages.push({
                token: token,
                notification: {
                    title: notificationTitle,
                    body: notificationBody,
                },
                webpush: {
                    notification: {
                        icon: notificationIcon,
                        badge: '/icons/badge.png', // Optional: link to a badge icon if available
                    }
                }
            });
        });

        // 3. Dispatch notifications in batches
        const response = await admin.messaging().sendEach(messages);
        console.log(`Successfully sent ${response.successCount} messages.`);
        if (response.failureCount > 0) {
            console.warn(`Failed to send ${response.failureCount} messages.`);

            const tokensToSoftDelete = [];
            response.responses.forEach((resp, idx) => {
                if (!resp.success) {
                    const token = messages[idx].token;
                    const errorCode = resp.error.code;
                    console.error(`Error sending to token ${token}:`, resp.error.message);

                    // Soft delete stale/invalid tokens
                    if (errorCode === 'messaging/registration-token-not-registered' ||
                        resp.error.message.includes('not found')) {
                        tokensToSoftDelete.push(
                            db.collection('subscriptions').doc(token).update({
                                enabled: false,
                                softDeletedAt: admin.firestore.FieldValue.serverTimestamp(),
                                lastError: resp.error.message
                            })
                        );
                    }
                }
            });

            if (tokensToSoftDelete.length > 0) {
                console.log(`Soft-deleting ${tokensToSoftDelete.length} invalid token(s)...`);
                await Promise.all(tokensToSoftDelete);
            }
        }

    } catch (error) {
        console.error("Error dispatching notifications:", error.message);
        process.exit(1);
    }
}

sendDailyNotifications();
