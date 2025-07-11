import { initFirebase } from './firebase.js';
import { setupAuthListeners } from './auth.js';
import { setupMapListeners, openMapModal as mapsOpenMapModal } from './maps.js'; // Renamed openMapModal to avoid conflict
import { setupRideListeners } from './ride.js';
import { setupHistoryListeners } from './history.js';
import { setupPWA } from './pwa.js';
import { showLoadingOverlay, hideLoadingOverlay } from './ui.js';
import { initProfileFeature } from './profile.js';

document.addEventListener('DOMContentLoaded', () => {
    showLoadingOverlay();

    // Initialize Firebase and set up listeners based on auth state
    initFirebase((user) => {
        const loggedOutView = document.getElementById('logged-out-view');
        const rideRequestSection = document.getElementById('ride-request-section');
        const mainNavbar = document.getElementById('main-navbar');
        const profileView = document.getElementById('profile-view'); // Ensure this element exists

        if (user) {
            if (loggedOutView) loggedOutView.classList.add('d-none');
            if (rideRequestSection) rideRequestSection.classList.remove('d-none');
            if (mainNavbar) mainNavbar.classList.remove('d-none');
            // If user logs in, ensure profile view is hidden by default unless navigated to
            if (profileView) profileView.classList.add('d-none');
            // Show toast on successful login (if desired)
            // showToast("Welcome!", "success");
        } else {
            if (loggedOutView) loggedOutView.classList.remove('d-none');
            if (rideRequestSection) rideRequestSection.classList.add('d-none');
            if (mainNavbar) mainNavbar.classList.add('d-none');
            // Ensure profile view is hidden when logged out
            if (profileView) profileView.classList.add('d-none');
            // showToast("Logged out.", "info"); // Show toast on logout (if desired)
        }
        hideLoadingOverlay();
    });

    // Setup other listeners and features
    setupAuthListeners();
    // Pass the Google Maps API key to setupMapListeners
    // Ensure window.firebaseConfig is defined and has googleMapsApiKey
    if (window.firebaseConfig && window.firebaseConfig.googleMapsApiKey) {
        setupMapListeners(window.firebaseConfig.googleMapsApiKey);
    } else {
        console.error("Google Maps API Key not found in window.firebaseConfig. Please check your Firebase configuration.");
        showToast("Error: Google Maps features might not work correctly (API Key missing).", "danger");
    }

    initProfileFeature();
    setupRideListeners();
    setupHistoryListeners();
    setupPWA();

    // --- Profile View Toggle ---
    const profileView = document.getElementById('profile-view');
    const rideRequestSection = document.getElementById('ride-request-section');
    const navbarProfileBtn = document.getElementById('navbar-profile');
    const profileBackBtn = document.getElementById('profile-back-btn');

    function showProfileView() {
        if (profileView && rideRequestSection) {
            profileView.classList.remove('d-none');
            rideRequestSection.classList.add('d-none');
        }
    }
    function hideProfileView() {
        if (profileView && rideRequestSection) {
            profileView.classList.add('d-none');
            rideRequestSection.classList.remove('d-none');
        }
    }

    if (navbarProfileBtn) {
        navbarProfileBtn.addEventListener('click', showProfileView);
    }
    if (profileBackBtn) {
        profileBackBtn.addEventListener('click', hideProfileView);
    }

 
});
