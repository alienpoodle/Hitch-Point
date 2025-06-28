import { BASE_FARE_XCD, DEFAULT_PER_KM_RATE_XCD, AFTER_HOURS_SURCHARGE_PERCENTAGE, XCD_TO_USD_EXCHANGE_RATE, COST_PER_ADDITIONAL_BAG_XCD, COST_PER_ADDITIONAL_PERSON_XCD, FREE_PERSON_COUNT } from './constants.js';
import { db, currentUserId } from './firebase.js';
import { showToast, openModal, hideLoadingOverlay, showLoadingOverlay } from './ui.js';
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

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
    }
}

function isAfterHours(dtString) {
    // dtString: "YYYY-MM-DDTHH:mm"
    if (!dtString) return false;
    const dt = new Date(dtString);
    const hour = dt.getHours();
    // Example: after hours is before 6am or after 8pm
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

    if (!originInput || !destinationInput) return;
    const origin = originInput.value;
    const destination = destinationInput.value;
    const bags = parseInt(bagsInput?.value, 10) || 0;
    const persons = parseInt(personsInput?.value, 10) || 1;
    const isRoundTrip = roundTripInput?.checked || false;
    const pickupTime = pickupTimeInput?.value || null;
    const returnPickupTime = (isRoundTrip && returnPickupTimeInput) ? returnPickupTimeInput.value : null;

    if (!origin || !destination) {
        showToast("Please enter both origin and destination.", "warning");
        return;
    }
    if (!window.google || !window.google.maps) {
        showToast("Google Maps is not loaded yet. Please try again.", "error");
        return;
    }
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

                    if (quoteDistance) quoteDistance.textContent = leg.distance.text;
                    if (quoteDuration) quoteDuration.textContent = leg.duration.text;
                    if (quoteOrigin) quoteOrigin.textContent = origin;
                    if (quoteDestination) quoteDestination.textContent = destination;
                    if (quoteBags) quoteBags.textContent = bags > 0 ? `${bags} bag(s)` : "No bags";
                    if (quotePersons) quotePersons.textContent = persons > 1 ? `${persons} person(s)` : "1 person";
                    if (quoteRoundTrip) quoteRoundTrip.textContent = isRoundTrip ? "Yes" : "No";
                    if (quotePickupTime) quotePickupTime.textContent = pickupTime ? new Date(pickupTime).toLocaleString() : "Not set";
                    if (quoteReturnPickupTime) quoteReturnPickupTime.textContent = (isRoundTrip && returnPickupTime) ? new Date(returnPickupTime).toLocaleString() : "N/A";

                    // Determine after hours for either pickup time or return pickup time
                    const afterHours = isAfterHours(pickupTime) || (isRoundTrip && isAfterHours(returnPickupTime));
                    if (quoteAfterHours) quoteAfterHours.textContent = afterHours ? "Yes" : "No";

                    const distanceKm = leg.distance.value / 1000;
                    let fareXCD = BASE_FARE_XCD + (distanceKm * DEFAULT_PER_KM_RATE_XCD);
                    if (bags > 0) fareXCD += bags * COST_PER_ADDITIONAL_BAG_XCD;
                    if (persons > FREE_PERSON_COUNT) fareXCD += (persons - FREE_PERSON_COUNT) * COST_PER_ADDITIONAL_PERSON_XCD;
                    if (afterHours) fareXCD += fareXCD * AFTER_HOURS_SURCHARGE_PERCENTAGE;
                    if (isRoundTrip) fareXCD *= 2;
                    const fareUSD = fareXCD * XCD_TO_USD_EXCHANGE_RATE;
                    if (quoteFare) quoteFare.textContent = `${Math.round(fareXCD)} XCD / $${Math.round(fareUSD)} USD`;
                    openModal('quote-display-modal');
                    if (db && currentUserId) {
                        try {
                            await addDoc(collection(db, "rides"), {
                                userId: currentUserId,
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
                                pickupTime,
                                returnPickupTime,
                                status: 'quoted',
                                timestamp: serverTimestamp()
                            });
                            showToast("Ride quote saved to history!", "success");
                            resetRideForm();
                        } catch (err) {
                            showToast("Failed to save ride request.", "error");
                        }
                    }
                } else {
                    showToast("Could not calculate route. Please check your locations.", "error");
                }
            }
        );
    } catch (err) {
        hideLoadingOverlay();
        showToast("Error calculating route.", "error");
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
    if (bagsInput) bagsInput.value = 0;
    if (personsInput) personsInput.value = 1;
    if (roundTripInput) roundTripInput.checked = false;
}

export function printQuote() {
    const modal = document.getElementById('quote-display-modal');
    if (!modal) return;
    const printContents = modal.querySelector('.modal-quote-content').innerHTML;
    const win = window.open('', '', 'height=600,width=400');
    win.document.write(`
        <html>
        <head>
            <title>HitchPoint - Ride Quote</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; }
                h1 { color: #5E9BCD; }
                .quote-detail { margin: 10px 0; }
                .fare { font-size: 24px; font-weight: bold; color: #FFD700; }
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