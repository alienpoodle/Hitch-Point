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

// --- Modal Map Logic ---
function openMapModal(mode) {
    mapSelectionMode = mode;
    document.getElementById('map-modal').classList.add('show');
    setTimeout(() => {
        initMapForSelection();
    }, 100);
}

function closeMapModal() {
    document.getElementById('map-modal').classList.remove('show');
    mapSelectionMode = 'none';
    map = null;
}

window.closeModal = (modalId) => {
    if (modalId === 'map-modal') {
        closeMapModal();
    } else {
        let targetModalElement = null;
        if (modalId) {
            targetModalElement = document.getElementById(modalId);
        } else {
            targetModalElement = document.getElementById('custom-modal');
        }
        if (targetModalElement) targetModalElement.classList.remove('show');
    }
};

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
                document.getElementById('view-history-btn').classList.remove('hidden');
                listenForRideHistory();
            } else {
                currentUserId = null;
                currentUserEmail = null;
                document.getElementById('logged-out-view').classList.remove('hidden');
                document.getElementById('logged-in-view').classList.add('hidden');
                document.getElementById('ride-request-section').classList.add('hidden');
                document.getElementById('view-history-btn').classList.add('hidden');
                document.getElementById('ride-history-body').innerHTML = '';
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
    } catch (error) {
        console.error("Google Sign-Out Error:", error);
        showToast("Could not log out. Please try again.", "error");
        hideLoadingOverlay();
    }
};

// --- Google Maps Integration ---
const loadGoogleMapsScript = (apiKey, callbackName = "initMapForSelection") => {
    if (document.getElementById('google-maps-script')) return;
    const script = document.createElement('script');
    script.id = 'google-maps-script';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=${callbackName}`;
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
    script.onerror = () => {
        showToast("Failed to load Google Maps. Please check your API key and network connection.", "error");
        hideLoadingOverlay();
    };
};

// --- Map Modal Selection Logic ---
window.initMapForSelection = function() {
    const mapDiv = document.getElementById('map');
    mapDiv.innerHTML = ""; // Clear previous map if any

    map = new google.maps.Map(mapDiv, {
        center: { lat: 13.1592, lng: -61.2185 },
        zoom: 12,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false
    });

    geocoder = new google.maps.Geocoder();

    map.addListener('click', (event) => {
        geocoder.geocode({ location: event.latLng }, (results, status) => {
            if (status === 'OK' && results[0]) {
                const address = results[0].formatted_address;
                if (mapSelectionMode === 'origin') {
                    document.getElementById('origin-input').value = address;
                } else if (mapSelectionMode === 'destination') {
                    document.getElementById('destination-input').value = address;
                }
                closeMapModal();
            } else {
                showToast("No address found for this location.", "warning");
            }
        });
    });
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

// --- Real Logic for Required Features ---
async function calculateRoute() {
    const origin = document.getElementById('origin-input').value;
    const destination = document.getElementById('destination-input').value;
    if (!origin || !destination) {
        showToast("Please enter both origin and destination.", "warning");
        return;
    }

    showLoadingOverlay();

    try {
        if (!window.google || !window.google.maps) {
            showToast("Google Maps is not loaded.", "error");
            hideLoadingOverlay();
            return;
        }
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
                    document.getElementById('quote-distance').textContent = leg.distance.text;
                    document.getElementById('quote-duration').textContent = leg.duration.text;
                    // Example fare calculation: $2 per km
                    const distanceKm = leg.distance.value / 1000;
                    const fare = (distanceKm * 2).toFixed(2);
                    document.getElementById('quote-fare').textContent = `$${fare}`;
                    document.getElementById('quote-display-modal').classList.add('show');

                    // Save ride request to Firestore
                    if (db && currentUserId) {
                        try {
                            await addDoc(collection(db, "rides"), {
                                userId: currentUserId,
                                origin,
                                destination,
                                distance: leg.distance.text,
                                duration: leg.duration.text,
                                fare,
                                timestamp: serverTimestamp()
                            });
                        } catch (err) {
                            showToast("Failed to save ride request.", "error");
                        }
                    }
                } else {
                    showToast("Could not calculate route.", "error");
                }
            }
        );
    } catch (err) {
        hideLoadingOverlay();
        showToast("Error calculating route.", "error");
    }
}

function printQuote() {
    const modal = document.getElementById('quote-display-modal');
    if (!modal) return;
    const printContents = modal.querySelector('.modal-quote-content').innerHTML;
    const win = window.open('', '', 'height=600,width=400');
    win.document.write('<html><head><title>Print Quote</title>');
    win.document.write('<link rel="stylesheet" href="styles.css">');
    win.document.write('</head><body>');
    win.document.write(printContents);
    win.document.write('</body></html>');
    win.document.close();
    win.print();
}

function listenForRideHistory() {
    if (!db || !currentUserId) {
        showToast("You must be logged in to view ride history.", "warning");
        return;
    }
    const historyBody = document.getElementById('ride-history-body');
    historyBody.innerHTML = "Loading...";
    const ridesRef = collection(db, "rides");
    const q = query(ridesRef, where("userId", "==", currentUserId), orderBy("timestamp", "desc"));

    onSnapshot(q, (snapshot) => {
        let html = '<table class="modal-ride-history-table"><tr><th>Date</th><th>Origin</th><th>Destination</th><th>Fare</th></tr>';
        snapshot.forEach(doc => {
            const data = doc.data();
            html += `<tr>
                <td>${data.timestamp && data.timestamp.seconds ? new Date(data.timestamp.seconds * 1000).toLocaleString() : ''}</td>
                <td>${data.origin || ''}</td>
                <td>${data.destination || ''}</td>
                <td>${data.fare ? `$${data.fare}` : ''}</td>
            </tr>`;
        });
        html += '</table>';
        historyBody.innerHTML = html;
        document.getElementById('ride-history-modal').classList.add('show');
    }, (error) => {
        showToast("Failed to load ride history.", "error");
        historyBody.innerHTML = "Failed to load ride history.";
    });
}

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    if (!firebaseConfig.googleMapsApiKey) {
        showToast("Google Maps API key is missing from the provided Firebase configuration.", "error");
        hideLoadingOverlay();
    } else {
        showLoadingOverlay();
        initFirebase();
    }

    document.getElementById('google-login-btn').addEventListener('click', googleLogin);
    document.getElementById('google-logout-btn').addEventListener('click', googleLogout);
    document.getElementById('request-ride-btn').addEventListener('click', calculateRoute);
    document.getElementById('print-quote-btn').addEventListener('click', printQuote);

    // Show map modal only when selecting on map
    document.getElementById('select-origin-map-btn').addEventListener('click', () => {
        if (!window.google || !window.google.maps) {
            loadGoogleMapsScript(firebaseConfig.googleMapsApiKey, "initMapForSelection");
            window.initMapForSelection = () => {
                openMapModal('origin');
            };
        } else {
            openMapModal('origin');
        }
    });
    document.getElementById('select-destination-map-btn').addEventListener('click', () => {
        if (!window.google || !window.google.maps) {
            loadGoogleMapsScript(firebaseConfig.googleMapsApiKey, "initMapForSelection");
            window.initMapForSelection = () => {
                openMapModal('destination');
            };
        } else {
            openMapModal('destination');
        }
    });

    document.getElementById('view-history-btn').addEventListener('click', listenForRideHistory);
});