import { initFirebase } from './firebase.js';
import { setupAuthListeners } from './auth.js';
import { setupMapListeners, loadGoogleMapsApi } from './maps.js';
import { setupRideListeners } from './ride.js';
import { setupHistoryListeners } from './history.js';
import { setupPWA } from './pwa.js';
import { showLoadingOverlay, hideLoadingOverlay } from './ui.js';
import { initProfileFeature } from './profile.js';
import { initDriverFeature } from './driver.js';


document.addEventListener('DOMContentLoaded', async () => {
    showLoadingOverlay();
    initFirebase((user) => {
    // Show/hide UI based on user state
    const loggedOutView = document.getElementById('logged-out-view');
    const rideRequestSection = document.getElementById('ride-request-section');
    const mainNavbar = document.getElementById('main-navbar');
    const profileView = document.getElementById('profile-view');
    const driverRequestsSection = document.getElementById('driver-requests-section');
    const rideHistoryModal = document.getElementById('ride-history-modal');
    const quoteDisplayModal = document.getElementById('quote-display-modal');
    const mapModal = document.getElementById('map-modal');
    const driverRouteModal = document.getElementById('driver-route-modal');

    if (user) {
        if (loggedOutView) loggedOutView.classList.add('hidden');
        if (rideRequestSection) rideRequestSection.classList.remove('hidden');
        if (mainNavbar) mainNavbar.classList.remove('hidden');
        const userEmailElem = document.getElementById('user-email');
        if (userEmailElem) userEmailElem.textContent = user.email || "N/A";
        const userIdElem = document.getElementById('user-id');
        if (userIdElem) userIdElem.textContent = user.uid;
    } else {
        if (loggedOutView) loggedOutView.classList.remove('hidden');
        if (rideRequestSection) rideRequestSection.classList.add('hidden');
        if (mainNavbar) mainNavbar.classList.add('hidden');
        if (profileView) profileView.classList.add('hidden');
        if (driverRequestsSection) driverRequestsSection.classList.add('hidden');
        if (rideHistoryModal) rideHistoryModal.classList.add('hidden');
        if (quoteDisplayModal) quoteDisplayModal.classList.add('hidden');
        if (mapModal) mapModal.classList.add('hidden');
        if (driverRouteModal) driverRouteModal.classList.add('hidden');
    }

    initProfileFeature();
    initDriverFeature();
    hideLoadingOverlay();
});

    // Load Google Maps API
    setupAuthListeners();
    setupMapListeners(window.firebaseConfig.googleMapsApiKey);
    
    setupRideListeners();
    setupHistoryListeners();
    setupPWA();

    const navbarViewHistoryBtn = document.getElementById('navbar-view-history');
    const rideHistoryModal = document.getElementById('ride-history-modal');
    const profileView = document.getElementById('profile-view');
    const rideRequestSection = document.getElementById('ride-request-section');
    const navbarProfileBtn = document.getElementById('navbar-profile');
    const profileBackBtn = document.getElementById('profile-back-btn');

    function showProfileView() {
        profileView.classList.remove('hidden');
        rideRequestSection.classList.add('hidden');
    }
    function hideProfileView() {
        profileView.classList.add('hidden');
        rideRequestSection.classList.remove('hidden');
    }

    if (navbarProfileBtn) {
        navbarProfileBtn.addEventListener('click', showProfileView);
    }
    if (profileBackBtn) {
        profileBackBtn.addEventListener('click', hideProfileView);
    }

    if (navbarViewHistoryBtn && rideHistoryModal) {
    navbarViewHistoryBtn.addEventListener('click', () => {
        rideHistoryModal.classList.remove('hidden');
    });
}

    window.closeModal = function(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.add('hidden');
}

    // Hamburger menu toggle logic
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

    // Carousel logic for login screen
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

    dots.forEach((dot, idx) => {
        dot.addEventListener('click', () => {
            showSlide(idx);
            resetCarouselTimer();
        });
    });

    showSlide(0);
    resetCarouselTimer();
});
