import { showToast, openModal, hideModal } from './ui.js';

let map, geocoder, selectedMarker;
export let directionsService; // Export directionsService
export let distanceMatrixService; // Export distanceMatrixService

let isGoogleMapsReady = false;
let isGoogleMapsLoading = false;
let mapLoadPromise = null;
let currentInputToFill = null;

// Load Google Maps script with Places and Routes libraries
// No longer needs apiKey as a parameter, it accesses it globally
export async function loadGoogleMapsScript() {
    // Ensure window.firebaseConfig and googleMapsApiKey exist
    if (!window.firebaseConfig || !window.firebaseConfig.googleMapsApiKey) {
        const errorMessage = "Google Maps API key not found in window.firebaseConfig.";
        console.error(errorMessage);
        // You might want to show a toast or disable map features here
        return Promise.reject(new Error(errorMessage));
    }

    const apiKey = window.firebaseConfig.googleMapsApiKey;

    // If the script is already being loaded, return the existing promise
    if (isGoogleMapsLoading && mapLoadPromise) return mapLoadPromise;

    // If Google Maps is already available globally, set ready flag and resolve immediately
    if (window.google && window.google.maps && window.google.maps.DirectionsService) {
        // Initialize services immediately if API is already ready
        if (!directionsService) directionsService = new google.maps.DirectionsService();
        if (!distanceMatrixService) distanceMatrixService = new google.maps.DistanceMatrixService();
        isGoogleMapsReady = true;
        return Promise.resolve();
    }

    isGoogleMapsLoading = true;
    mapLoadPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        // Use the globally available API key
        script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,routes&callback=initGoogleMaps`;
        script.async = true;
        script.defer = true;
        script.onerror = () => {
            isGoogleMapsLoading = false;
            reject(new Error("Failed to load Google Maps script."));
        };
        document.head.appendChild(script);

        window.initGoogleMaps = () => {
            isGoogleMapsReady = true;
            isGoogleMapsLoading = false;
            // Initialize services *after* the callback confirms Google Maps is ready
            if (!directionsService) directionsService = new google.maps.DirectionsService();
            if (!distanceMatrixService) distanceMatrixService = new google.maps.DistanceMatrixService();
            resolve();
        };
    });
    return mapLoadPromise;
}

export function openMapModal(inputElement) {
    if (!isGoogleMapsReady) {
        showToast("Google Maps is not loaded yet. Please try again.", "warning");
        return;
    }

    currentInputToFill = inputElement;

    openModal('map-modal');

    setTimeout(() => {
        initMapForSelection();
    }, 300);
}

function initMapForSelection() {
    if (!isGoogleMapsReady || !window.google || !window.google.maps || !window.google.maps.Map) {
        console.warn("Google Maps API not fully ready for map initialization.");
        return;
    }

    const mapDiv = document.getElementById('map');
    if (!mapDiv) {
        console.error("Map div not found!");
        return;
    }

    mapDiv.innerHTML = ""; // Clear previous map content

    map = new google.maps.Map(mapDiv, {
        center: { lat: 13.1592, lng: -61.2185 }, // Center on Saint Vincent and the Grenadines
        zoom: 11,
        mapTypeControl: true,
        streetViewControl: false,
        fullscreenControl: true,
        zoomControl: true,
        styles: [{ featureType: "poi.business", elementType: "labels", stylers: [{ visibility: "off" }] }]
    });

    if (!geocoder) geocoder = new google.maps.Geocoder();

    map.addListener('click', (event) => {
        placeMarkerAndGetAddress(event.latLng);
    });

    const instructionDiv = document.createElement('div');
    instructionDiv.className = 'map-instruction alert alert-info p-1 m-2';
    instructionDiv.textContent = "Click on the map to select a location.";
    map.controls[google.maps.ControlPosition.TOP_CENTER].push(instructionDiv);

    if (currentInputToFill && currentInputToFill.value) {
        geocoder.geocode({ address: currentInputToFill.value }, (results, status) => {
            if (status === "OK" && results[0]) {
                map.setCenter(results[0].geometry.location);
                placeMarkerAndGetAddress(results[0].geometry.location);
            }
        });
    }
}

function placeMarkerAndGetAddress(location) {
    if (selectedMarker) selectedMarker.setMap(null);

    selectedMarker = new google.maps.Marker({
        map: map,
        position: location,
        title: "Selected Location"
    });

    if (!geocoder) {
        showToast("Geocoder not initialized.", "danger");
        return;
    }

    geocoder.geocode({ location }, (results, status) => {
        if (status === "OK" && results[0]) {
            const address = results[0].formatted_address;
            if (currentInputToFill) {
                currentInputToFill.value = address;
                currentInputToFill.dispatchEvent(new Event('input', { bubbles: true }));
                currentInputToFill.dispatchEvent(new Event('change', { bubbles: true }));
            }
            showToast("Location selected!", "success");
            hideModal('map-modal');
        } else {
            showToast("Could not get address for this location.", "warning");
        }
    });
}

// setupMapListeners no longer needs to pass apiKey, as loadGoogleMapsScript handles it
export function setupMapListeners() { // Removed apiKey parameter
    loadGoogleMapsScript().then(() => { // Removed apiKey argument
        document.body.addEventListener('click', function(e) {
            const btn = e.target.closest('.select-map-btn');
            if (btn) {
                const inputElement = btn.closest('.input-group, .route-point')?.querySelector('.route-point-input');
                if (inputElement) {
                    openMapModal(inputElement);
                } else {
                    console.error("Could not find associated .route-point-input for map selection button.");
                    showToast("Error: Associated input field not found.", "danger");
                }
            }
        });
    }).catch((error) => {
        console.error("Error loading Google Maps in setupMapListeners:", error);
        showToast("Failed to load Google Maps: " + error.message, "danger");
    });
}