importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// Import config from external file (ignored by git)
importScripts('config.js');

if (typeof firebaseConfig === 'undefined') {
    console.error("Firebase config not found. Background notifications may not work.");
} else {
    firebase.initializeApp(firebaseConfig);
}
const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Received background message ', payload);
    // FCM automatically displays notifications when the payload has a 'notification' property.
    // Manual 'showNotification' here would cause duplicates.
});

// Handle notification click to open/focus the app
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    // This looks for an existing window and focuses it, or opens a new one
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if (client.url.includes('word-of-the-bots') && 'focus' in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow('./');
            }
        })
    );
});
