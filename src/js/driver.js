import { getFirestore, collection, getDocs, updateDoc, doc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { showToast } from './ui.js';

const db = getFirestore();
const auth = getAuth();

const driverSection = document.getElementById('driver-requests-section');
const requestsTableBody = document.querySelector('#driver-requests-table tbody');
const routeModal = document.getElementById('driver-route-modal');
const routeMapDiv = document.getElementById('driver-route-map');

export function initDriverFeature() {
    onAuthStateChanged(auth, async user => {
        if (user && user.isDriver) { // You must set this property in your auth logic
            driverSection.classList.remove('hidden');
            await loadRideRequests();
        }
    });
}

async function loadRideRequests() {
    requestsTableBody.innerHTML = '';
    const querySnapshot = await getDocs(collection(db, "rideRequests"));
    querySnapshot.forEach(docSnap => {
        const data = docSnap.data();
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${data.origin}</td>
            <td>${data.destination}</td>
            <td>${data.riderName || data.riderEmail || ''}</td>
            <td>
                <select data-id="${docSnap.id}" class="status-select">
                    <option value="pending" ${data.status === 'pending' ? 'selected' : ''}>Pending</option>
                    <option value="accepted" ${data.status === 'accepted' ? 'selected' : ''}>Accepted</option>
                    <option value="completed" ${data.status === 'completed' ? 'selected' : ''}>Completed</option>
                </select>
            </td>
            <td>
                <button class="btn-secondary view-route-btn" data-origin="${encodeURIComponent(data.origin)}" data-destination="${encodeURIComponent(data.destination)}">View Route</button>
            </td>
        `;
        requestsTableBody.appendChild(tr);
    });

    // Status change handler
    document.querySelectorAll('.status-select').forEach(sel => {
        sel.addEventListener('change', async (e) => {
            const id = e.target.getAttribute('data-id');
            const newStatus = e.target.value;
            await updateDoc(doc(db, "rideRequests", id), { status: newStatus });
            showToast("Status updated!", "success");
        });
    });

    // View route handler
    document.querySelectorAll('.view-route-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const origin = decodeURIComponent(btn.getAttribute('data-origin'));
            const destination = decodeURIComponent(btn.getAttribute('data-destination'));
            showRouteOnMap(origin, destination);
        });
    });
}

// Show route on map using Google Maps JS API
function showRouteOnMap(origin, destination) {
    routeModal.classList.remove('hidden');
    // Initialize Google Map and DirectionsRenderer here
    // (Assumes Google Maps JS API is loaded and available as google.maps)
    const map = new google.maps.Map(routeMapDiv, {
        zoom: 11,
        center: { lat: 13.1592, lng: -61.2185 } 
    });
    const directionsService = new google.maps.DirectionsService();
    const directionsRenderer = new google.maps.DirectionsRenderer();
    directionsRenderer.setMap(map);

    directionsService.route(
        {
            origin,
            destination,
            travelMode: google.maps.TravelMode.DRIVING
        },
        (result, status) => {
            if (status === "OK") {
                directionsRenderer.setDirections(result);
            } else {
                showToast("Could not display route.", "error");
            }
        }
    );
}

window.closeModal = function(id) {
    document.getElementById(id).classList.add('hidden');
};