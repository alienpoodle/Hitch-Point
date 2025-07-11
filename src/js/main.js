// src/js/main.js

import { initFirebase } from './firebase.js';
import { setupAuthListeners } from './auth.js';
import { setupMapListeners, openMapModal as mapsOpenMapModal } from './maps.js';
import { setupRideListeners } from './ride.js';
import { setupHistoryListeners } from './history.js';
import { setupPWA } from './pwa.js';
import { showLoadingOverlay, hideLoadingOverlay } from './ui.js';
import { initProfileFeature } from './profile.js';


document.addEventListener('DOMContentLoaded', async () => { // Keep this async
    showLoadingOverlay();

    try {
        // AWAIT initFirebase to ensure it completes before proceeding
        await initFirebase((user) => { // Pass the user state change callback
            // This callback handles UI visibility changes based on auth state
            const loggedOutView = document.getElementById('logged-out-view');
            const rideRequestSection = document.getElementById('ride-request-section');
            const mainNavbar = document.getElementById('main-navbar');
            const profileView = document.getElementById('profile-view');
            // Ensure all UI elements that need to be hidden/shown on auth state change are defined here
            const driverRequestsSection = document.getElementById('driver-requests-section'); // If applicable
            const rideHistoryModal = document.getElementById('ride-history-modal');
            const quoteDisplayModal = document.getElementById('quote-display-modal');
            const mapModal = document.getElementById('map-modal');
            const driverRouteModal = document.getElementById('driver-route-modal'); 

            if (user) {
                if (loggedOutView) loggedOutView.classList.add('d-none');
                if (rideRequestSection) rideRequestSection.classList.remove('d-none');
                if (mainNavbar) mainNavbar.classList.remove('d-none');
                if (profileView) profileView.classList.add('d-none'); // Hidden by default unless navigated to
                const userEmailElem = document.getElementById('user-email');
                if (userEmailElem) userEmailElem.textContent = user.email || "N/A";
                const userIdElem = document.getElementById('user-id');
                if (userIdElem) userIdElem.textContent = user.uid;
            } else {
                if (loggedOutView) loggedOutView.classList.remove('d-none');
                if (rideRequestSection) rideRequestSection.classList.add('d-none');
                if (mainNavbar) mainNavbar.classList.add('d-none');
                if (profileView) profileView.classList.add('d-none');
                // Hide all relevant modals/sections when logged out
                if (driverRequestsSection) driverRequestsSection.classList.add('d-none');
                if (rideHistoryModal) rideHistoryModal.classList.add('d-none');
                if (quoteDisplayModal) quoteDisplayModal.classList.add('d-none');
                if (mapModal) mapModal.classList.add('d-none');
                if (driverRouteModal) driverRouteModal.classList.add('d-none');
            }
            // Features that depend on user being logged in or specific roles can be initialized here
            initProfileFeature();
        });

        // Setup other listeners and features that do NOT depend on Google Maps being ready
        setupAuthListeners();

        // Google Maps initialization: setupMapListeners now handles loading the script internally.
        // It fetches the API key from window.firebaseConfig itself.
        setupMapListeners();

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

        // --- Global closeModal function  ---
        window.closeModal = function(id) {
            const modal = document.getElementById(id);
            if (modal) modal.classList.add('d-none');
        }

        // --- Hamburger menu toggle logic  ---
        const navbarHamburger = document.getElementById('navbar-hamburger');
        const navbarDropdown = document.getElementById('navbar-dropdown');
        if (navbarHamburger && navbarDropdown) {
            navbarHamburger.addEventListener('click', (e) => {
                e.stopPropagation();
                navbarDropdown.classList.toggle('show');
            });
            document.addEventListener('click', (e) => {
                if (!navbarDropdown.contains(e.target) && !navbarHamburger.contains(e.target)) {
                    navbarDropdown.classList.remove('show');
                }
            });
        }

        // --- Carousel logic for login screen ---
        const slides = document.querySelectorAll('#login-carousel .carousel-slide');
        const dots = document.querySelectorAll('#login-carousel .carousel-dot');
        let currentSlide = 0;
        let carouselTimer = null;

        function showSlide(index) {
            slides.forEach((slide, i) => {
                slide.classList.toggle('active', i === index);
                dots[i].classList.toggle('active', i === index);
            });
            currentSlide = index;
        }

        function nextSlide() {
            let next = (currentSlide + 1) % slides.length;
            showSlide(next);
        }

        function resetCarouselTimer() {
            if (carouselTimer) clearInterval(carouselTimer);
            carouselTimer = setInterval(nextSlide, 3000);
        }

        // Only setup carousel if elements exist
        if (slides.length > 0 && dots.length > 0) {
            dots.forEach((dot, idx) => {
                dot.addEventListener('click', () => {
                    showSlide(idx);
                    resetCarouselTimer();
                });
            });
            showSlide(0);
            resetCarouselTimer();
        }

    } catch (error) {
        console.error("Error during application initialization:", error);
        alert("There was an error loading the application. Please try again.");
    } finally {
        hideLoadingOverlay();
    }
});
