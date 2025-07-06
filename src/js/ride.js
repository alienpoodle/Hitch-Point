import { BASE_FARE_XCD, DEFAULT_PER_KM_RATE_XCD, AFTER_HOURS_SURCHARGE_PERCENTAGE, XCD_TO_USD_EXCHANGE_RATE, COST_PER_ADDITIONAL_BAG_XCD, COST_PER_ADDITIONAL_PERSON_XCD, FREE_PERSON_COUNT } from './constants.js';
import { db, currentUserId } from './firebase.js'; // Ensure currentUserId is correctly populated from firebase.js
import { showToast, openModal, hideLoadingOverlay, showLoadingOverlay } from './ui.js';
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
// import { loadGoogleMapsScript } from './maps.js'; // REMOVED: Managed by main.js and maps.js globally

let debounceTimeout; // For debouncing the real-time calculation

export function setupRideListeners() {
    const requestRideBtn = document.getElementById('request-ride-btn');
    if (requestRideBtn) requestRideBtn.addEventListener('click', submitRideRequest);

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
    // Add a slight delay to ensure Maps API might be ready from app.js init
    setTimeout(debounceRealtimeQuote, 500);
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

    debounceTimeout = setTimeout(triggerRealtimeQuoteCalculation, 700);
}

/**
 * Gathers form inputs and triggers the quote calculation for real-time display.
 */
async function triggerRealtimeQuoteCalculation() {
    const origin = document.getElementById('origin-input')?.value.trim(); // Trim whitespace
    const destination = document.getElementById('destination-input')?.value.trim(); // Trim whitespace
    const bags = parseInt(document.getElementById('bags-input')?.value, 10) || 0;
    const persons = parseInt(document.getElementById('persons-input')?.value, 10) || 1;
    const isRoundTrip = document.getElementById('round-trip-input')?.checked || false;
    const rideDateTime = document.getElementById('pickup-time-input')?.value || null;
    const returnDateTime = (isRoundTrip && document.getElementById('return-pickup-time-input')) ? document.getElementById('return-pickup-time-input').value : null;

    const quoteDisplay = document.getElementById('realtime-quote-display');
    const fareDisplay = document.getElementById('realtime-fare-display');
    const statusMessage = document.getElementById('realtime-status-message');

    // Make sure Google Maps API is ready before proceeding with calculation
    if (!window.google || !window.google.maps || !window.google.maps.DirectionsService) {
        if (fareDisplay) fareDisplay.textContent = "N/A";
        if (statusMessage) statusMessage.textContent = "Maps not ready. Try again in a moment.";
        if (quoteDisplay) quoteDisplay.style.display = 'block'; // Keep visible to show error
        console.warn("Google Maps API (DirectionsService) not ready for real-time quote calculation.");
        return;
    }

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
        if (statusMessage) statusMessage.textContent = "Could not calculate fare. Try again. (" + error.message + ")";
        if (quoteDisplay) quoteDisplay.style.display = 'block'; // Keep it visible to show error
        showToast("Error getting real-time quote: " + error.message, "danger");
    }
}

/**
 * Performs the core fare calculation and route lookup.
 * Returns a promise that resolves with the calculated quote details.
 * Does NOT interact with the DOM for display or with Firestore.
 */
async function getCalculatedQuote({ origin, destination, bags, persons, isRoundTrip, rideDateTime, returnDateTime }) {
    // Rely on app.js and maps.js to load the script globally.
    // Ensure google.maps and DirectionsService are available.
    if (!window.google || !window.google.maps || !window.google.maps.DirectionsService) {
        throw new Error("Google Maps DirectionsService not available.");
    }

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
                    // Ensure rideDateTime is a valid string/Date object for parsing
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
    const origin = document.getElementById('origin-input')?.value.trim();
    const destination = document.getElementById('destination-input')?.value.trim();
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
        document.getElementById('quote-distance').textContent = quoteDetails.distance;
        document.getElementById('quote-duration').textContent = quoteDetails.duration;
        document.getElementById('quote-origin').textContent = quoteDetails.origin;
        document.getElementById('quote-destination').textContent = quoteDetails.destination;
        document.getElementById('quote-bags').textContent = quoteDetails.bags > 0 ? `${quoteDetails.bags} bag(s)` : "No bags";
        document.getElementById('quote-persons').textContent = quoteDetails.persons > 0 ? `${quoteDetails.persons} person(s)` : "1 person";
        document.getElementById('quote-roundtrip').textContent = quoteDetails.roundTrip ? "Yes" : "No";
        document.getElementById('quote-pickup-time').textContent = quoteDetails.rideDateTime ? new Date(quoteDetails.rideDateTime).toLocaleString() : "Not set";
        document.getElementById('quote-return-pickup-time').textContent = (quoteDetails.roundTrip && quoteDetails.returnDateTime) ? new Date(quoteDetails.returnDateTime).toLocaleString() : "N/A";
        document.getElementById('quote-afterHours').textContent = quoteDetails.afterHours ? "Yes" : "No";
        document.getElementById('quote-fare').textContent = `${quoteDetails.fareXCD} XCD / $${quoteDetails.fareUSD} USD`;

        openModal('quote-display-modal'); // Open the modal after updating its content

        // Proceed to save to Firestore ONLY AFTER the modal is shown to the user
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
                resetRideForm(); // Reset form AFTER successful save
            } catch (err) {
                console.error("Failed to save ride request to Firestore:", err);
                showToast("Failed to save ride request. Please try again.", "danger");
            }
        } else {
            showToast("Please log in to save your ride request to history.", "warning");
        }

    } catch (error) {
        console.error("Error processing ride request for submission:", error);
        showToast("Error processing ride request: " + error.message, "danger");
    } finally {
        hideLoadingOverlay(); // Ensure overlay is hidden in all cases
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
    // Attempt to create a Date object. If parsing fails, Date will be "Invalid Date"
    const dt = new Date(dtString);
    if (isNaN(dt.getTime())) { // Check if date is valid
        console.warn("Invalid date string for after-hours check:", dtString);
        return false;
    }
    const hour = dt.getHours();
    // Use logical OR for clear conditions: (before 6 AM) OR (at or after 8 PM)
    return hour < 6 || hour >= 20;
}

export function resetRideForm() {
    document.getElementById('origin-input').value = '';
    document.getElementById('destination-input').value = '';
    document.getElementById('bags-input').value = '0';
    document.getElementById('persons-input').value = '1';
    document.getElementById('round-trip-input').checked = false;
    document.getElementById('pickup-time-input').value = '';
    document.getElementById('return-pickup-time-input').value = '';

    const returnPickupTimeGroup = document.getElementById('return-pickup-time-group');
    if (returnPickupTimeGroup) {
        returnPickupTimeGroup.style.display = 'none';
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
    if (!modal) {
        showToast("Quote display modal not found for printing.", "warning");
        return;
    }
    const printContentsElement = modal.querySelector('.modal-quote-content');
    if (!printContentsElement) {
        showToast("Quote content not found for printing.", "warning");
        return;
    }
    const printContents = printContentsElement.innerHTML;

    const win = window.open('', '_blank', 'height=600,width=800'); // Increased width
    win.document.write(`
        <html>
        <head>
            <title>HitchPoint - Ride Quote</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; color: #333; line-height: 1.6; }
                h1 { color: #5E9BCD; margin-bottom: 20px; text-align: center; }
                .quote-detail { margin: 10px 0; font-size: 15px; }
                .quote-detail strong { display: inline-block; width: 150px; font-weight: bold; }
                .fare { font-size: 28px; font-weight: bold; color: #007bff; margin-top: 30px; text-align: center; } /* Changed color for better print */
                p { margin-bottom: 5px; }
                @media print {
                    .no-print { display: none; }
                    body { -webkit-print-color-adjust: exact; } /* For backgrounds/colors */
                }
            </style>
        </head>
        <body>
            <h1>HitchPoint Ride Quote</h1>
            ${printContents}
            <p style="margin-top: 40px; font-size: 13px; color: #666; text-align: center;">
                Generated on ${new Date().toLocaleString()} (All prices are estimates and may vary.)
            </p>
        </body>
        </html>
    `);
    win.document.close();
    win.print();
    win.close(); // close the print window after printing
}