import { BASE_FARE_XCD, DEFAULT_PER_KM_RATE_XCD, AFTER_HOURS_SURCHARGE_PERCENTAGE, XCD_TO_USD_EXCHANGE_RATE, COST_PER_ADDITIONAL_BAG_XCD, COST_PER_ADDITIONAL_PERSON_XCD, FREE_PERSON_COUNT } from './constants.js';
import { db, currentUserId } from './firebase.js'; // Ensure currentUserId is correctly populated from firebase.js
import { showToast, openModal, hideLoadingOverlay, showLoadingOverlay } from './ui.js';
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { loadGoogleMapsScript } from './maps.js';

let debounceTimeout; // For debouncing the real-time calculation

export function setupRideListeners() {
    const requestRideBtn = document.getElementById('request-ride-btn');
    if (requestRideBtn) requestRideBtn.addEventListener('click', submitRideRequest); // Renamed function for clarity

    const printQuoteBtn = document.getElementById('print-quote-btn');
    if (printQuoteBtn) printQuoteBtn.addEventListener('click', printQuote);

    const roundTripInput = document.getElementById('round-trip-input');
    const returnPickupTimeGroup = document.getElementById('return-pickup-time-group');

    // Attach event listeners for real-time quote calculation
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
            input.addEventListener('change', debounceRealtimeQuote); // For checkboxes/date inputs
        }
    });

    if (roundTripInput && returnPickupTimeGroup) {
        roundTripInput.addEventListener('change', () => {
            returnPickupTimeGroup.style.display = roundTripInput.checked ? '' : 'none';
            debounceRealtimeQuote(); // Trigger calc immediately on round trip change
        });
        // Set initial state on page load
        returnPickupTimeGroup.style.display = roundTripInput.checked ? '' : 'none';
    }

    // Initial calculation on page load (if form fields are pre-filled)
    debounceRealtimeQuote();
}

/**
 * Debounces the call to triggerRealtimeQuoteCalculation.
 * Prevents excessive API calls on rapid input.
 */
function debounceRealtimeQuote() {
    clearTimeout(debounceTimeout);
    // Display "Calculating..." or "Loading..." while waiting
    const fareDisplay = document.getElementById('realtime-fare-display');
    const statusMessage = document.getElementById('realtime-status-message');
    const quoteDisplay = document.getElementById('realtime-quote-display');
    if (fareDisplay) fareDisplay.textContent = "Calculating...";
    if (statusMessage) statusMessage.textContent = "Getting route and fare...";
    if (quoteDisplay) quoteDisplay.style.display = 'block'; // Ensure it's visible

    debounceTimeout = setTimeout(triggerRealtimeQuoteCalculation, 700); // Adjust debounce time as needed (e.g., 500-1000ms)
}

/**
 * Gathers form inputs and triggers the quote calculation for real-time display.
 */
async function triggerRealtimeQuoteCalculation() {
    const origin = document.getElementById('origin-input')?.value;
    const destination = document.getElementById('destination-input')?.value;
    const bags = parseInt(document.getElementById('bags-input')?.value, 10) || 0;
    const persons = parseInt(document.getElementById('persons-input')?.value, 10) || 1;
    const isRoundTrip = document.getElementById('round-trip-input')?.checked || false;
    const rideDateTime = document.getElementById('pickup-time-input')?.value || null;
    const returnDateTime = (isRoundTrip && document.getElementById('return-pickup-time-input')) ? document.getElementById('return-pickup-time-input').value : null;

    const quoteDisplay = document.getElementById('realtime-quote-display');
    const fareDisplay = document.getElementById('realtime-fare-display');
    const statusMessage = document.getElementById('realtime-status-message');

    if (!origin || !destination || !rideDateTime) {
        if (fareDisplay) fareDisplay.textContent = "N/A";
        if (statusMessage) statusMessage.textContent = "Enter Origin, Destination, & Pickup Time.";
        if (quoteDisplay) quoteDisplay.style.display = 'none'; // Hide if not enough info
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
            returnDateTime
        });
        updateRealtimeQuoteDisplay(quoteDetails);
    } catch (error) {
        console.error("Error in real-time quote calculation:", error);
        if (fareDisplay) fareDisplay.textContent = "Error";
        if (statusMessage) statusMessage.textContent = "Could not calculate fare. Try again.";
        if (quoteDisplay) quoteDisplay.style.display = 'block'; // Keep it visible to show error
        showToast("Error getting real-time quote.", "danger"); // Small toast, not too intrusive
    }
}

/**
 * Performs the core fare calculation and route lookup.
 * Returns a promise that resolves with the calculated quote details.
 * Does NOT interact with the DOM for display or with Firestore.
 */
async function getCalculatedQuote({ origin, destination, bags, persons, isRoundTrip, rideDateTime, returnDateTime }) {
    await loadGoogleMapsScript(); // Ensure Maps API is loaded

    return new Promise((resolve, reject) => {
        const directionsService = new google.maps.DirectionsService();
        directionsService.route(
            {
                origin,
                destination,
                travelMode: google.maps.TravelMode.DRIVING
            },
            (result, status) => {
                if (status === "OK" && result.routes.length > 0) {
                    const leg = result.routes[0].legs[0];

                    // Determine after hours based on rideDateTime or returnDateTime for round trips
                    const afterHours = isAfterHours(rideDateTime) || (isRoundTrip && isAfterHours(returnDateTime));

                    // --- Fare Calculation ---
                    const distanceKm = leg.distance.value / 1000;
                    let fareXCD = BASE_FARE_XCD + (distanceKm * DEFAULT_PER_KM_RATE_XCD);

                    if (bags > 0) {
                        fareXCD += bags * COST_PER_ADDITIONAL_BAG_XCD;
                    }

                    if (persons > FREE_PERSON_COUNT) {
                        fareXCD += (persons - FREE_PERSON_COUNT) * COST_PER_ADDITIONAL_PERSON_XCD;
                    }

                    if (afterHours) {
                        fareXCD += fareXCD * AFTER_HOURS_SURCHARGE_PERCENTAGE;
                    }

                    if (isRoundTrip) {
                        fareXCD *= 2;
                    }

                    const fareUSD = fareXCD * XCD_TO_USD_EXCHANGE_RATE;

                    resolve({
                        origin,
                        destination,
                        distance: leg.distance.text,
                        duration: leg.duration.text,
                        fareXCD: fareXCD.toFixed(2),
                        fareUSD: fareUSD.toFixed(2),
                        bags,
                        persons,
                        afterHours,
                        roundTrip: isRoundTrip,
                        rideDateTime,
                        returnDateTime,
                        status: 'quoted' // Initial status for a new quote
                    });

                } else {
                    reject(new Error(`Google Maps Directions API Error: ${status}`));
                }
            }
        );
    });
}

/**
 * Updates the dedicated HTML elements for real-time quote display.
 */
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

    if (quoteDisplay) quoteDisplay.style.display = 'block'; // Ensure it's visible

    if (distanceDisplay) distanceDisplay.textContent = quoteDetails.distance;
    if (durationDisplay) durationDisplay.textContent = quoteDetails.duration;
    if (personsDisplay) personsDisplay.textContent = quoteDetails.persons > 0 ? `${quoteDetails.persons} person(s)` : "1 person";
    if (bagsDisplay) bagsDisplay.textContent = quoteDetails.bags > 0 ? `${quoteDetails.bags} bag(s)` : "No bags";
    if (roundtripDisplay) roundtripDisplay.textContent = quoteDetails.roundTrip ? "Yes" : "No";
    if (afterhoursDisplay) afterhoursDisplay.textContent = quoteDetails.afterHours ? "Yes" : "No";
    if (fareDisplay) fareDisplay.textContent = `${quoteDetails.fareXCD} XCD / $${quoteDetails.fareUSD} USD`;
    if (statusMessage) statusMessage.textContent = "Quote updated.";
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

    if (!origin || !destination || !rideDateTime) {
        showToast("Please enter Origin, Destination, and Pickup Time before requesting a ride.", "warning");
        return;
    }

    showLoadingOverlay(); // Show loading overlay for the final submission

    try {
        const quoteDetails = await getCalculatedQuote({
            origin,
            destination,
            bags,
            persons,
            isRoundTrip,
            rideDateTime,
            returnDateTime
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

        if (quoteDistance) quoteDistance.textContent = quoteDetails.distance;
        if (quoteDuration) quoteDuration.textContent = quoteDetails.duration;
        if (quoteOrigin) quoteOrigin.textContent = quoteDetails.origin;
        if (quoteDestination) quoteDestination.textContent = quoteDetails.destination;
        if (quoteBags) quoteBags.textContent = quoteDetails.bags > 0 ? `${quoteDetails.bags} bag(s)` : "No bags";
        if (quotePersons) quotePersons.textContent = quoteDetails.persons > 0 ? `${quoteDetails.persons} person(s)` : "1 person";
        if (quoteRoundTrip) quoteRoundTrip.textContent = quoteDetails.roundTrip ? "Yes" : "No";
        if (quotePickupTime) quotePickupTime.textContent = quoteDetails.rideDateTime ? new Date(quoteDetails.rideDateTime).toLocaleString() : "Not set";
        if (quoteReturnPickupTime) quoteReturnPickupTime.textContent = (quoteDetails.roundTrip && quoteDetails.returnDateTime) ? new Date(quoteDetails.returnDateTime).toLocaleString() : "N/A";
        if (quoteAfterHours) quoteAfterHours.textContent = quoteDetails.afterHours ? "Yes" : "No";
        if (quoteFare) quoteFare.textContent = `${quoteDetails.fareXCD} XCD / $${quoteDetails.fareUSD} USD`;

        openModal('quote-display-modal'); // Open the modal after updating its content

        if (db && currentUserId) {
            try {
                await addDoc(collection(db, "rides"), {
                    userId: currentUserId,
                    origin: quoteDetails.origin,
                    destination: quoteDetails.destination,
                    distance: quoteDetails.distance,
                    duration: quoteDetails.duration,
                    fareXCD: quoteDetails.fareXCD,
                    fareUSD: quoteDetails.fareUSD,
                    bags: quoteDetails.bags,
                    persons: quoteDetails.persons,
                    afterHours: quoteDetails.afterHours,
                    roundTrip: quoteDetails.roundTrip,
                    rideDateTime: quoteDetails.rideDateTime,
                    returnDateTime: quoteDetails.returnDateTime,
                    status: 'quoted',
                    timestamp: serverTimestamp()
                });
                showToast("Ride quote saved to history!", "success");
                resetRideForm();
            } catch (err) {
                console.error("Failed to save ride request:", err);
                showToast("Failed to save ride request. Please try again.", "danger");
            }
        } else {
            showToast("Please log in to save your ride request.", "warning");
        }

    } catch (error) {
        hideLoadingOverlay();
        console.error("Error processing ride request:", error);
        showToast("Error processing ride request. Please try again.", "danger");
    } finally {
        hideLoadingOverlay(); // Ensure overlay is hidden even if there's an error before Firestore save
    }
}


/**
 * Checks if a given time falls into after-hours.
 * After hours: before 6 AM or at/after 8 PM (20:00).
 * @param {string} dtString - ISO 8601 formatted date-time string.
 * @returns {boolean}
 */
function isAfterHours(dtString) {
    if (!dtString) return false;
    const dt = new Date(dtString);
    const hour = dt.getHours();
    return hour < 6 || hour >= 20;
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
    // Clear and hide real-time quote display on form reset
    const quoteDisplay = document.getElementById('realtime-quote-display');
    if (quoteDisplay) {
        quoteDisplay.style.display = 'none';
        document.getElementById('realtime-fare-display').textContent = "Calculating...";
        document.getElementById('realtime-status-message').textContent = "Enter details to get quote.";
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
                body { font-family: Arial, sans-serif; padding: 20px; color: #333; }
                h1 { color: #5E9BCD; margin-bottom: 20px; }
                .quote-detail { margin: 10px 0; font-size: 14px; }
                .quote-detail strong { display: inline-block; width: 120px; }
                .fare { font-size: 24px; font-weight: bold; color: #FFD700; margin-top: 20px; }
                p { margin-bottom: 5px; }
                @media print {
                    .no-print { display: none; }
                }
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