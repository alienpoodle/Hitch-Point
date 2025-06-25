import { googleLogin, googleLogout, currentUserEmail, currentUserId } from './firebase.js';
import { showToast, hideLoadingOverlay } from './ui.js';

export function setupAuthListeners() {
    const googleLoginBtn = document.getElementById('google-login-btn');
    if (googleLoginBtn) googleLoginBtn.addEventListener('click', async () => {
        try {
            await googleLogin();
            showToast("Successfully logged in!", "success");
        } catch (error) {
            showToast("Could not sign in with Google. Please try again.", "error");
            hideLoadingOverlay();
        }
    });

    const navbarLogout = document.getElementById('navbar-logout');
    if (navbarLogout) navbarLogout.addEventListener('click', async () => {
        try {
            await googleLogout();
            showToast("Successfully logged out!", "success");
        } catch (error) {
            showToast("Could not log out. Please try again.", "error");
            hideLoadingOverlay();
        }
    });
}