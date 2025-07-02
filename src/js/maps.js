import { openModal, showToast } from './ui.js';

let map, geocoder, selectedMarker;
let isGoogleMapsReady = false;
let isGoogleMapsLoading = false;
let mapLoadPromise = null;
let mapSelectionMode = 'none';

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
    }, 300);
}

function initMapForSelection() {
    if (!isGoogleMapsReady || !window.google || !window.google.maps) {
        showToast("Google Maps is not loaded yet. Please try again.", "error");
        return;
    }
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

    // Use AdvancedMarkerElement instead of Marker
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
    if (selectedMarker) selectedMarker.map = null;

    // Use AdvancedMarkerElement
    const { AdvancedMarkerElement } = google.maps.marker;
    selectedMarker = new AdvancedMarkerElement({
        map: map,
        position: location,
        title: "Selected Location"
    });

    if (!geocoder) geocoder = new google.maps.Geocoder();
    geocoder.geocode({ location }, (results, status) => {
        if (status === "OK" && results[0]) {
            const address = results[0].formatted_address;
            if (mapSelectionMode === 'origin') {
                const originInput = document.getElementById('origin-input');
                if (originInput) originInput.value = address;
            } else if (mapSelectionMode === 'destination') {
                const destinationInput = document.getElementById('destination-input');
                if (destinationInput) destinationInput.value = address;
            }
        } else {
            showToast("Could not get address for selected location.", "error");
        }
    });
}

export function setupMapListeners(apiKey) {
    loadGoogleMapsScript(apiKey).then(() => {
        // Origin map button
        const selectOriginBtn = document.getElementById('select-origin-map-btn');
        if (selectOriginBtn) {
            selectOriginBtn.addEventListener('click', () => openMapModal('origin'));
        }
        // Destination map button
        const selectDestinationBtn = document.getElementById('select-destination-map-btn');
        if (selectDestinationBtn) {
            selectDestinationBtn.addEventListener('click', () => openMapModal('destination'));
        }
    }).catch(() => {
        showToast("Failed to load Google Maps.", "error");
    });
}