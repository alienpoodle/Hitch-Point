import { getFirestore, collection, getDocs, updateDoc, doc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { showToast } from './ui.js';
import { loadGoogleMapsApi } from './maps.js';

let db, auth;

const driverSection = document.getElementById('driver-requests-section');
const requestsTableBody = document.querySelector('#driver-requests-table tbody');
const routeModal = document.getElementById('driver-route-modal');
const routeMapDiv = document.getElementById('driver-route-map');
const rideRequestSection = document.getElementById('ride-request-section');
const rideHistoryMenu = document.getElementById('menu-ride-history');

export function initDriverFeature() {
    db = getFirestore();
    auth = getAuth();

    onAuthStateChanged(auth, async user => {
        if (user) {
            // Check Firestore for role
            const userRef = doc(db, "users", user.uid);
            const userSnap = await getDoc(userRef);
            if (userSnap.exists() && userSnap.data().role === "driver") {
                driverSection.classList.remove('hidden');
                if (rideRequestSection) rideRequestSection.classList.add('hidden');
                if (rideHistoryMenu) rideHistoryMenu.textContent = "Ride Requests";
                await loadRideRequests();
            } else {
                driverSection.classList.add('hidden');
                if (rideRequestSection) rideRequestSection.classList.remove('hidden');
                if (rideHistoryMenu) rideHistoryMenu.textContent = "Ride History";
            }
        }
    });
}

async function loadRideRequests() {
    requestsTableBody.innerHTML = '';
    const querySnapshot = await getDocs(collection(db, "rides"));
    querySnapshot.forEach(docSnap => {
        const data = docSnap.data();
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${data.origin}</td>
            <td>${data.destination}</td>
            <td>${data.riderName || data.riderEmail || data.userId || ''}</td>
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
            await updateDoc(doc(db, "rides", id), { status: newStatus });
            showToast("Status updated!", "success");
        });
    });

    // View route handler
    document.querySelectorAll('.view-route-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const origin = decodeURIComponent(btn.getAttribute('data-origin'));
            const destination = decodeURIComponent(btn.getAttribute('data-destination'));
            await showRouteOnMap(origin, destination);
        });
    });
}

// Show route on map using Google Maps JS API
async function showRouteOnMap(origin, destination) {
    await loadGoogleMapsApi();
    routeModal.classList.remove('hidden');
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