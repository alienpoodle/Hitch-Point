import { BASE_FARE_XCD, DEFAULT_PER_KM_RATE_XCD, AFTER_HOURS_SURCHARGE_PERCENTAGE, XCD_TO_USD_EXCHANGE_RATE, COST_PER_ADDITIONAL_BAG_XCD, COST_PER_ADDITIONAL_PERSON_XCD, FREE_PERSON_COUNT } from './constants.js';
import { db, currentUserId } from './firebase.js'; 
import { showToast, openModal, hideLoadingOverlay, showLoadingOverlay } from './ui.js';
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

let debounceTimeout; // For debouncing the real-time calculation
let pickupPointCount = 0;
const MAX_PICKUP_POINTS = 6; 

export function setupRideListeners() {
    const requestRideBtn = document.getElementById('request-ride-btn');
    if (requestRideBtn) requestRideBtn.addEventListener('click', submitRideRequest);

    const printQuoteBtn = document.getElementById('print-quote-btn');
    if (printQuoteBtn) printQuoteBtn.addEventListener('click', printQuote);

    const roundTripInput = document.getElementById('round-trip-input');
    const returnPickupTimeGroup = document.getElementById('return-pickup-time-group');

    const addPickupBtn = document.getElementById('add-pickup-btn');
    const pickupPointsContainer = document.getElementById('pickup-points-container'); 

    if (addPickupBtn && pickupPointsContainer) {
        addPickupBtn.addEventListener('click', addPickupPointField);
    }

    // Attach event listeners for real-time quote calculation
    // Collect all relevant inputs, including initial and dynamic pickup points
    const getInputsToMonitor = () => {
        const inputs = [
            document.getElementById('origin-input'),
            document.getElementById('destination-input'),
            document.getElementById('bags-input'),
            document.getElementById('persons-input'),
            document.getElementById('round-trip-input'),
            document.getElementById('pickup-time-input'),
            document.getElementById('return-pickup-time-input')
        ].filter(Boolean); // Filter out nulls if elements aren't found

        // Add dynamically created pickup point inputs
        document.querySelectorAll('.pickup-point-input').forEach(input => inputs.push(input));
        return inputs;
    };

    // Initial setup for existing inputs
    getInputsToMonitor().forEach(input => {
        input.addEventListener('input', debounceRealtimeQuote);
        input.addEventListener('change', debounceRealtimeQuote); // For checkboxes/date inputs
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
    // Add a slight delay to ensure Maps API might be ready from main.js init
    setTimeout(debounceRealtimeQuote, 500);
}

/**
 * Adds a new input field for an additional pickup point.
 */
function addPickupPointField() {
    const pickupPointsContainer = document.getElementById('pickup-points-container');
    const addPickupBtn = document.getElementById('add-pickup-btn');

    if (!pickupPointsContainer) {
        console.error("Pickup points container not found.");
        showToast("Error: Cannot add pickup point. Container missing.", "danger");
        return;
    }

    if (pickupPointCount >= MAX_PICKUP_POINTS) {
        showToast(`You can add a maximum of ${MAX_PICKUP_POINTS} additional pickup points.`, "info");
        if (addPickupBtn) addPickupBtn.disabled = true; // Disable if max reached
        return;
    }

    pickupPointCount++;

    const newPickupFieldDiv = document.createElement('div');
    newPickupFieldDiv.className = 'form-group mb-3 pickup-point-group';
    newPickupFieldDiv.innerHTML = `
        <label for="pickup-point-${pickupPointCount}" class="form-label">Additional Pickup Point ${pickupPointCount}:</label>
        <div class="input-group">
            <input type="text" class="form-control pickup-point-input" id="pickup-point-${pickupPointCount}" placeholder="Enter address or location" aria-label="Additional pickup point ${pickupPointCount}">
            <button class="btn btn-outline-danger remove-pickup-btn" type="button" data-pickup-id="pickup-point-${pickupPointCount}">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;

    pickupPointsContainer.appendChild(newPickupFieldDiv);

    // Attach event listeners to the new input and remove button
    const newPickupInput = document.getElementById(`pickup-point-${pickupPointCount}`);
    if (newPickupInput) {
        newPickupInput.addEventListener('input', debounceRealtimeQuote);
        newPickupInput.addEventListener('change', debounceRealtimeQuote); // For autocompletes
    }

    const removeBtn = newPickupFieldDiv.querySelector('.remove-pickup-btn');
    if (removeBtn) {
        removeBtn.addEventListener('click', removePickupPointField);
    }

    debounceRealtimeQuote(); // Recalculate quote with new field
    showToast(`Added pickup point field.`, "success");

    // Check and update button state
    if (addPickupBtn && pickupPointCount >= MAX_PICKUP_POINTS) {
        addPickupBtn.disabled = true;
    }
}

/**
 * Removes a dynamically added pickup point input field.
 * @param {Event} event - The click event from the remove button.
 */
function removePickupPointField(event) {
    const button = event.currentTarget;
    const pickupId = button.dataset.pickupId;
    const fieldToRemove = document.getElementById(pickupId)?.closest('.pickup-point-group');

    if (fieldToRemove) {
        fieldToRemove.remove();
        pickupPointCount--; // Decrement count

        // Re-number remaining fields for clean display
        document.querySelectorAll('.pickup-point-group').forEach((group, index) => {
            const label = group.querySelector('.form-label');
            const input = group.querySelector('.pickup-point-input');
            const removeBtn = group.querySelector('.remove-pickup-btn');

            const newIndex = index + 1;
            if (label) label.textContent = `Additional Pickup Point ${newIndex}:`;
            if (input) {
                input.id = `pickup-point-${newIndex}`;
                input.setAttribute('aria-label', `Additional pickup point ${newIndex}`);
            }
            if (removeBtn) removeBtn.dataset.pickupId = `pickup-point-${newIndex}`;
        });

        // Re-enable add button if it was disabled
        const addPickupBtn = document.getElementById('add-pickup-btn');
        if (addPickupBtn) addPickupBtn.disabled = false;

        debounceRealtimeQuote(); // Recalculate quote
        showToast("Pickup point removed.", "info");
    }
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
    const breakdownContainer = document.getElementById('realtime-fare-breakdown'); // Get breakdown container too

    if (fareDisplay) fareDisplay.textContent = "Calculating...";
    if (statusMessage) statusMessage.textContent = "Getting route and fare...";
    if (quoteDisplay) quoteDisplay.style.display = 'block'; // Ensure it's visible
    if (breakdownContainer) breakdownContainer.style.display = 'none'; // Hide breakdown while recalculating

    debounceTimeout = setTimeout(triggerRealtimeQuoteCalculation, 700);
}

/**
 * Gathers form inputs and triggers the quote calculation for real-time display.
 */
async function triggerRealtimeQuoteCalculation() {
    const origin = document.getElementById('origin-input')?.value.trim();
    const destination = document.getElementById('destination-input')?.value.trim();
    const bags = Math.max(0, Math.min(10, parseInt(document.getElementById('bags-input')?.value, 10) || 0));
    const persons = Math.max(1, Math.min(8, parseInt(document.getElementById('persons-input')?.value, 10) || 1));
    const isRoundTrip = document.getElementById('round-trip-input')?.checked || false;
    const rideDateTime = document.getElementById('pickup-time-input')?.value || null;
    const returnDateTime = (isRoundTrip && document.getElementById('return-pickup-time-input')) ? document.getElementById('return-pickup-time-input').value : null;

    // Collect all dynamic pickup points
    const pickupPoints = Array.from(document.querySelectorAll('.pickup-point-input'))
                               .map(input => ({ location: input.value.trim() }))
                               .filter(wp => wp.location); // Filter out empty strings

    const quoteDisplay = document.getElementById('realtime-quote-display');
    const fareDisplay = document.getElementById('realtime-fare-display');
    const statusMessage = document.getElementById('realtime-status-message');
    const breakdownContainer = document.getElementById('realtime-fare-breakdown');

    // Make sure Google Maps API is ready before proceeding with calculation
    if (!window.google || !window.google.maps || !window.google.maps.DirectionsService) {
        if (fareDisplay) fareDisplay.textContent = "N/A";
        if (statusMessage) statusMessage.textContent = "Maps not ready. Try again in a moment.";
        if (quoteDisplay) quoteDisplay.style.display = 'block';
        if (breakdownContainer) breakdownContainer.style.display = 'none';
        console.warn("Google Maps API (DirectionsService) not ready for real-time quote calculation.");
        return;
    }

    // Check if at least origin and destination are provided, and primary pickup time
    if (!origin || !destination || !rideDateTime) {
        if (fareDisplay) fareDisplay.textContent = "N/A";
        if (statusMessage) statusMessage.textContent = "Enter Origin, Destination, & Pickup Time.";
        if (quoteDisplay) quoteDisplay.style.display = 'none';
        if (breakdownContainer) breakdownContainer.style.display = 'none';
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
            pickupPoints // Pass the collected pickup points
        });
        updateRealtimeQuoteDisplay(quoteDetails);
    } catch (error) {
        console.error("Error in real-time quote calculation:", error);
        if (fareDisplay) fareDisplay.textContent = "Error";
        if (statusMessage) statusMessage.textContent = `Could not calculate fare: ${error.message}.`;
        if (quoteDisplay) quoteDisplay.style.display = 'block';
        if (breakdownContainer) breakdownContainer.style.display = 'none';
        showToast("Error getting real-time quote: " + error.message, "danger");
    }
}

/**
 * Performs the core fare calculation and route lookup, now handling multiple waypoints.
 * Returns a promise that resolves with the calculated quote details.
 * Does NOT interact with the DOM for display or with Firestore.
 */
async function getCalculatedQuote({ origin, destination, bags, persons, isRoundTrip, rideDateTime, returnDateTime, pickupPoints = [] }) {
    if (!window.google || !window.google.maps || !window.google.maps.DirectionsService) {
        throw new Error("Google Maps DirectionsService not available.");
    }

    return new Promise((resolve, reject) => {
        const directionsService = new google.maps.DirectionsService();

        const request = {
            origin: origin,
            destination: destination,
            travelMode: google.maps.TravelMode.DRIVING,
            waypoints: pickupPoints, // Add the collected pickup points as waypoints
            optimizeWaypoints: true // Optional: let Google optimize the route through waypoints
        };

        directionsService.route(
            request,
            (result, status) => {
                if (status === "OK" && result.routes.length > 0) {
                    let totalDistanceValue = 0; // in meters
                    let totalDurationValue = 0; // in seconds

                    // Sum distances and durations from all legs
                    result.routes[0].legs.forEach(leg => {
                        totalDistanceValue += leg.distance.value;
                        totalDurationValue += leg.duration.value;
                    });

                    const distanceKm = totalDistanceValue / 1000;
                    const distanceText = (totalDistanceValue / 1000).toFixed(1) + " km";
                    const durationText = Math.ceil(totalDurationValue / 60) + " mins"; // Convert seconds to minutes

                    const afterHours = isAfterHours(rideDateTime) || (isRoundTrip && isAfterHours(returnDateTime));

                    // --- Fare Calculation ---
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
                        fareXCD *= 1.5; // Original fare + 50%
                    }

                    const fareUSD = fareXCD * XCD_TO_USD_EXCHANGE_RATE;

                    resolve({
                        origin,
                        destination,
                        distance: distanceText,
                        distanceKm: distanceKm,
                        duration: durationText,
                        fareXCD: fareXCD.toFixed(2),
                        fareUSD: fareUSD.toFixed(2),
                        bags,
                        persons,
                        afterHours,
                        roundTrip: isRoundTrip,
                        rideDateTime,
                        returnDateTime,
                        pickupPoints: pickupPoints.map(wp => wp.location), // Store just the location strings
                        status: 'quoted'
                    });

                } else {
                    reject(new Error(`Google Maps Directions API Error: ${status}`));
                }
            }
        );
    });
}


/**
 * Generates a detailed fare breakdown object
 * @param {Object} params - Calculation parameters including distanceKm, bags, persons, afterHours, isRoundTrip
 * @returns {Object} Detailed breakdown of all fare components
 */
function generateFareBreakdown({ distanceKm, bags, persons, afterHours, isRoundTrip }) {
    const breakdown = {
        // Base charges
        baseFare: BASE_FARE_XCD,
        distanceCharge: distanceKm * DEFAULT_PER_KM_RATE_XCD,

        // Additional charges
        bagsCharge: bags * COST_PER_ADDITIONAL_BAG_XCD,
        extraPersonsCharge: Math.max(0, (persons - FREE_PERSON_COUNT)) * COST_PER_ADDITIONAL_PERSON_XCD,

        // Calculated values (initialized)
        subtotal: 0,
        afterHoursCharge: 0,
        oneWayTotal: 0,
        // Round trip multiplier for breakdown clarity 
        roundTripMultiplier: isRoundTrip ? 1.5 : 1, // Represents original + 50%
        finalTotalXCD: 0,
        finalTotalUSD: 0,

        // Metadata
        distanceKm: distanceKm,
        bags: bags,
        persons: persons,
        freePersons: FREE_PERSON_COUNT,
        extraPersons: Math.max(0, persons - FREE_PERSON_COUNT),
        afterHours: afterHours,
        isRoundTrip: isRoundTrip,
        afterHoursPercentage: AFTER_HOURS_SURCHARGE_PERCENTAGE * 100
    };

    // Calculate totals
    breakdown.subtotal = breakdown.baseFare + breakdown.distanceCharge +
                         breakdown.bagsCharge + breakdown.extraPersonsCharge;

    if (afterHours) {
        breakdown.afterHoursCharge = breakdown.subtotal * AFTER_HOURS_SURCHARGE_PERCENTAGE;
    }

    breakdown.oneWayTotal = breakdown.subtotal + breakdown.afterHoursCharge;
    //  Apply 1.5 multiplier for round trip 
    breakdown.finalTotalXCD = breakdown.oneWayTotal * breakdown.roundTripMultiplier;
    breakdown.finalTotalUSD = breakdown.finalTotalXCD * XCD_TO_USD_EXCHANGE_RATE;

    return breakdown;
}

/**
 * Creates HTML for the fare breakdown display
 * @param {Object} breakdown - The fare breakdown object
 * @returns {string} HTML string for the breakdown display
 */
function createFareBreakdownHTML(breakdown) {
    const html = `
        <div class="fare-breakdown-container">
            <h3 class="fare-breakdown-title">Fare Breakdown</h3>

            <div class="fare-section">
                <h4 class="fare-section-title">Base Charges</h4>
                <div class="fare-line-item">
                    <span class="fare-label">
                        <i class="fas fa-flag-checkered"></i> Base Fare
                    </span>
                    <span class="fare-amount">$${breakdown.baseFare.toFixed(2)} XCD</span>
                </div>
                <div class="fare-line-item">
                    <span class="fare-label">
                        <i class="fas fa-route"></i> Distance (${breakdown.distanceKm.toFixed(1)} km × $${DEFAULT_PER_KM_RATE_XCD})
                    </span>
                    <span class="fare-amount">$${breakdown.distanceCharge.toFixed(2)} XCD</span>
                </div>
            </div>

            ${(breakdown.bagsCharge > 0 || breakdown.extraPersonsCharge > 0) ? `
                <div class="fare-section">
                    <h4 class="fare-section-title">Additional Charges</h4>
                    ${breakdown.bagsCharge > 0 ? `
                        <div class="fare-line-item">
                            <span class="fare-label">
                                <i class="fas fa-suitcase"></i> Bags (${breakdown.bags} × $${COST_PER_ADDITIONAL_BAG_XCD})
                            </span>
                            <span class="fare-amount">$${breakdown.bagsCharge.toFixed(2)} XCD</span>
                        </div>
                    ` : ''}
                    ${breakdown.extraPersonsCharge > 0 ? `
                        <div class="fare-line-item">
                            <span class="fare-label">
                                <i class="fas fa-user-plus"></i> Extra Passengers (${breakdown.extraPersons} × $${COST_PER_ADDITIONAL_PERSON_XCD})
                                <small class="fare-note">${breakdown.freePersons} passengers free</small>
                            </span>
                            <span class="fare-amount">$${breakdown.extraPersonsCharge.toFixed(2)} XCD</span>
                        </div>
                    ` : ''}
                </div>
            ` : ''}

            <div class="fare-line-item fare-subtotal">
                <span class="fare-label">Subtotal</span>
                <span class="fare-amount">$${breakdown.subtotal.toFixed(2)} XCD</span>
            </div>

            ${breakdown.afterHours ? `
                <div class="fare-line-item fare-surcharge">
                    <span class="fare-label">
                        <i class="fas fa-moon"></i> After Hours Surcharge (${breakdown.afterHoursPercentage}%)
                    </span>
                    <span class="fare-amount">+$${breakdown.afterHoursCharge.toFixed(2)} XCD</span>
                </div>
            ` : ''}

            <div class="fare-line-item fare-oneway-total">
                <span class="fare-label">One Way Total</span>
                <span class="fare-amount">$${breakdown.oneWayTotal.toFixed(2)} XCD</span>
            </div>

            ${breakdown.isRoundTrip ? `
                <div class="fare-line-item fare-roundtrip">
                    <span class="fare-label">
                        <i class="fas fa-exchange-alt"></i> Round Trip (Additional 50%)
                    </span>
                    <span class="fare-amount">×${breakdown.roundTripMultiplier.toFixed(1)}</span>
                </div>
            ` : ''}

            <div class="fare-line-item fare-final-total">
                <span class="fare-label">Total Fare</span>
                <span class="fare-amount">
                    <span class="fare-xcd">$${breakdown.finalTotalXCD.toFixed(2)} XCD</span>
                    <span class="fare-usd">$${breakdown.finalTotalUSD.toFixed(2)} USD</span>
                </span>
            </div>
        </div>
    `;

    return html;
}

/**
 * Updates the dedicated HTML elements for real-time quote display, including breakdown.
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
    const breakdownContainer = document.getElementById('realtime-fare-breakdown');
    const pickupPointsList = document.getElementById('realtime-pickup-points-list'); // Added for displaying pickup points

    if (quoteDisplay) quoteDisplay.style.display = 'block';

    if (distanceDisplay) distanceDisplay.textContent = quoteDetails.distance;
    if (durationDisplay) durationDisplay.textContent = quoteDetails.duration;
    if (personsDisplay) personsDisplay.textContent = quoteDetails.persons > 0 ? `${quoteDetails.persons} person(s)` : "1 person";
    if (bagsDisplay) bagsDisplay.textContent = quoteDetails.bags > 0 ? `${quoteDetails.bags} bag(s)` : "No bags";
    if (roundtripDisplay) roundtripDisplay.textContent = quoteDetails.roundTrip ? "Yes" : "No";
    if (afterhoursDisplay) afterhoursDisplay.textContent = quoteDetails.afterHours ? "Yes" : "No";
    if (fareDisplay) fareDisplay.textContent = `${quoteDetails.fareXCD} XCD / $${quoteDetails.fareUSD} USD`;
    if (statusMessage) statusMessage.textContent = "Quote updated.";

    // Update Pickup Points List display
    if (pickupPointsList) {
        if (quoteDetails.pickupPoints && quoteDetails.pickupPoints.length > 0) {
            pickupPointsList.innerHTML = quoteDetails.pickupPoints.map(p => `<li>${p}</li>`).join('');
            pickupPointsList.closest('.pickup-points-display-group').style.display = 'block'; // Show the group
        } else {
            pickupPointsList.innerHTML = '';
            pickupPointsList.closest('.pickup-points-display-group').style.display = 'none'; // Hide the group if no points
        }
    }


    // ADD FARE BREAKDOWN
    if (breakdownContainer) {
        const breakdown = generateFareBreakdown({
            distanceKm: quoteDetails.distanceKm,
            bags: quoteDetails.bags,
            persons: quoteDetails.persons,
            afterHours: quoteDetails.afterHours,
            isRoundTrip: quoteDetails.roundTrip
        });

        breakdownContainer.innerHTML = createFareBreakdownHTML(breakdown);
        breakdownContainer.style.display = 'block';
    }
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

    // Collect all dynamic pickup points for submission
    const pickupPoints = Array.from(document.querySelectorAll('.pickup-point-input'))
                               .map(input => ({ location: input.value.trim() }))
                               .filter(wp => wp.location);

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
            returnDateTime,
            pickupPoints // Pass the pickup points to the submission
        });

        // Update the modal content with the final calculated quote
        document.getElementById('quote-origin').textContent = quoteDetails.origin;
        document.getElementById('quote-destination').textContent = quoteDetails.destination;
        document.getElementById('quote-distance').textContent = quoteDetails.distance;
        document.getElementById('quote-duration').textContent = quoteDetails.duration;
        document.getElementById('quote-bags').textContent = quoteDetails.bags > 0 ? `${quoteDetails.bags} bag(s)` : "No bags";
        document.getElementById('quote-persons').textContent = quoteDetails.persons > 0 ? `${quoteDetails.persons} person(s)` : "1 person";
        document.getElementById('quote-roundtrip').textContent = quoteDetails.roundTrip ? "Yes" : "No";
        document.getElementById('quote-datetime').textContent = quoteDetails.rideDateTime ? new Date(quoteDetails.rideDateTime).toLocaleString() : "Not set";
        document.getElementById('quote-return-datetime').textContent = (quoteDetails.roundTrip && quoteDetails.returnDateTime) ? new Date(quoteDetails.returnDateTime).toLocaleString() : "N/A";
        document.getElementById('quote-afterHours').textContent = quoteDetails.afterHours ? "Yes" : "No";
        document.getElementById('quote-fare').textContent = `${quoteDetails.fareXCD} XCD / $${quoteDetails.fareUSD} USD`;

        // Update modal pickup points list
        const modalPickupPointsList = document.getElementById('quote-pickup-points-list');
        if (modalPickupPointsList) {
            if (quoteDetails.pickupPoints && quoteDetails.pickupPoints.length > 0) {
                modalPickupPointsList.innerHTML = quoteDetails.pickupPoints.map(p => `<li>${p}</li>`).join('');
                modalPickupPointsList.closest('.pickup-points-display-group')?.style.display = 'block';
            } else {
                modalPickupPointsList.innerHTML = '';
                modalPickupPointsList.closest('.pickup-points-display-group')?.style.display = 'none';
            }
        }


        // ADD FARE BREAKDOWN TO MODAL
        const modalBreakdownContainer = document.getElementById('quote-fare-breakdown');
        if (modalBreakdownContainer) {
            const breakdown = generateFareBreakdown({
                distanceKm: quoteDetails.distanceKm,
                bags: quoteDetails.bags,
                persons: quoteDetails.persons,
                afterHours: quoteDetails.afterHours,
                isRoundTrip: quoteDetails.roundTrip
            });

            modalBreakdownContainer.innerHTML = createFareBreakdownHTML(breakdown);
            modalBreakdownContainer.style.display = 'block';
        }

        openModal('quote-display-modal');

        // Proceed to save to Firestore ONLY AFTER the modal is shown to the user
        if (db && currentUserId) {
            try {
                await addDoc(collection(db, "rides"), {
                    userId: currentUserId,
                    origin: quoteDetails.origin,
                    destination: quoteDetails.destination,
                    pickupPoints: quoteDetails.pickupPoints, 
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
    const dt = new Date(dtString);
    if (isNaN(dt.getTime())) {
        console.warn("Invalid date string for after-hours check:", dtString);
        return false;
    }
    const hour = dt.getHours();
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

    // Remove all dynamically added pickup point fields
    const pickupPointsContainer = document.getElementById('pickup-points-container');
    if (pickupPointsContainer) {
        pickupPointsContainer.innerHTML = ''; // Clear all children
        pickupPointCount = 0; // Reset count
        const addPickupBtn = document.getElementById('add-pickup-btn');
        if (addPickupBtn) addPickupBtn.disabled = false; // Re-enable the button
    }

    // Clear and hide real-time quote display on form reset
    const quoteDisplay = document.getElementById('realtime-quote-display');
    const breakdownContainer = document.getElementById('realtime-fare-breakdown'); 

    // Add logic to clear/hide these elements if desired
    if (quoteDisplay) quoteDisplay.style.display = 'none';
    if (breakdownContainer) breakdownContainer.style.display = 'none';
    // You might also want to clear any text content in these elements
    if (document.getElementById('realtime-fare-display')) document.getElementById('realtime-fare-display').textContent = '';
    if (document.getElementById('realtime-status-message')) document.getElementById('realtime-status-message').textContent = 'Enter ride details for a quote.';
    if (document.getElementById('realtime-distance-display')) document.getElementById('realtime-distance-display').textContent = '';
    if (document.getElementById('realtime-duration-display')) document.getElementById('realtime-duration-display').textContent = '';
    if (document.getElementById('realtime-persons-display')) document.getElementById('realtime-persons-display').textContent = '';
    if (document.getElementById('realtime-bags-display')) document.getElementById('realtime-bags-display').textContent = '';
    if (document.getElementById('realtime-roundtrip-display')) document.getElementById('realtime-roundtrip-display').textContent = '';
    if (document.getElementById('realtime-afterhours-display')) document.getElementById('realtime-afterhours-display').textContent = '';
    if (document.getElementById('realtime-pickup-points-list')) {
        document.getElementById('realtime-pickup-points-list').innerHTML = '';
        document.getElementById('realtime-pickup-points-list').closest('.pickup-points-display-group').style.display = 'none';
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

    const win = window.open('', '_blank', 'height=700,width=800');
    win.document.write(`
        <html>
        <head>
            <title>HitchPoint - Ride Quote</title>
            <style>
                ${getFareBreakdownPrintStyles()}
                body { font-family: Arial, sans-serif; padding: 20px; color: #333; line-height: 1.6; }
                h1 { color: #5E9BCD; margin-bottom: 20px; text-align: center; }
                .quote-detail { margin: 10px 0; font-size: 15px; }
                .quote-detail.pickup-points-display-group ul {
                    list-style-type: disc;
                    padding-left: 20px;
                    margin-top: 5px;
                    font-size: 14px;
                }
                .fare { font-size: 28px; font-weight: bold; color: #007bff; margin-top: 30px; text-align: center; }
                p { margin-bottom: 5px; }
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
    win.close();
}

// Helper function to get print-specific styles
function getFareBreakdownPrintStyles() {
    return `
        .fare-breakdown-container {
            background: #f8f9fa;
            border: 2px solid #000;
            padding: 15px;
            margin-top: 20px;
        }
        .fare-breakdown-title {
            font-size: 18px;
            font-weight: bold;
            margin-bottom: 15px;
            border-bottom: 2px solid #5E9BCD;
            padding-bottom: 5px;
        }
        .fare-section-title {
            font-size: 14px;
            font-weight: bold;
            margin: 10px 0 5px 0;
            text-transform: uppercase;
        }
        .fare-line-item {
            display: flex;
            justify-content: space-between;
            padding: 5px 0;
            border-bottom: 1px solid #ddd;
        }
        .fare-label { flex: 1; }
        .fare-amount { font-weight: bold; }
        .fare-note {
            display: block;
            font-size: 12px;
            color: #666;
            margin-left: 20px;
        }
        .fare-subtotal,
        .fare-final-total {
            font-weight: bold;
            border-top: 2px solid #000;
            padding-top: 10px;
            margin-top: 10px;
        }
        .fare-surcharge {
            background-color: #fff3cd;
            padding: 5px;
            margin: 5px -5px;
        }
        .fare-xcd { color: #5E9BCD; font-size: 16px; }
        .fare-usd { color: #666; font-size: 14px; }
    `;
}

// Export functions that might be needed externally (e.g., for testing or by other modules)
export { getCalculatedQuote, generateFareBreakdown, createFareBreakdownHTML };