import { db, auth, currentUserId } from './firebase.js';
import { showToast, openModal, hideLoadingOverlay, showLoadingOverlay } from './ui.js';
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getCalculatedQuote } from './fareCalculator.js';

let debounceTimeout;
let pickupPointCounter = 0;

export function setupRideListeners() {
    const requestRideBtn = document.getElementById('request-ride-btn');
    if (requestRideBtn) requestRideBtn.addEventListener('click', submitRideRequest); 

    const printQuoteBtn = document.getElementById('print-quote-btn');
    if (printQuoteBtn) printQuoteBtn.addEventListener('click', printQuote);

    const roundTripInput = document.getElementById('round-trip-input');
    const returnPickupTimeGroup = document.getElementById('return-pickup-time-group');

    const addPickupBtn = document.getElementById('add-pickup-btn');
    if (addPickupBtn) addPickupBtn.addEventListener('click', addPickupPointInput);

    const inputsToMonitor = [
        document.getElementById('origin-input'),
        document.getElementById('destination-input'),
        document.getElementById('bags-input'),
        document.getElementById('persons-input'),
        document.getElementById('round-trip-input'),
        document.getElementById('pickup-time-input'),
        document.getElementById('return-pickup-time-input')
    ];

    inputsToMonitor.forEach(input => {
        if (input) {
            input.addEventListener('input', debounceRealtimeQuote);
            input.addEventListener('change', debounceRealtimeQuote);
        }
    });

    if (roundTripInput && returnPickupTimeGroup) {
        roundTripInput.addEventListener('change', () => {
            returnPickupTimeGroup.style.display = roundTripInput.checked ? '' : 'none';
            debounceRealtimeQuote();
        });
        returnPickupTimeGroup.style.display = roundTripInput.checked ? '' : 'none';
    }

    document.getElementById('ride-request-form')?.addEventListener('input', (event) => {
        if (event.target.classList.contains('pickup-point-dynamic-input') ||
            event.target.id === 'origin-input' ||
            event.target.id === 'destination-input') {
            debounceRealtimeQuote();
        }
    });

    document.getElementById('ride-request-form')?.addEventListener('click', (event) => {
        if (event.target.closest('.remove-pickup-btn')) {
            event.target.closest('.route-point').remove();
            debounceRealtimeQuote();
        }
        if (event.target.closest('.select-map-btn')) {
            const relatedInput = event.target.closest('.input-group').querySelector('input.form-control');
            if (relatedInput) {
                window.activeMapInput = relatedInput;
            }
        }
    });

    debounceRealtimeQuote();
}

function addPickupPointInput() {
    const pickupPointsContainer = document.getElementById('pickup-points-container');
    if (!pickupPointsContainer) return;

    pickupPointCounter++;

    const newPickupPointDiv = document.createElement('div');
    newPickupPointDiv.classList.add('input-group', 'mb-2', 'route-point');
    newPickupPointDiv.dataset.index = `pickup-${pickupPointCounter}`;

    newPickupPointDiv.innerHTML = `
        <span class="input-group-text bg-info text-white">Via</span>
        <input type="text" id="pickup-input-${pickupPointCounter}" class="form-control route-point-input pickup-point-dynamic-input" placeholder="Add pickup point">
        <button class="btn btn-outline-secondary select-map-btn" type="button" title="Pin on Map"
                     data-bs-toggle="modal" data-bs-target="#map-modal">
            <i class="fas fa-map-marker-alt"></i>
        </button>
        <button class="btn btn-outline-danger remove-pickup-btn" type="button" title="Remove Pickup Point">
            <i class="fas fa-times"></i>
        </button>
    `;
    pickupPointsContainer.appendChild(newPickupPointDiv);

    debounceRealtimeQuote();
}

function debounceRealtimeQuote() {
    clearTimeout(debounceTimeout);
    const fareDisplay = document.getElementById('realtime-fare-display');
    const statusMessage = document.getElementById('realtime-status-message');
    const quoteDisplay = document.getElementById('realtime-quote-display');
    if (fareDisplay) fareDisplay.textContent = "Calculating...";
    if (statusMessage) statusMessage.textContent = "Getting route and fare...";
    if (quoteDisplay) quoteDisplay.style.display = 'block';

    debounceTimeout = setTimeout(triggerRealtimeQuoteCalculation, 700);
}

async function triggerRealtimeQuoteCalculation() {
    const origin = document.getElementById('origin-input')?.value;
    const destination = document.getElementById('destination-input')?.value;
    const bags = parseInt(document.getElementById('bags-input')?.value, 10) || 0;
    const persons = parseInt(document.getElementById('persons-input')?.value, 10) || 1;
    const isRoundTrip = document.getElementById('round-trip-input')?.checked || false;
    const rideDateTime = document.getElementById('pickup-time-input')?.value || null;
    const returnDateTime = (isRoundTrip && document.getElementById('return-pickup-time-input')) ? document.getElementById('return-pickup-time-input').value : null;

    const pickupPoints = Array.from(document.querySelectorAll('#pickup-points-container .pickup-point-dynamic-input'))
                                   .map(input => input.value.trim())
                                   .filter(value => value !== '');

    const quoteDisplay = document.getElementById('realtime-quote-display');
    const fareDisplay = document.getElementById('realtime-fare-display');
    const statusMessage = document.getElementById('realtime-status-message');

    if (!origin || !destination || !rideDateTime) {
        if (fareDisplay) fareDisplay.textContent = "N/A";
        if (statusMessage) statusMessage.textContent = "Enter Origin, Destination, & Pickup Time.";
        if (quoteDisplay) quoteDisplay.style.display = 'none';
        return;
    }

    try {
        const quoteDetails = await getCalculatedQuote({
            origin,
            destination,
            bags,
            persons,
            isRoundTrip,
            rideDateTime,
            returnDateTime,
            pickupPoints
        });
        updateRealtimeQuoteDisplay(quoteDetails);
    } catch (error) {
        console.error("Error in real-time quote calculation:", error);
        if (fareDisplay) fareDisplay.textContent = "Error";
        if (statusMessage) statusMessage.textContent = "Could not calculate fare. Try again.";
        if (quoteDisplay) quoteDisplay.style.display = 'block';
        showToast("Error getting real-time quote.", "danger");
    }
}

function updateRealtimeQuoteDisplay(quoteDetails) {
    const quoteDisplay = document.getElementById('realtime-quote-display');
    const distanceDisplay = document.getElementById('realtime-distance-display');
    const durationDisplay = document.getElementById('realtime-duration-display');
    const personsDisplay = document.getElementById('realtime-persons-display');
    const bagsDisplay = document.getElementById('realtime-bags-display');
    const roundtripDisplay = document.getElementById('realtime-roundtrip-display');
    const afterhoursDisplay = document.getElementById('realtime-afterhours-display');
    const fareDisplay = document.getElementById('realtime-fare-display');
    const statusMessage = document.getElementById('realtime-status-message');
    const realtimePickupPointsList = document.getElementById('realtime-pickup-points-list');
    const realtimePickupPointsGroup = realtimePickupPointsList?.closest('.pickup-points-display-group');


    if (quoteDisplay) quoteDisplay.style.display = 'block';

    if (distanceDisplay) distanceDisplay.textContent = quoteDetails.distance;
    if (durationDisplay) durationDisplay.textContent = quoteDetails.duration;
    if (personsDisplay) personsDisplay.textContent = quoteDetails.persons > 0 ? `${quoteDetails.persons} person(s)` : "1 person";
    if (bagsDisplay) bagsDisplay.textContent = quoteDetails.bags > 0 ? `${quoteDetails.bags} bag(s)` : "No bags";
    if (roundtripDisplay) roundtripDisplay.textContent = quoteDetails.isRoundTrip ? "Yes" : "No"; 
    if (afterhoursDisplay) afterhoursDisplay.textContent = quoteDetails.afterHours ? "Yes" : "No";
    if (fareDisplay) fareDisplay.textContent = `${quoteDetails.fareXCD} XCD / $${quoteDetails.fareUSD} USD`;
    if (statusMessage) statusMessage.textContent = "Quote updated.";

    if (realtimePickupPointsList) {
        realtimePickupPointsList.innerHTML = '';
        if (quoteDetails.pickupPoints && quoteDetails.pickupPoints.length > 0) {
            for (const point of quoteDetails.pickupPoints) {
                const listItem = document.createElement('li');
                listItem.textContent = point;
                realtimePickupPointsList.appendChild(listItem);
            }
            if (realtimePickupPointsGroup) {
                realtimePickupPointsGroup.style.display = 'block';
            }
        } else {
            if (realtimePickupPointsGroup) {
                realtimePickupPointsGroup.style.display = 'none';
            }
        }
    }
}

/**
 * Handles the final submission of the ride request, opening the modal and saving to Firestore.
 */
export async function submitRideRequest() {
    const origin = document.getElementById('origin-input')?.value;
    const destination = document.getElementById('destination-input')?.value;
    const bags = parseInt(document.getElementById('bags-input')?.value, 10) || 0;
    const persons = parseInt(document.getElementById('persons-input')?.value, 10) || 1;
    const isRoundTrip = document.getElementById('round-trip-input')?.checked || false;
    const rideDateTime = document.getElementById('pickup-time-input')?.value || null;
    const returnDateTime = (isRoundTrip && document.getElementById('return-pickup-time-input')) ? document.getElementById('return-pickup-time-input').value : null;

    const pickupPoints = Array.from(document.querySelectorAll('#pickup-points-container .pickup-point-dynamic-input'))
                                   .map(input => input.value.trim())
                                   .filter(value => value !== '');

    if (!origin || !destination || !rideDateTime) {
        showToast("Please enter Origin, Destination, and Pickup Time before requesting a ride.", "warning");
        return;
    }

    showLoadingOverlay();

    try {
        const quoteDetails = await getCalculatedQuote({
            origin,
            destination,
            bags,
            persons,
            isRoundTrip,
            rideDateTime,
            returnDateTime,
            pickupPoints
        });

        // Update the modal content with the final calculated quote
        const quoteDistance = document.getElementById('quote-distance');
        const quoteDuration = document.getElementById('quote-duration');
        const quoteOrigin = document.getElementById('quote-origin');
        const quoteDestination = document.getElementById('quote-destination');
        const quoteBags = document.getElementById('quote-bags');
        const quotePersons = document.getElementById('quote-persons');
        const quoteRoundTrip = document.getElementById('quote-roundtrip');
        const quoteFare = document.getElementById('quote-fare');
        const quotePickupTime = document.getElementById('quote-pickup-time');
        const quoteReturnPickupTime = document.getElementById('quote-return-pickup-time');
        const quoteAfterHours = document.getElementById('quote-afterHours');
        const modalPickupPointsList = document.getElementById('quote-pickup-points-list');

        if (quoteDistance) quoteDistance.textContent = quoteDetails.distance;
        if (quoteDuration) quoteDuration.textContent = quoteDetails.duration;
        if (quoteOrigin) quoteOrigin.textContent = quoteDetails.origin;
        if (quoteDestination) quoteDestination.textContent = quoteDetails.destination;
        if (quoteBags) quoteBags.textContent = quoteDetails.bags > 0 ? `${quoteDetails.bags} bag(s)` : "No bags";
        if (quotePersons) quotePersons.textContent = quoteDetails.persons > 0 ? `${quoteDetails.persons} person(s)` : "1 person";
        if (quoteRoundTrip) quoteRoundTrip.textContent = quoteDetails.isRoundTrip ? "Yes" : "No"; // Changed to isRoundTrip here too for consistency
        if (quotePickupTime) quotePickupTime.textContent = quoteDetails.rideDateTime ? new Date(quoteDetails.rideDateTime).toLocaleString() : "Not set";
        if (quoteReturnPickupTime) quoteReturnPickupTime.textContent = (quoteDetails.isRoundTrip && quoteDetails.returnDateTime) ? new Date(quoteDetails.returnDateTime).toLocaleString() : "N/A"; // Changed to isRoundTrip here too for consistency
        if (quoteAfterHours) quoteAfterHours.textContent = quoteDetails.afterHours ? "Yes" : "No";
        if (quoteFare) quoteFare.textContent = `${quoteDetails.fareXCD} XCD / $${quoteDetails.fareUSD} USD`;

        const pickupPointsGroup = modalPickupPointsList?.closest('.pickup-points-display-group');

        if (modalPickupPointsList) {
            modalPickupPointsList.innerHTML = '';
            if (quoteDetails.pickupPoints && quoteDetails.pickupPoints.length > 0) {
                for (const point of quoteDetails.pickupPoints) {
                    const listItem = document.createElement('li');
                    listItem.textContent = point;
                    modalPickupPointsList.appendChild(listItem);
                }
                if (pickupPointsGroup) {
                    pickupPointsGroup.style.display = 'block';
                }
            } else {
                if (pickupPointsGroup) {
                    pickupPointsGroup.style.display = 'none';
                }
            }
        }

        // Open the modal before saving to Firestore, so the user sees the quote
        openModal('quote-display-modal');

        // --- IMPORTANT CHANGE HERE: Save to Firestore with 'pending' status ---
        if (db && currentUserId) {
            try {
                const currentUser = auth.currentUser; // Get the current user for name/email
                const userName = currentUser ? (currentUser.displayName || currentUser.email || 'Passenger') : 'Unknown Passenger';
                const userEmail = currentUser ? currentUser.email : 'unknown@example.com';

                await addDoc(collection(db, "rides"), {
                    userId: currentUserId,
                    userName: userName,
                    userEmail: userEmail,
                    origin: quoteDetails.origin,
                    destination: quoteDetails.destination,
                    distance: quoteDetails.distance,
                    duration: quoteDetails.duration,
                    fareXCD: quoteDetails.fareXCD,
                    fareUSD: quoteDetails.fareUSD,
                    bags: quoteDetails.bags,
                    persons: quoteDetails.persons,
                    afterHours: quoteDetails.afterHours,
                    isRoundTrip: quoteDetails.isRoundTrip,
                    rideDateTime: quoteDetails.rideDateTime,
                    returnDateTime: quoteDetails.returnDateTime,
                    pickupPoints: quoteDetails.pickupPoints || [],
                    status: 'pending',
                    requestedAt: serverTimestamp(), // Use requestedAt for the initial timestamp
                    driverId: null, // Ensure these are null for unassigned rides
                    driverName: null,
                    assignedAt: null
                });
                showToast("Ride requested successfully! Drivers are being notified.", "success");
                resetRideForm(); // Reset form after successful submission
            } catch (err) {
                console.error("Failed to save ride request to Firestore:", err);
                showToast("Failed to finalize ride request. Please try again.", "danger");
            }
        } else {
            showToast("Please log in to finalize your ride request.", "warning");
        }

    } catch (error) {
        console.error("Error processing ride request:", error);
        showToast("Error getting quote. Please check your inputs.", "danger");
    } finally {
        hideLoadingOverlay();
    }
}

export function resetRideForm() {
    const originInput = document.getElementById('origin-input');
    const destinationInput = document.getElementById('destination-input');
    const bagsInput = document.getElementById('bags-input');
    const personsInput = document.getElementById('persons-input');
    const roundTripInput = document.getElementById('round-trip-input');
    const pickupTimeInput = document.getElementById('pickup-time-input');
    const returnPickupTimeInput = document.getElementById('return-pickup-time-input');

    if (pickupTimeInput) pickupTimeInput.value = '';
    if (returnPickupTimeInput) returnPickupTimeInput.value = '';
    if (originInput) originInput.value = '';
    if (destinationInput) destinationInput.value = '';
    if (bagsInput) bagsInput.value = '0';
    if (personsInput) personsInput.value = '1';
    if (roundTripInput) {
        roundTripInput.checked = false;
        const returnPickupTimeGroup = document.getElementById('return-pickup-time-group');
        if (returnPickupTimeGroup) {
            returnPickupTimeGroup.style.display = 'none';
        }
    }
    const quoteDisplay = document.getElementById('realtime-quote-display');
    if (quoteDisplay) {
        quoteDisplay.style.display = 'none';
        document.getElementById('realtime-fare-display').textContent = "Calculating...";
        document.getElementById('realtime-status-message').textContent = "Enter details to get quote.";
    }

    const pickupPointsContainer = document.getElementById('pickup-points-container');
    if (pickupPointsContainer) {
        pickupPointsContainer.innerHTML = '';
    }
    pickupPointCounter = 0;

    const modalPickupPointsList = document.getElementById('quote-pickup-points-list');
    if (modalPickupPointsList) {
        modalPickupPointsList.innerHTML = '';
        const pickupPointsGroup = modalPickupPointsList.closest('.pickup-points-display-group');
        if (pickupPointsGroup) {
            pickupPointsGroup.style.display = 'none';
        }
    }
}

export function printQuote() {
    const modal = document.getElementById('quote-display-modal');
    if (!modal) return;
    const printContentsElement = modal.querySelector('.modal-quote-content');
    if (!printContentsElement) {
        showToast("Quote content not found for printing.", "warning");
        return;
    }
    const printContents = printContentsElement.innerHTML;

    const win = window.open('', '', 'height=600,width=400');
    win.document.write(`
        <html>
        <head>
            <title>HitchPoint - Ride Quote</title>
            <style>
                body { color: black; font-family: sans-serif; padding: 20px; }
                h1 { text-align: center; color: #333; }
                p, li { margin-bottom: 5px; }
                .fw-semibold { font-weight: 600; }
                .fs-4 { font-size: 1.5rem; }
                .fw-bold { font-weight: 700; }
                .text-primary { color: #0d6efd; }
                .list-unstyled { padding-left: 0; list-style: none; }
                .pickup-points-display-group { margin-top: 15px; border-top: 1px solid #eee; padding-top: 10px;}
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
