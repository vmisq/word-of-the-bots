importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

const firebaseConfig = {
    apiKey: "AIzaSyBLJ_TUrGWMjMAvd6Nq8KaBJxdwBrkbv70",
    authDomain: "daily-notifier-2995f.firebaseapp.com",
    projectId: "daily-notifier-2995f",
    storageBucket: "daily-notifier-2995f.firebasestorage.app",
    messagingSenderId: "24343487814",
    appId: "1:24343487814:web:55faba84474ab05433f147"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Received background message ', payload);

    const notificationTitle = payload.notification.title;
    const notificationOptions = {
        body: payload.notification.body,
        icon: payload.notification.icon
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
});
