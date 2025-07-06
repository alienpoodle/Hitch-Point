import { showToast, openModal, hideModal } from './ui.js'; 

let map, geocoder, selectedMarker;
let isGoogleMapsReady = false;
let isGoogleMapsLoading = false;
let mapLoadPromise = null;
let currentInputToFill = null; 

// Load Google Maps script with Places library
export async function loadGoogleMapsScript(apiKey) {
    // If the script is already being loaded, return the existing promise
    if (isGoogleMapsLoading && mapLoadPromise) return mapLoadPromise;

    // If Google Maps is already available globally, set ready flag and resolve immediately
    if (window.google && window.google.maps && window.google.maps.DirectionsService) { // Add check for DirectionsService
        isGoogleMapsReady = true;
        return Promise.resolve();
    }

    isGoogleMapsLoading = true;
    mapLoadPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=initGoogleMaps`; // Use callback
        script.async = true;
        script.defer = true; // Use defer for non-blocking loading
        script.onerror = () => {
            isGoogleMapsLoading = false; // Reset loading state on error
            reject(new Error("Failed to load Google Maps script."));
        };
        document.head.appendChild(script);

        // Define a global callback function for when the Maps API is loaded
        // This is important for ensuring `google.maps` is fully available.
        window.initGoogleMaps = () => {
            isGoogleMapsReady = true;
            isGoogleMapsLoading = false; // Reset loading state on success
            resolve();
        };
    });
    return mapLoadPromise;
}

export function openMapModal(inputElement) { // Pass the input element directly
    if (!isGoogleMapsReady) {
        // Attempt to load if not ready, then re-call openMapModal (if API key is available in main.js context)
        // For a simpler approach here, we just show a toast if it's not ready.
        showToast("Google Maps is not loaded yet. Please try again.", "warning");
        return;
    }

    currentInputToFill = inputElement; // Store the direct reference

    openModal('map-modal'); // Open the Bootstrap modal

    // Use a small delay to ensure modal is rendered and visible before initializing map
    setTimeout(() => {
        initMapForSelection();
    }, 300); // Small delay to ensure modal is visible and sized correctly
}

function initMapForSelection() {
    // Ensure Google Maps API and its components are fully loaded
    if (!isGoogleMapsReady || !window.google || !window.google.maps || !window.google.maps.Map) {
        console.warn("Google Maps API not fully ready for map initialization.");
        return;
    }

    const mapDiv = document.getElementById('map');
    if (!mapDiv) {
        console.error("Map div not found!");
        return;
    }

    // Clear previous map content if any
    mapDiv.innerHTML = "";

    // Initialize map
    map = new google.maps.Map(mapDiv, {
        center: { lat: 13.1592, lng: -61.2185 }, // Center on Saint Vincent and the Grenadines
        zoom: 11,
        mapTypeControl: true,
        streetViewControl: false,
        fullscreenControl: true,
        zoomControl: true,
        styles: [{ featureType: "poi.business", elementType: "labels", stylers: [{ visibility: "off" }] }]
    });

    // Initialize geocoder if not already
    if (!geocoder) geocoder = new google.maps.Geocoder();

    // Add click listener to map to place marker and get address
    map.addListener('click', (event) => {
        placeMarkerAndGetAddress(event.latLng);
    });

    // Add instructions to the map
    const instructionDiv = document.createElement('div');
    instructionDiv.className = 'map-instruction alert alert-info p-1 m-2'; // Added Bootstrap alert classes
    instructionDiv.textContent = "Click on the map to select a location.";
    map.controls[google.maps.ControlPosition.TOP_CENTER].push(instructionDiv);

    // If there's an existing value in the input, try to place a marker there initially
    if (currentInputToFill && currentInputToFill.value) {
        geocoder.geocode({ address: currentInputToFill.value }, (results, status) => {
            if (status === "OK" && results[0]) {
                map.setCenter(results[0].geometry.location);
                placeMarkerAndGetAddress(results[0].geometry.location); // Place marker on initial address
            }
        });
    }
}

function placeMarkerAndGetAddress(location) {
    // Remove previous marker if exists
    if (selectedMarker) selectedMarker.setMap(null);

    // Place new marker
    selectedMarker = new google.maps.Marker({
        map: map,
        position: location,
        title: "Selected Location"
    });

    if (!geocoder) {
        showToast("Geocoder not initialized.", "danger");
        return;
    }

    // Reverse geocode to get address
    geocoder.geocode({ location }, (results, status) => {
        if (status === "OK" && results[0]) {
            const address = results[0].formatted_address;
            if (currentInputToFill) {
                currentInputToFill.value = address;
                // Trigger input event manually so ride calculation can pick it up
                currentInputToFill.dispatchEvent(new Event('input', { bubbles: true }));
                currentInputToFill.dispatchEvent(new Event('change', { bubbles: true }));
            }
            showToast("Location selected!", "success");
            hideModal('map-modal'); // Hide modal after selection
        } else {
            showToast("Could not get address for this location.", "warning");
        }
    });
}

export function setupMapListeners(apiKey) {
    // This function will now ensure the Google Maps script is loaded first.
    loadGoogleMapsScript(apiKey).then(() => {
        // Delegate map pinning to all select-map-btns
        document.body.addEventListener('click', function(e) {
            const btn = e.target.closest('.select-map-btn');
            if (btn) {
                const inputElement = btn.closest('.input-group, .route-point')?.querySelector('.route-point-input');
                if (inputElement) {
                    openMapModal(inputElement); // Pass the direct input element
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