import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
    getAuth,
    GoogleAuthProvider,
    signInWithPopup,
    signOut,
    onAuthStateChanged,
    signInWithCustomToken,
    signInAnonymously
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
    getFirestore,
    collection,
    addDoc,
    query,
    where,
    orderBy,
    onSnapshot,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import {
    BASE_FARE_XCD,
    DEFAULT_PER_KM_RATE_XCD,
    AFTER_HOURS_SURCHARGE_PERCENTAGE,
    XCD_TO_USD_EXCHANGE_RATE,
    COST_PER_ADDITIONAL_BAG_XCD,
    COST_PER_ADDITIONAL_PERSON_XCD,
    FREE_PERSON_COUNT
} from './constants.js';

// --- Register Service Worker for PWA ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then(registration => console.log('ServiceWorker registered'))
            .catch(err => console.log('ServiceWorker registration failed:', err));
    });
}

// --- Global Variables ---
const firebaseConfig = window.firebaseConfig || {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
let app, auth, db;
let currentUserId = null;
let currentUserEmail = null;
let isAuthReady = false;

// Google Maps variables
let map;
let geocoder;
let mapSelectionMode = 'none'; // 'none', 'origin', 'destination'
let selectedMarker = null;
let isGoogleMapsReady = false;
let isGoogleMapsLoading = false;
let mapLoadPromise = null;

// PWA Install Prompt
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    // Show install button
    const installBtn = document.getElementById('install-pwa-btn');
    if (installBtn) installBtn.classList.remove('hidden');
});

// --- Modal Management ---
function openModal(modalId) {
    document.getElementById(modalId).classList.add('show');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('show');
    
    if (modalId === 'map-modal') {
        mapSelectionMode = 'none';
        if (selectedMarker) {
            selectedMarker.setMap(null);
            selectedMarker = null;
        }
    } else if (modalId === 'ride-history-modal') {
        // Clean up Firestore listener when closing ride history
        if (window.rideHistoryUnsubscribe) {
            window.rideHistoryUnsubscribe();
            window.rideHistoryUnsubscribe = null;
        }
    }
}

// Make closeModal globally available
window.closeModal = closeModal;

// --- Google Maps Integration ---
function loadGoogleMapsScript(apiKey) {
    // If already loading, return the existing promise
    if (isGoogleMapsLoading && mapLoadPromise) {
        return mapLoadPromise;
    }
    
    // If already loaded, return resolved promise
    if (window.google && window.google.maps) {
        isGoogleMapsReady = true;
        return Promise.resolve();
    }
    
    isGoogleMapsLoading = true;
    
    mapLoadPromise = new Promise((resolve, reject) => {
        // Define the callback function globally BEFORE adding the script
        window.googleMapsCallback = function() {
            isGoogleMapsReady = true;
            isGoogleMapsLoading = false;
            geocoder = new google.maps.Geocoder();
            console.log("Google Maps loaded successfully");
            resolve();
        };
        
        const script = document.createElement('script');
        script.id = 'google-maps-script';
        script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=googleMapsCallback`;
        script.async = true;
        script.defer = true;
        
        script.onerror = () => {
            isGoogleMapsLoading = false;
            showToast("Failed to load Google Maps. Please check your API key.", "error");
            reject(new Error("Failed to load Google Maps"));
        };
        
        document.head.appendChild(script);
    });
    
    return mapLoadPromise;
}

// --- Map Modal Logic ---
function openMapModal(mode) {
    if (!isGoogleMapsReady) {
        showToast("Google Maps is not ready. Please try again.", "error");
        return;
    }
    
    mapSelectionMode = mode;
    openModal('map-modal');
    
    // Add a small delay to ensure modal is visible before initializing map
    setTimeout(() => {
        initMapForSelection();
    }, 300);
}

// --- Map Selection Logic ---
function initMapForSelection() {
    if (!isGoogleMapsReady || !window.google || !window.google.maps) {
        showToast("Google Maps is not ready yet.", "error");
        closeModal('map-modal');
        return;
    }

    const mapDiv = document.getElementById('map');
    if (!mapDiv) {
        console.error("Map div not found");
        return;
    }

    // Clear any existing map
    mapDiv.innerHTML = "";

    try {
        // Initialize map centered on St. Vincent
        map = new google.maps.Map(mapDiv, {
            center: { lat: 13.1592, lng: -61.2185 },
            zoom: 11,
            mapTypeControl: true,
            streetViewControl: false,
            fullscreenControl: true,
            zoomControl: true,
            styles: [
                {
                    featureType: "poi.business",
                    elementType: "labels",
                    stylers: [{ visibility: "off" }]
                }
            ]
        });

        // Initialize geocoder if not already done
        if (!geocoder) {
            geocoder = new google.maps.Geocoder();
        }

        // Add click listener for location selection
        map.addListener('click', (event) => {
            placeMarkerAndGetAddress(event.latLng);
        });

        // Add instruction overlay
        const instructionDiv = document.createElement('div');
        instructionDiv.className = 'map-instruction';
        instructionDiv.innerHTML = `
            <i class="fas fa-map-marker-alt"></i> 
            Click anywhere on the map to select your ${mapSelectionMode}
        `;
        mapDiv.appendChild(instructionDiv);
        
        console.log("Map initialized successfully for", mapSelectionMode);
    } catch (error) {
        console.error("Error initializing map:", error);
        showToast("Error initializing map", "error");
        closeModal('map-modal');
    }
}

function placeMarkerAndGetAddress(location) {
    // Remove existing marker
    if (selectedMarker) {
        selectedMarker.setMap(null);
    }

    // Place new marker
    selectedMarker = new google.maps.Marker({
        position: location,
        map: map,
        animation: google.maps.Animation.DROP
    });

    // Get address from coordinates
    geocoder.geocode({ location: location }, (results, status) => {
        if (status === 'OK' && results[0]) {
            const address = results[0].formatted_address;
            
            // Update the appropriate input field
            if (mapSelectionMode === 'origin') {
                document.getElementById('origin-input').value = address;
                showToast("Origin location selected!", "success");
            } else if (mapSelectionMode === 'destination') {
                document.getElementById('destination-input').value = address;
                showToast("Destination location selected!", "success");
            }
            
            // Close modal after short delay
            setTimeout(() => {
                closeModal('map-modal');
            }, 1000);
        } else {
            showToast("Could not find address for this location.", "warning");
        }
    });
}

// --- Firebase Initialization and Authentication ---
const initFirebase = async () => {
    try {
        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);

        onAuthStateChanged(auth, async (user) => {
            isAuthReady = true;
            if (user) {
                currentUserId = user.uid;
                currentUserEmail = user.email || "N/A";
                document.getElementById('logged-out-view').classList.add('hidden');
                document.getElementById('logged-in-view').classList.remove('hidden');
                document.getElementById('user-email').textContent = currentUserEmail;
                document.getElementById('user-id').textContent = currentUserId;
                document.getElementById('ride-request-section').classList.remove('hidden');
                document.getElementById('main-navbar').classList.remove('hidden');
            } else {
                currentUserId = null;
                currentUserEmail = null;
                document.getElementById('logged-out-view').classList.remove('hidden');
                document.getElementById('logged-in-view').classList.add('hidden');
                document.getElementById('ride-request-section').classList.add('hidden');
                document.getElementById('main-navbar').classList.add('hidden');
            }
            hideLoadingOverlay();
        });

        if (initialAuthToken) {
            await signInWithCustomToken(auth, initialAuthToken);
        } else {
            await signInAnonymously(auth);
        }
    } catch (error) {
        console.error("Error initializing Firebase:", error);
        showToast("Failed to initialize the app. Please try again later.", "error");
        hideLoadingOverlay();
    }
};

const googleLogin = async () => {
    showLoadingOverlay();
    try {
        const provider = new GoogleAuthProvider();
        await signInWithPopup(auth, provider);
        showToast("Successfully logged in!", "success");
    } catch (error) {
        console.error("Google Sign-In Error:", error);
        if (error.code !== 'auth/popup-closed-by-user') {
            showToast("Could not sign in with Google. Please try again.", "error");
        }
        hideLoadingOverlay();
    }
};

const googleLogout = async () => {
    showLoadingOverlay();
    try {
        await signOut(auth);
        showToast("Successfully logged out!", "success");
    } catch (error) {
        console.error("Google Sign-Out Error:", error);
        showToast("Could not log out. Please try again.", "error");
        hideLoadingOverlay();
    }
};

// --- UI Utility Functions ---
function showToast(message, type = "info", duration = 3500) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.textContent = message;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = "0";
        setTimeout(() => container.removeChild(toast), 400);
    }, duration);
}

function showLoadingOverlay() {
    document.getElementById('loading-overlay').classList.add('show');
}

function hideLoadingOverlay() {
    document.getElementById('loading-overlay').classList.remove('show');
}

// --- Ride Request Logic ---
async function calculateRoute() {
    const origin = document.getElementById('origin-input').value;
    const destination = document.getElementById('destination-input').value;
    const bags = parseInt(document.getElementById('bags-input').value, 10) || 0;
    const persons = parseInt(document.getElementById('persons-input').value, 10) || 1;
    const isAfterHours = document.getElementById('after-hours-input').checked;
    const isRoundTrip = document.getElementById('round-trip-input').checked;

    if (!origin || !destination) {
        showToast("Please enter both origin and destination.", "warning");
        return;
    }

    if (!isGoogleMapsReady) {
        showToast("Google Maps is not loaded yet. Please try again.", "error");
        return;
    }

    showLoadingOverlay();

    try {
        const directionsService = new google.maps.DirectionsService();

        directionsService.route(
            {
                origin,
                destination,
                travelMode: google.maps.TravelMode.DRIVING
            },
            async (result, status) => {
                hideLoadingOverlay();

                if (status === "OK" && result.routes.length > 0) {
                    const leg = result.routes[0].legs[0];

                    // Update quote modal
                    document.getElementById('quote-distance').textContent = leg.distance.text;
                    document.getElementById('quote-duration').textContent = leg.duration.text;
                    document.getElementById('quote-origin').textContent = origin;
                    document.getElementById('quote-destination').textContent = destination;
                    document.getElementById('quote-bags').textContent = bags > 0 ? `${bags} bag(s)` : "No bags";
                    document.getElementById('quote-persons').textContent = persons > 1 ? `${persons} person(s)` : "1 person";
                    document.getElementById('quote-afterHours').textContent = isAfterHours ? "Yes" : "No";
                    document.getElementById('quote-roundtrip').textContent = isRoundTrip ? "Yes" : "No";

                    // --- Fare Calculation using constants.js ---
                    const distanceKm = leg.distance.value / 1000;
                    let fareXCD = BASE_FARE_XCD + (distanceKm * DEFAULT_PER_KM_RATE_XCD);

                    if (bags > 0) {
                        fareXCD += bags * COST_PER_ADDITIONAL_BAG_XCD;
                    }
                    if (persons > FREE_PERSON_COUNT) {
                        fareXCD += (persons - FREE_PERSON_COUNT) * COST_PER_ADDITIONAL_PERSON_XCD;
                    }
                    if (isAfterHours) {
                        fareXCD += fareXCD * AFTER_HOURS_SURCHARGE_PERCENTAGE;
                    }
                    if (isRoundTrip) {
                        fareXCD *= 2;
                    }

                    const fareUSD = fareXCD * XCD_TO_USD_EXCHANGE_RATE;

                    document.getElementById('quote-fare').textContent =
                        `${Math.round(fareXCD)} XCD / $${Math.round(fareUSD)} USD`;

                    openModal('quote-display-modal');

                    // Save ride request to Firestore
                    if (db && currentUserId) {
                        try {
                            await addDoc(collection(db, "rides"), {
                                userId: currentUserId,
                                origin,
                                destination,
                                distance: leg.distance.text,
                                duration: leg.duration.text,
                                fareXCD: fareXCD.toFixed(2),
                                fareUSD: fareUSD.toFixed(2),
                                bags,
                                persons,
                                afterHours: isAfterHours,
                                roundTrip: isRoundTrip,
                                status: 'quoted',
                                timestamp: serverTimestamp()
                            });
                            showToast("Ride quote saved to history!", "success");
                            resetRideForm();
                        } catch (err) {
                            console.error("Failed to save ride:", err);
                            showToast("Failed to save ride request.", "error");
                        }
                    }
                } else {
                    showToast("Could not calculate route. Please check your locations.", "error");
                }
            }
        );
    } catch (err) {
        hideLoadingOverlay();
        console.error("Route calculation error:", err);
        showToast("Error calculating route.", "error");
    }
}

// --- Ride Quote Display ---
function resetRideForm() {
    document.getElementById('origin-input').value = '';
    document.getElementById('destination-input').value = '';
    document.getElementById('bags-input').value = 0;
    document.getElementById('persons-input').value = 1;
    document.getElementById('after-hours-input').checked = false;
    document.getElementById('round-trip-input').checked = false;
}

function printQuote() {
    const modal = document.getElementById('quote-display-modal');
    if (!modal) return;
    
    const printContents = modal.querySelector('.modal-quote-content').innerHTML;
    const win = window.open('', '', 'height=600,width=400');
    
    win.document.write(`
        <html>
        <head>
            <title>HitchPoint - Ride Quote</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; }
                h1 { color: #5E9BCD; }
                .quote-detail { margin: 10px 0; }
                .fare { font-size: 24px; font-weight: bold; color: #FFD700; }
            </style>
        </head>
        <body>
            <h1>HitchPoint Ride Quote</h1>
            ${printContents}
            <p style="margin-top: 30px; font-size: 12px; color: #666;">
                Generated on ${new Date().toLocaleString()}
            </p>
        </body>
        </html>
    `);
    
    win.document.close();
    win.print();
}

// --- Ride History ---
function showRideHistory() {
    if (!db || !currentUserId) {
        showToast("You must be logged in to view ride history.", "warning");
        return;
    }
    
    openModal('ride-history-modal');
    const historyBody = document.getElementById('ride-history-body');
    historyBody.innerHTML = '<div class="loading-spinner-container"><div class="spinner"></div><p>Loading ride history...</p></div>';
    
    const ridesRef = collection(db, "rides");
    const q = query(ridesRef, where("userId", "==", currentUserId), orderBy("timestamp", "desc"));
    
    let unsubscribe = null;
    
    try {
        unsubscribe = onSnapshot(q, 
            (snapshot) => {
                // Success callback
                if (snapshot.empty) {
                    historyBody.innerHTML = `
                        <div class="empty-state">
                            <i class="fas fa-car fa-3x"></i>
                            <p>No ride history found.</p>
                            <p class="text-sm text-gray-500">Your ride requests will appear here.</p>
                        </div>
                    `;
                    return;
                }
                
                let html = `
                    <div class="table-container">
                        <table class="modal-ride-history-table">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Origin</th>
                                    <th>Destination</th>
                                    <th>Distance</th>
                                    <th>Fare</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                `;
                
                snapshot.forEach(doc => {
                    const data = doc.data();
                    const date = data.timestamp ? new Date(data.timestamp.seconds * 1000).toLocaleString() : 'N/A';
                    const status = data.status || 'quoted';
                    const statusClass = status === 'completed' ? 'status-completed' : 'status-quoted';
                    
                    html += `
                        <tr>
                            <td>${date}</td>
                            <td class="truncate" title="${data.origin || 'N/A'}">${data.origin || 'N/A'}</td>
                            <td class="truncate" title="${data.destination || 'N/A'}">${data.destination || 'N/A'}</td>
                            <td>${data.distance || 'N/A'}</td>
                            <td class="fare-amount">
                                ${data.fareXCD ? Math.round(Number(data.fareXCD)) + ' XCD' : ''}
                                ${data.fareUSD ? '/ $' + Math.round(Number(data.fareUSD)) + ' USD' : ''}
                            </td>
                            <td><span class="status-badge ${statusClass}">${status}</span></td>
                        </tr>
                    `;
                });
                
                html += '</tbody></table></div>';
                historyBody.innerHTML = html;
            },
            (error) => {
                // Error callback
                console.error("Error loading ride history:", error);
                closeModal('ride-history-modal');
                
                // Show error as toast notification instead of in modal
                if (error.code === 'permission-denied') {
                    showToast("Permission denied. Please log in again.", "error");
                } else if (error.code === 'unavailable') {
                    showToast("Service temporarily unavailable. Please try again later.", "error");
                } else {
                    showToast("Failed to load ride history. Please try again.", "error");
                }
            }
        );
        
        // Store unsubscribe function for cleanup
        window.rideHistoryUnsubscribe = unsubscribe;
        
    } catch (error) {
        console.error("Error setting up ride history listener:", error);
        closeModal('ride-history-modal');
        showToast("Failed to load ride history. Please try again.", "error");
    }
}

// --- PWA Install ---
async function installPWA() {
    if (!deferredPrompt) {
        showToast("App is already installed or not available for installation.", "info");
        return;
    }
    
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
        showToast("App installed successfully!", "success");
    }
    
    deferredPrompt = null;
    document.getElementById('install-pwa-btn').classList.add('hidden');
}

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    if (!firebaseConfig.googleMapsApiKey) {
        showToast("Google Maps API key is missing from configuration.", "error");
        hideLoadingOverlay();
    } else {
        showLoadingOverlay();
        initFirebase();
        
        // Optionally preload Google Maps in the background
        setTimeout(() => {
            loadGoogleMapsScript(firebaseConfig.googleMapsApiKey).catch(err => {
                console.warn("Background maps preload failed:", err);
            });
        }, 2000);
    }
    
    // Authentication buttons
    document.getElementById('google-login-btn').addEventListener('click', googleLogin);

    // Hamburger menu toggle
    const navbarHamburger = document.getElementById('navbar-hamburger');
    const navbarDropdown = document.getElementById('navbar-dropdown');
    if (navbarHamburger && navbarDropdown) {
        navbarHamburger.addEventListener('click', () => {
            navbarDropdown.classList.toggle('show');
        });
        // Optional: close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!navbarDropdown.contains(e.target) && !navbarHamburger.contains(e.target)) {
                navbarDropdown.classList.remove('show');
            }
        });
    }

    // Navbar button actions
    const navbarLogout = document.getElementById('navbar-logout');
    const navbarViewHistory = document.getElementById('navbar-view-history');
    if (navbarLogout) {
        navbarLogout.addEventListener('click', googleLogout);
    }
    if (navbarViewHistory) {
        navbarViewHistory.addEventListener('click', showRideHistory);
    }

    // Ride request buttons
    document.getElementById('request-ride-btn').addEventListener('click', calculateRoute);
    document.getElementById('print-quote-btn').addEventListener('click', printQuote);

    // Map selection buttons
    document.getElementById('select-origin-map-btn').addEventListener('click', async () => {
        showLoadingOverlay();
        try {
            await loadGoogleMapsScript(firebaseConfig.googleMapsApiKey);
            hideLoadingOverlay();
            openMapModal('origin');
        } catch (error) {
            hideLoadingOverlay();
            console.error("Error loading maps:", error);
            showToast("Failed to load Google Maps", "error");
        }
    });

    document.getElementById('select-destination-map-btn').addEventListener('click', async () => {
        showLoadingOverlay();
        try {
            await loadGoogleMapsScript(firebaseConfig.googleMapsApiKey);
            hideLoadingOverlay();
            openMapModal('destination');
        } catch (error) {
            hideLoadingOverlay();
            console.error("Error loading maps:", error);
            showToast("Failed to load Google Maps", "error");
        }
    });

    // PWA install button
    const installBtn = document.getElementById('install-pwa-btn');
    if (installBtn) {
        installBtn.addEventListener('click', installPWA);
    }
});