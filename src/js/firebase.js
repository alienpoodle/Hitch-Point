import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
    getAuth,
    signInWithCustomToken,
    onAuthStateChanged,
    GoogleAuthProvider,
    signInWithPopup,
    signOut
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

export let app, auth, db;
export let currentUserId = null;
export let currentUserEmail = null;

const firebaseConfig = window.firebaseConfig || {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

export async function initFirebase(onUserChanged) {
    if (!app) {
        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);
    }

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUserId = user.uid;
            currentUserEmail = user.email || "N/A";
        } else {
            currentUserId = null;
            currentUserEmail = null;
        }
        if (onUserChanged) onUserChanged(user);
    });

    if (initialAuthToken) {
        await signInWithCustomToken(auth, initialAuthToken);
    }
}

export async function googleLogin() {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
}

export async function googleLogout() {
    await signOut(auth);
}