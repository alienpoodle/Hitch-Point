import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
    getAuth,
    signInWithCustomToken,
    onAuthStateChanged,
    GoogleAuthProvider,
    signInWithPopup,
    signOut
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Declare app, auth, and db as 'let' and export them.
// They will be assigned values within the initFirebase function.
export let app, auth, db;

// Variables to hold the current user's UID and email
export let currentUserId = null;
export let currentUserEmail = null;

// Firebase configuration.
// It's assumed 'window.firebaseConfig' is populated from your HTML or another secure script.
// IMPORTANT: Replace this with your actual Firebase project configuration if not using window.firebaseConfig
const firebaseConfig = window.firebaseConfig || {
    // Example (replace with your actual values):
    // apiKey: "YOUR_API_KEY",
    // authDomain: "YOUR_AUTH_DOMAIN",
    // projectId: "YOUR_PROJECT_ID",
    // storageBucket: "YOUR_STORAGE_BUCKET",
    // messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    // appId: "YOUR_APP_ID"
};

// This variable is for custom token sign-in, often used in server-side rendering or specific authentication flows.
// If you're not using custom tokens, you can remove this.
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

/**
 * Initializes Firebase services (App, Auth, Firestore).
 * This function should be called once at the start of your application.
 * It also sets up the authentication state listener.
 *
 * @param {function(firebase.User | null)} [onUserChanged] - Optional callback
 * function that is called whenever the user's authentication state changes.
 */
export async function initFirebase(onUserChanged) {
    // Initialize app, auth, and db only if they haven't been initialized yet.
    if (!app) {
        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);
        console.log("Firebase initialized.");
    }

    // Listen for authentication state changes. This runs immediately on load
    // and whenever a user signs in or out.
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // User is signed in.
            currentUserId = user.uid;
            currentUserEmail = user.email || "N/A";
            console.log(`User logged in: ${currentUserEmail} (UID: ${currentUserId})`);

            // Ensure every new user gets a Firestore doc with role: "passenger" and uid
            // This prevents issues if a user signs up without a corresponding Firestore profile.
            const userRef = doc(db, "users", user.uid);
            const userSnap = await getDoc(userRef);

            if (!userSnap.exists()) {
                console.log(`Creating new user document for ${user.email} with role 'passenger'.`);
                await setDoc(userRef, {
                    uid: user.uid,
                    email: user.email,
                    role: "passenger", // Default role for new users
                    createdAt: new Date().toISOString() // Add a creation timestamp
                });
            }
        } else {
            // User is signed out.
            currentUserId = null;
            currentUserEmail = null;
            console.log("User logged out.");
        }

        // Call the provided callback function, if any.
        if (onUserChanged) {
            onUserChanged(user);
        }
    });

    // If an initial custom auth token is provided (e.g., from server-side rendering),
    // sign in with it immediately.
    if (initialAuthToken) {
        try {
            await signInWithCustomToken(auth, initialAuthToken);
            console.log("Signed in with custom token.");
        } catch (error) {
            console.error("Error signing in with custom token:", error);
        }
    }
}

/**
 * Initiates the Google Sign-In process using a popup.
 */
export async function googleLogin() {
    const provider = new GoogleAuthProvider();
    try {
        await signInWithPopup(auth, provider);
        console.log("Google login successful.");
    } catch (error) {
        console.error("Google login failed:", error);
        // You might want to show a user-friendly error message here
    }
}

/**
 * Signs out the current user.
 */
export async function googleLogout() {
    try {
        await signOut(auth);
        console.log("User signed out successfully.");
    } catch (error) {
        console.error("Error signing out:", error);
        // Show error message if logout fails
    }
}
