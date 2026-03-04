const admin = require('firebase-admin');
const fetch = require('node-fetch');
const fs = require('fs');

// Configuration
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID;
const SERVICE_ACCOUNT_PATH = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || "./service-account.json";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
    console.error("Error: GEMINI_API_KEY environment variable is required.");
    process.exit(1);
}
if (!PROJECT_ID) {
    console.error("Error: FIREBASE_PROJECT_ID environment variable is required.");
    process.exit(1);
}

async function updateDailyMessage() {
    console.log("Step 1: Fetching fantasy name (seed)...");
    let seed = "Orkney"; // Fallback
    try {
        const response = await fetch("https://fantasyname.lukewh.com/?ancestry=o");
        const text = await response.text();
        if (text && text.trim()) {
            seed = text.trim();
        } else {
            console.warn("Warning: Fantasy name generator returned empty response. Using fallback.");
        }
    } catch (error) {
        console.log("Warning: Fetching fantasy name failed, using fallback.", error.message);
    }
    console.log(`Seed: ${seed}`);

    const crypto = require('crypto');
    const name = seed;
    const hashedSeed = crypto.createHash('md5').update(name).digest('hex');
    console.log(`Original Name: ${name}, Hashed Seed: ${hashedSeed}`);

    console.log("Step 2: Generating image URL...");
    const image = `https://api.dicebear.com/9.x/bottts/svg?seed=${seed}`;
    console.log(`Image URL: ${image}`);

    console.log("Step 3: Generating motivational message via Gemini...");
    let text = "Stay focused and keep moving forward!"; // Fallback
    try {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${GEMINI_API_KEY}`;
        const geminiResponse = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: `You are a generator of messages to motivate or support people. Each reponse is always a different message. seed=${hashedSeed}.`
                    }]
                }]
            })
        });

        const result = await geminiResponse.json();

        if (!geminiResponse.ok) {
            console.warn(`Warning: Gemini API returned error ${geminiResponse.status}.`, JSON.stringify(result));
        } else if (result.candidates && result.candidates[0].content && result.candidates[0].content.parts[0].text) {
            text = result.candidates[0].content.parts[0].text.trim();
        } else {
            console.warn("Warning: Gemini response missing expected fields.", JSON.stringify(result));
        }
    } catch (error) {
        console.warn("Warning: Gemini API call failed, using fallback.", error.message);
    }
    console.log(`Text: ${text}`);

    console.log("Step 4: Updating Firestore...");
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
        await db.collection('data').doc('dailyMessage').set({
            seed: seed,
            image: image,
            text: text,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        console.log("Firestore updated successfully.");
    } catch (error) {
        console.error("Error updating Firestore:", error.message);
        process.exit(1);
    }

    console.log("Process complete!");
}

updateDailyMessage();
