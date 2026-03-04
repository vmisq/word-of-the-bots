// Initialize Firebase using config from config.js
if (typeof firebaseConfig === 'undefined') {
    console.error("Firebase config not found. Please create config.js from config.js.example");
} else {
    firebase.initializeApp(firebaseConfig);
}
const messaging = firebase.messaging();
const db = firebase.firestore();

// VAPID_KEY is also defined in config.js
let getTokenPromise = null;

const btnPermission = document.getElementById('btn-permission');
const permissionStatus = document.getElementById('permission-status');
const tokenSection = document.getElementById('token-section');
const tokenDisplay = document.getElementById('token-display');
const messageList = document.getElementById('message-list');

// Simplified Notification Settings
const settingsSection = document.getElementById('notification-settings');
const enabledCheckbox = document.getElementById('notifications-enabled');
const timeChipsContainer = document.getElementById('time-chips');
const timeChips = document.querySelectorAll('.chip');
const settingsStatus = document.getElementById('settings-status');

// Daily Message Elements
const dailyMessageSection = document.getElementById('daily-message-container');
const dailyImage = document.getElementById('daily-image');
const dailySeed = document.getElementById('daily-seed');
const dailyText = document.getElementById('daily-text');
const dailyLoading = document.getElementById('daily-loading');

// Update UI if permission already granted
if (Notification.permission === 'granted') {
    getToken();
}

// Load daily message on start
loadDailyMessage();

btnPermission.addEventListener('click', () => {
    Notification.requestPermission().then((permission) => {
        permissionStatus.textContent = permission;
        if (permission === 'granted') {
            getToken();
        } else {
            console.warn('Permission not granted');
        }
    });
});

async function getToken() {
    if (getTokenPromise) return getTokenPromise;

    getTokenPromise = (async () => {
        try {
            // Automatically handle stale tokens if VAPID key changed
            const savedVapid = localStorage.getItem('last_vapid_key');
            if (savedVapid && savedVapid !== VAPID_KEY) {
                console.log("VAPID key mismatch detected. Refreshing registration...");
                await messaging.deleteToken();
                localStorage.setItem('last_vapid_key', VAPID_KEY);
            }

            let serviceWorkerRegistration;
            if ('serviceWorker' in navigator) {
                try {
                    // Determine the correct path for the service worker
                    // Ensure we include the current subpath (especially for GitHub Pages)
                    const scriptsPath = window.location.pathname.endsWith('/')
                        ? window.location.pathname
                        : window.location.pathname + '/';
                    const swUrl = scriptsPath + 'firebase-messaging-sw.js';

                    console.log("Registering service worker at:", swUrl);
                    serviceWorkerRegistration = await navigator.serviceWorker.register(swUrl);
                    console.log("Service Worker registered successfully with scope:", serviceWorkerRegistration.scope);
                } catch (swErr) {
                    console.error("Manual Service Worker registration failed (falling back to default):", swErr);
                }
            }

            const currentToken = await messaging.getToken({
                vapidKey: VAPID_KEY,
                serviceWorkerRegistration: serviceWorkerRegistration
            });

            if (currentToken) {
                localStorage.setItem('last_vapid_key', VAPID_KEY);
                tokenDisplay.textContent = currentToken;
                permissionStatus.textContent = 'Granted';
                btnPermission.parentElement.style.display = 'none'; // Hide whole permission container

                // If we have a stale token issue, user can run resetToken() in console
                window.resetToken = async () => {
                    await messaging.deleteToken();
                    console.log("Token deleted. Refreshing...");
                    location.reload();
                };

                // Optional: Load existing settings
                loadSettings(currentToken);
            } else {
                console.log('No registration token available. Request permission to generate one.');
            }
        } catch (err) {
            console.error('An error occurred while retrieving token. ', err);
        } finally {
            getTokenPromise = null;
        }
    })();

    return getTokenPromise;
}

async function loadDailyMessage() {
    try {
        const doc = await db.collection('data').doc('dailyMessage').get();
        if (doc.exists) {
            const data = doc.data();
            if (data.image) {
                const avatarParent = document.getElementById('avatar-parent');
                if (data.image.trim().startsWith('<svg')) {
                    // Handle raw SVG markup
                    dailyImage.style.display = 'none';
                    avatarParent.innerHTML = data.image;
                } else {
                    // Handle URL
                    dailyImage.src = data.image;
                    dailyImage.style.display = 'block';
                    // Clear any previous SVG
                    if (avatarParent.firstElementChild !== dailyImage) {
                        avatarParent.innerHTML = '';
                        avatarParent.appendChild(dailyImage);
                    }
                }
            } else {
                dailyImage.style.display = 'none';
            }
            dailySeed.textContent = data.seed || 'Someone';
            dailyText.textContent = data.text || 'No message for today.';

            dailyLoading.style.display = 'none';
            dailyMessageSection.style.display = 'block';

        } else {
            console.log("No daily message found in Firestore.");
            dailyLoading.textContent = "No daily message available.";
        }
    } catch (error) {
        console.error("Error loading daily message:", error);
        dailyLoading.textContent = "Error loading daily message.";
        dailyLoading.style.color = "red";
    }
}

async function loadSettings(token) {
    try {
        const doc = await db.collection('subscriptions').doc(token).get();
        if (doc.exists) {
            const data = doc.data();
            const isEnabled = data.enabled !== false;

            // Load multi-time selection
            const selectedTimes = data.preferredTimes || (data.preferredTime ? [data.preferredTime] : []);

            timeChips.forEach(chip => {
                const val = chip.dataset.value;
                if (!isEnabled && val === 'never') {
                    chip.classList.add('selected');
                } else if (isEnabled && selectedTimes.includes(val)) {
                    chip.classList.add('selected');
                } else {
                    chip.classList.remove('selected');
                }
            });

            // If enabled but no times, or not enabled but no never chip (shouldnt happen), fix UI
            const hasSelectedTime = [...timeChips].some(c => c.classList.contains('selected') && c.dataset.value !== 'never');
            if (isEnabled && !hasSelectedTime) {
                // Default to morning if somehow enabled with no times
                const morning = [...timeChips].find(c => c.dataset.value === 'morning');
                if (morning) morning.classList.add('selected');
            } else if (!isEnabled) {
                const never = [...timeChips].find(c => c.dataset.value === 'never');
                if (never) never.classList.add('selected');
            }

            settingsStatus.textContent = "Settings loaded";
            settingsStatus.style.color = "var(--text-muted)";
            setTimeout(() => { if (settingsStatus.textContent === "Settings loaded") settingsStatus.textContent = ""; }, 2000);
        } else {
            // Document doesn't exist, create it with defaults
            console.log("New device detected. Creating default record in Firestore...");

            // Default selection: Morning
            timeChips.forEach(chip => {
                if (chip.dataset.value === 'morning') chip.classList.add('selected');
                else chip.classList.remove('selected');
            });

            await savePreferences();
            settingsStatus.textContent = "New device registered";
            settingsStatus.style.color = "var(--primary-color)";
            setTimeout(() => { if (settingsStatus.textContent === "New device registered") settingsStatus.textContent = ""; }, 3000);
        }
    } catch (error) {
        console.warn("Error in registration flow:", error);
    }
}

async function savePreferences() {
    const token = tokenDisplay.textContent;

    // Collect selected times from chips
    const preferredTimes = [];
    let isNever = false;
    timeChips.forEach(chip => {
        if (chip.classList.contains('selected')) {
            if (chip.dataset.value === 'never') isNever = true;
            else preferredTimes.push(chip.dataset.value);
        }
    });

    const enabled = !isNever && preferredTimes.length > 0;

    if (!token) {
        settingsStatus.textContent = "Error: No token found.";
        settingsStatus.style.color = "red";
        return;
    }

    settingsStatus.textContent = "Saving...";
    settingsStatus.style.color = "gray";

    try {
        await db.collection('subscriptions').doc(token).set({
            enabled: enabled,
            preferredTimes: preferredTimes,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        settingsStatus.textContent = "Saved";
        settingsStatus.style.color = "green";

        // Clear the "Saved" message after 3 seconds
        setTimeout(() => {
            if (settingsStatus.textContent === "Saved") {
                settingsStatus.textContent = "";
            }
        }, 3000);
    } catch (error) {
        console.error("Error saving to Firestore: ", error);
        settingsStatus.textContent = "Error: " + error.message;
        settingsStatus.style.color = "red";
    }
}

// Auto-save listeners (checkbox removed from UI but kept for logic if needed)
if (enabledCheckbox) enabledCheckbox.addEventListener('change', savePreferences);

// Chip listeners with exclusivity logic
timeChips.forEach(chip => {
    chip.addEventListener('click', () => {
        const val = chip.dataset.value;
        if (val === 'never') {
            // Select never, unselect others
            timeChips.forEach(c => c.classList.remove('selected'));
            chip.classList.add('selected');
        } else {
            // Toggle this one
            chip.classList.toggle('selected');
            // Unselect never
            const never = [...timeChips].find(c => c.dataset.value === 'never');
            if (never) never.classList.remove('selected');

            // If nothing is selected now, select never?
            const anySelected = [...timeChips].some(c => c.classList.contains('selected'));
            if (!anySelected && never) {
                never.classList.add('selected');
            }
        }
        savePreferences();
    });
});

// Handle foreground messages
messaging.onMessage((payload) => {
    // For now, we simple log it as messages list was removed for cleaner UI
    console.log('Message received in foreground: ', payload);

    // Also show a browser notification if you want, but default browser behavior 
    // is to NOT show notifications when tab is in foreground automatically.
    new Notification(payload.notification.title, {
        body: payload.notification.body,
        icon: payload.notification.icon
    });
});
