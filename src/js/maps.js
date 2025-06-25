import { showToast, openModal, closeModal, showLoadingOverlay, hideLoadingOverlay } from './ui.js';

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
        window.googleMapsCallback = function() {
            isGoogleMapsReady = true;
            isGoogleMapsLoading = false;
            geocoder = new google.maps.Geocoder();
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

export function openMapModal(mode) {
    if (!isGoogleMapsReady) {
        showToast("Google Maps is not ready. Please try again.", "error");
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
        showToast("Google Maps is not ready yet.", "error");
        closeModal('map-modal');
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
    map.addListener('click', (event) => {
        placeMarkerAndGetAddress(event.latLng);
    });
    const instructionDiv = document.createElement('div');
    instructionDiv.className = 'map-instruction';
    instructionDiv.innerHTML = `<i class="fas fa-map-marker-alt"></i> Click anywhere on the map to select your ${mapSelectionMode}`;
    mapDiv.appendChild(instructionDiv);
}

function placeMarkerAndGetAddress(location) {
    if (selectedMarker) selectedMarker.setMap(null);
    selectedMarker = new google.maps.Marker({
        position: location,
        map: map,
        animation: google.maps.Animation.DROP
    });
    geocoder.geocode({ location: location }, (results, status) => {
        if (status === 'OK' && results[0]) {
            const address = results[0].formatted_address;
            if (mapSelectionMode === 'origin') {
                const originInput = document.getElementById('origin-input');
                if (originInput) originInput.value = address;
                showToast("Origin location selected!", "success");
            } else if (mapSelectionMode === 'destination') {
                const destInput = document.getElementById('destination-input');
                if (destInput) destInput.value = address;
                showToast("Destination location selected!", "success");
            }
            setTimeout(() => closeModal('map-modal'), 1000);
        } else {
            showToast("Could not find address for this location.", "warning");
        }
    });
}

export function setupMapListeners(apiKey) {
    const selectOriginBtn = document.getElementById('select-origin-map-btn');
    if (selectOriginBtn) {
        selectOriginBtn.addEventListener('click', async () => {
            showLoadingOverlay();
            try {
                await loadGoogleMapsScript(apiKey);
                hideLoadingOverlay();
                openMapModal('origin');
            } catch (error) {
                hideLoadingOverlay();
                showToast("Failed to load Google Maps", "error");
            }
        });
    }
    const selectDestinationBtn = document.getElementById('select-destination-map-btn');
    if (selectDestinationBtn) {
        selectDestinationBtn.addEventListener('click', async () => {
            showLoadingOverlay();
            try {
                await loadGoogleMapsScript(apiKey);
                hideLoadingOverlay();
                openMapModal('destination');
            } catch (error) {
                hideLoadingOverlay();
                showToast("Failed to load Google Maps", "error");
            }
        });
    }
}