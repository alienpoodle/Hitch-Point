import { initFirebase } from './firebase.js';
import { setupAuthListeners } from './auth.js';
import { setupMapListeners } from './maps.js';
import { setupRideListeners } from './ride.js';
import { setupHistoryListeners } from './history.js';
import { setupPWA } from './pwa.js';
import { showLoadingOverlay, hideLoadingOverlay } from './ui.js';

document.addEventListener('DOMContentLoaded', () => {
    showLoadingOverlay();
    initFirebase((user) => {
        // Show/hide UI based on user state
        const loggedOutView = document.getElementById('logged-out-view');
        const loggedInView = document.getElementById('logged-in-view');
        const rideRequestSection = document.getElementById('ride-request-section');
        const mainNavbar = document.getElementById('main-navbar');
        if (user) {
            if (loggedOutView) loggedOutView.classList.add('hidden');
            if (loggedInView) loggedInView.classList.remove('hidden');
            if (rideRequestSection) rideRequestSection.classList.remove('hidden');
            if (mainNavbar) mainNavbar.classList.remove('hidden');
            const userEmailElem = document.getElementById('user-email');
            if (userEmailElem) userEmailElem.textContent = user.email || "N/A";
            const userIdElem = document.getElementById('user-id');
            if (userIdElem) userIdElem.textContent = user.uid;
        } else {
            if (loggedOutView) loggedOutView.classList.remove('hidden');
            if (loggedInView) loggedInView.classList.add('hidden');
            if (rideRequestSection) rideRequestSection.classList.add('hidden');
            if (mainNavbar) mainNavbar.classList.add('hidden');
        }
        hideLoadingOverlay();
    });
    setupAuthListeners();
    setupMapListeners(window.firebaseConfig.googleMapsApiKey);
    setupRideListeners();
    setupHistoryListeners();
    setupPWA();
});