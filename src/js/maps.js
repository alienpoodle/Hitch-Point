import { showToast, openModal } from './ui.js';

let map, geocoder, selectedMarker;
let isGoogleMapsReady = false;
let isGoogleMapsLoading = false;
let mapLoadPromise = null;
let mapSelectionMode = 'none';

// Load Google Maps script with Places library
export async function loadGoogleMapsScript(apiKey) {
    if (isGoogleMapsLoading && mapLoadPromise) return mapLoadPromise;
    if (window.google && window.google.maps) {
        isGoogleMapsReady = true;
        return Promise.resolve();
    }
    isGoogleMapsLoading = true;
    mapLoadPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
        script.async = true;
        script.onload = () => {
            isGoogleMapsReady = true;
            resolve();
        };
        script.onerror = reject;
        document.head.appendChild(script);
    });
    return mapLoadPromise;
}

export function openMapModal(mode) {
    if (!isGoogleMapsReady) {
        showToast("Google Maps is not loaded yet. Please try again.", "error");
        return;
    }
    mapSelectionMode = mode;
    openModal('map-modal');
    setTimeout(() => {
        initMapForSelection();
        // Add click-outside-to-close logic
        const modal = document.getElementById('map-modal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.remove('show');
                }
            });
        }
    }, 300);
}

function initMapForSelection() {
    if (!isGoogleMapsReady || !window.google || !window.google.maps) return;
    const mapDiv = document.getElementById('map');
    if (!mapDiv) return;
    mapDiv.innerHTML = "";
    map = new google.maps.Map(mapDiv, {
        center: { lat: 13.1592, lng: -61.2185 },
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

    // Optional: Add instructions
    const instructionDiv = document.createElement('div');
    instructionDiv.className = 'map-instruction';
    instructionDiv.textContent = "Click on the map to select a location.";
    map.controls[google.maps.ControlPosition.TOP_CENTER].push(instructionDiv);
}

function placeMarkerAndGetAddress(location) {
    // Remove previous marker if exists
    if (selectedMarker) selectedMarker.setMap(null);

    // Use classic Marker
    selectedMarker = new google.maps.Marker({
        map: map,
        position: location,
        title: "Selected Location"
    });

    if (!geocoder) return;
    geocoder.geocode({ location }, (results, status) => {
        if (status === "OK" && results[0]) {
            const address = results[0].formatted_address;
            if (mapSelectionMode.startsWith('route-point-')) {
                if (window._currentRoutePointInput) window._currentRoutePointInput.value = address;
            }
            showToast("Location selected!", "success");
        } else {
            showToast("Could not get address for this location.", "warning");
        }
    });
}

export function setupMapListeners(apiKey) {
    loadGoogleMapsScript(apiKey).then(() => {
        // Delegate map pinning to all select-map-btns
        document.body.addEventListener('click', function(e) {
            if (e.target.closest('.select-map-btn')) {
                const btn = e.target.closest('.select-map-btn');
                const group = btn.closest('.route-point');
                if (!group) return;
                const idx = Array.from(group.parentNode.children).indexOf(group);
                openMapModal('route-point-' + idx);
                // Store the input to fill after map selection
                window._currentRoutePointInput = group.querySelector('.route-point-input');
            }
        });
    }).catch(() => {
        showToast("Failed to load Google Maps.", "error");
    });
}