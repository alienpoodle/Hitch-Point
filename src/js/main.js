import { initFirebase } from './firebase.js';
import { setupAuthListeners } from './auth.js';
import { setupMapListeners } from './maps.js';
import { setupRideListeners } from './ride.js';
import { setupHistoryListeners } from './history.js';
import { setupPWA } from './pwa.js';
import { showLoadingOverlay, hideLoadingOverlay } from './ui.js';
import { initProfileFeature } from './js/profile.js';


document.addEventListener('DOMContentLoaded', () => {
    showLoadingOverlay();
    initFirebase((user) => {
        // Show/hide UI based on user state
        const loggedOutView = document.getElementById('logged-out-view');
        const rideRequestSection = document.getElementById('ride-request-section');
        const mainNavbar = document.getElementById('main-navbar');
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
        }
        hideLoadingOverlay();
    });
    setupAuthListeners();
    setupMapListeners(window.firebaseConfig.googleMapsApiKey);
    initProfileFeature();
    setupRideListeners();
    setupHistoryListeners();
    setupPWA();
    
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
