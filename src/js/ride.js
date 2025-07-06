// rides.js
import { BASE_FARE_XCD, DEFAULT_PER_KM_RATE_XCD, AFTER_HOURS_SURCHARGE_PERCENTAGE, XCD_TO_USD_EXCHANGE_RATE, COST_PER_ADDITIONAL_BAG_XCD, COST_PER_ADDITIONAL_PERSON_XCD, FREE_PERSON_COUNT } from './constants.js';
import { db, currentUserId } from './firebase.js'; // Ensure currentUserId is correctly populated from firebase.js
import { showToast, openModal, hideLoadingOverlay, showLoadingOverlay } from './ui.js';
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { loadGoogleMapsApi } from './maps.js';

export function setupRideListeners() {
    const requestRideBtn = document.getElementById('request-ride-btn');
    if (requestRideBtn) requestRideBtn.addEventListener('click', calculateRoute);

    const printQuoteBtn = document.getElementById('print-quote-btn');
    if (printQuoteBtn) printQuoteBtn.addEventListener('click', printQuote);

    // Show/hide return pickup time field
    const roundTripInput = document.getElementById('round-trip-input');
    const returnPickupTimeGroup = document.getElementById('return-pickup-time-group');
    if (roundTripInput && returnPickupTimeGroup) {
        roundTripInput.addEventListener('change', () => {
            returnPickupTimeGroup.style.display = roundTripInput.checked ? '' : 'none';
        });
        // Set initial state on page load
        returnPickupTimeGroup.style.display = roundTripInput.checked ? '' : 'none';
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

export async function calculateRoute() {
    const originInput = document.getElementById('origin-input');
    const destinationInput = document.getElementById('destination-input');
    const bagsInput = document.getElementById('bags-input');
    const personsInput = document.getElementById('persons-input');
    const roundTripInput = document.getElementById('round-trip-input');
    const pickupTimeInput = document.getElementById('pickup-time-input');
    const returnPickupTimeInput = document.getElementById('return-pickup-time-input');

    if (!originInput || !destinationInput || !pickupTimeInput) {
        // Added pickupTimeInput check here for mandatory time
        showToast("Please ensure all required fields (Origin, Destination, Pickup Time) are filled.", "warning");
        return;
    }

    const origin = originInput.value;
    const destination = destinationInput.value;
    const bags = parseInt(bagsInput?.value, 10) || 0;
    const persons = parseInt(personsInput?.value, 10) || 1;
    const isRoundTrip = roundTripInput?.checked || false;

    // Use rideDateTime for the primary pickup time for consistency with main.js
    const rideDateTime = pickupTimeInput.value; 
    // Use returnDateTime for the return leg pickup time for consistency
    const returnDateTime = (isRoundTrip && returnPickupTimeInput) ? returnPickupTimeInput.value : null;

    if (!origin || !destination || !rideDateTime) { // Re-check after getting values
        showToast("Please enter both origin, destination, and pickup time.", "warning");
        return;
    }

    // Input validation for date/time format if needed
    // Example: if (isNaN(new Date(rideDateTime).getTime())) { showToast("Invalid pickup time", "danger"); return; }
    // Same for returnDateTime

    await loadGoogleMapsApi();
    showLoadingOverlay();

    try {
        const directionsService = new google.maps.DirectionsService();
        directionsService.route(
            {
                origin,
                destination,
                travelMode: google.maps.TravelMode.DRIVING
            },
            async (result, status) => {
                hideLoadingOverlay();
                if (status === "OK" && result.routes.length > 0) {
                    const leg = result.routes[0].legs[0];
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

                    // Determine after hours based on rideDateTime or returnDateTime for round trips
                    const afterHours = isAfterHours(rideDateTime) || (isRoundTrip && isAfterHours(returnDateTime));

                    // --- Fare Calculation ---
                    const distanceKm = leg.distance.value / 1000;
                    let fareXCD = BASE_FARE_XCD + (distanceKm * DEFAULT_PER_KM_RATE_XCD);

                    // Additional Bags
                    if (bags > 0) {
                        fareXCD += bags * COST_PER_ADDITIONAL_BAG_XCD;
                    }

                    // Additional Persons (above FREE_PERSON_COUNT)
                    if (persons > FREE_PERSON_COUNT) {
                        fareXCD += (persons - FREE_PERSON_COUNT) * COST_PER_ADDITIONAL_PERSON_XCD;
                    }

                    // After Hours Surcharge
                    if (afterHours) {
                        fareXCD += fareXCD * AFTER_HOURS_SURCHARGE_PERCENTAGE;
                    }

                    // Round Trip (doubles the entire calculated fare up to this point)
                    if (isRoundTrip) {
                        fareXCD *= 2;
                    }
                    
                    const fareUSD = fareXCD * XCD_TO_USD_EXCHANGE_RATE;

                    // --- Update Quote Display ---
                    if (quoteDistance) quoteDistance.textContent = leg.distance.text;
                    if (quoteDuration) quoteDuration.textContent = leg.duration.text;
                    if (quoteOrigin) quoteOrigin.textContent = origin;
                    if (quoteDestination) quoteDestination.textContent = destination;
                    if (quoteBags) quoteBags.textContent = bags > 0 ? `${bags} bag(s)` : "No bags";
                    // Only show persons if > FREE_PERSON_COUNT or if persons > 0
                    if (quotePersons) quotePersons.textContent = persons > 0 ? `${persons} person(s)` : "1 person";
                    if (quoteRoundTrip) quoteRoundTrip.textContent = isRoundTrip ? "Yes" : "No";
                    if (quotePickupTime) quotePickupTime.textContent = rideDateTime ? new Date(rideDateTime).toLocaleString() : "Not set";
                    if (quoteReturnPickupTime) quoteReturnPickupTime.textContent = (isRoundTrip && returnDateTime) ? new Date(returnDateTime).toLocaleString() : "N/A";
                    if (quoteAfterHours) quoteAfterHours.textContent = afterHours ? "Yes" : "No";
                    
                    // Display fares with two decimal places for currency consistency
                    if (quoteFare) quoteFare.textContent = `${fareXCD.toFixed(2)} XCD / $${fareUSD.toFixed(2)} USD`;
                    
                    openModal('quote-display-modal');

                    // --- Save to Firestore ---
                    if (db && currentUserId) {
                        try {
                            await addDoc(collection(db, "rides"), {
                                userId: currentUserId,
                                origin,
                                destination,
                                distance: leg.distance.text,
                                duration: leg.duration.text,
                                fareXCD: fareXCD.toFixed(2), // Store as string with 2 decimals
                                fareUSD: fareUSD.toFixed(2), // Store as string with 2 decimals
                                bags,
                                persons,
                                afterHours,
                                roundTrip: isRoundTrip,
                                rideDateTime: rideDateTime, // Standardized field name
                                returnDateTime: returnDateTime, // Standardized field name
                                status: 'quoted', // Initial status
                                timestamp: serverTimestamp()
                            });
                            showToast("Ride quote saved to history!", "success");
                            resetRideForm();
                        } catch (err) {
                            console.error("Failed to save ride request:", err); // Log the error for debugging
                            showToast("Failed to save ride request. Please try again.", "danger"); // Changed to error type
                        }
                    } else {
                        // This case implies user not logged in or db not initialized
                        showToast("Please log in to save your ride request.", "warning");
                    }
                } else {
                    showToast("Could not calculate route. Please check your locations.", "danger"); // Changed to danger type
                }
            }
        );
    } catch (err) {
        hideLoadingOverlay();
        console.error("Error calculating route:", err); // Log the error for debugging
        showToast("Error calculating route. Please try again.", "danger"); // Changed to danger type
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
    if (bagsInput) bagsInput.value = '0'; // Set to string '0' for consistency with input type number
    if (personsInput) personsInput.value = '1'; // Set to string '1' for consistency with input type number
    if (roundTripInput) {
        roundTripInput.checked = false;
        // Ensure return pickup time group is hidden when form is reset
        const returnPickupTimeGroup = document.getElementById('return-pickup-time-group');
        if (returnPickupTimeGroup) {
            returnPickupTimeGroup.style.display = 'none';
        }
    }
}

export function printQuote() {
    const modal = document.getElementById('quote-display-modal');
    if (!modal) return;
    // Get the element containing the content to print, assuming it's correctly within the modal
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