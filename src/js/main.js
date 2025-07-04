import { initFirebase } from './firebase.js';
import { setupAuthListeners } from './auth.js';
import { setupMapListeners } from './maps.js';
import { setupRideListeners } from './ride.js';
import { setupHistoryListeners } from './history.js';
import { setupPWA } from './pwa.js';
import { showLoadingOverlay, hideLoadingOverlay } from './ui.js';
import { initProfileFeature } from './profile.js';

document.addEventListener('DOMContentLoaded', () => {
    showLoadingOverlay();
initFirebase((user) => {
    const loggedOutView = document.getElementById('logged-out-view');
    const rideRequestSection = document.getElementById('ride-request-section');
    const mainNavbar = document.getElementById('main-navbar');
    const profileView = document.getElementById('profile-view');
    if (user) {
        if (loggedOutView) loggedOutView.classList.add('d-none');
        if (rideRequestSection) rideRequestSection.classList.remove('d-none');
        if (mainNavbar) mainNavbar.classList.remove('d-none');
        if (profileView) profileView.classList.add('d-none');
    } else {
        if (loggedOutView) loggedOutView.classList.remove('d-none');
        if (rideRequestSection) rideRequestSection.classList.add('d-none');
        if (mainNavbar) mainNavbar.classList.add('d-none');
        if (profileView) profileView.classList.add('d-none');
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

    // Carousel logic for login screen (if using Bootstrap carousel, this may not be needed)
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

    if (slides.length && dots.length) {
        showSlide(0);
        resetCarouselTimer();
    }
});