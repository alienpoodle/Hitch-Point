import { directionsService, distanceMatrixService, loadGoogleMapsScript } from './maps.js';


/**
 * Calculates the estimated fare based on origin, destination, and other factors.
 * It now relies on Google Maps services initialized and exposed by map.js.
 * @param {object} options - Calculation parameters.
 * @param {string} options.origin - Starting point address/coordinates.
 * @param {string} options.destination - Ending point address/coordinates.
 * @param {string[]} [options.pickupPoints=[]] - Array of intermediate pickup point addresses.
 * @param {number} options.bags - Number of bags.
 * @param {number} options.persons - Number of persons.
 * @param {boolean} options.isRoundTrip - True if it's a round trip.
 * @param {string} options.rideDateTime - ISO string or similar for pickup date/time.
 * @param {string} [options.returnDateTime] - ISO string or similar for return pickup date/time (if round trip).
 * @returns {Promise<object>} An object containing quote details including fare.
 */
export async function getCalculatedQuote({
    origin,
    destination,
    pickupPoints = [],
    bags,
    persons,
    isRoundTrip,
    rideDateTime,
    returnDateTime
}) {
    // Ensure Google Maps API and its services are loaded and ready.
    // This call will resolve immediately if already loaded, or wait if loading/load it.
    try {
        await loadGoogleMapsScript(); // <-- No API key passed here, map.js gets it from window.firebaseConfig
    } catch (error) {
        console.error("Failed to load Google Maps API for fare calculation:", error);
        throw new Error("Mapping services unavailable for fare calculation. Please try again.");
    }

    // Now, directionsService and distanceMatrixService should be available from map.js
    if (!directionsService || !distanceMatrixService) {
        console.error("Google Maps Directions or Distance Matrix services are not initialized.");
        throw new Error("Mapping services not ready for fare calculation.");
    }

    // Constants for fare calculation (adjust these as needed)
    const BASE_FARE_USD = 10; // Base fare in USD
    const PER_KM_RATE_USD = 1.5; // Per kilometer rate in USD
    const PER_MINUTE_RATE_USD = 0.2; // Per minute rate in USD
    const BAG_SURCHARGE_USD = 0.5; // Per bag surcharge
    const PERSON_SURCHARGE_USD = 1; // Per person surcharge (for persons > 1)
    const ROUND_TRIP_MULTIPLIER = 1.8; // Discount for round trip (e.g., 20% discount if 1.8, no discount if 2)
    const AFTER_HOURS_SURCHARGE_PERCENT = 0.25; // 25% surcharge for after-hours
    const AFTER_HOURS_START = 22; // 10 PM
    const AFTER_HOURS_END = 6; // 6 AM
    const XCD_EXCHANGE_RATE = 2.70; // ECD to USD exchange rate

    let totalDistanceMeters = 0;
    let totalDurationSeconds = 0;
    let afterHours = false;

    try {
        const dateTime = new Date(rideDateTime);
        const pickupHour = dateTime.getHours();
        // Check if the pickup time falls within after-hours period
        if (pickupHour >= AFTER_HOURS_START || pickupHour < AFTER_HOURS_END) {
            afterHours = true;
        }

        // Prepare waypoints for the Directions API
        const waypoints = pickupPoints.map(point => ({
            location: point,
            stopover: true // Treat intermediate points as stops
        }));

        const request = {
            origin: origin,
            destination: destination,
            waypoints: waypoints, // Include intermediate pickup points
            optimizeWaypoints: true, // Let Google optimize the order of waypoints
            travelMode: google.maps.TravelMode.DRIVING
        };

        const directionsResult = await new Promise((resolve, reject) => {
            directionsService.route(request, (result, status) => {
                if (status === google.maps.DirectionsStatus.OK) {
                    resolve(result);
                } else {
                    reject(`Directions request failed: ${status}`);
                }
            });
        });

        // Sum up distance and duration from all legs of the journey
        const legs = directionsResult.routes[0].legs;
        legs.forEach(leg => {
            totalDistanceMeters += leg.distance.value; // Distance in meters
            totalDurationSeconds += leg.duration.value; // Duration in seconds
        });

        const totalDistanceKm = totalDistanceMeters / 1000;
        const totalDurationMinutes = totalDurationSeconds / 60;

        let fareUSD = BASE_FARE_USD;
        fareUSD += totalDistanceKm * PER_KM_RATE_USD;
        fareUSD += totalDurationMinutes * PER_MINUTE_RATE_USD;

        // Surcharges
        if (bags > 0) {
            fareUSD += bags * BAG_SURCHARGE_USD;
        }
        if (persons > 1) { // Surcharge for additional persons beyond the first
            fareUSD += (persons - 1) * PERSON_SURCHARGE_USD;
        }

        if (afterHours) {
            fareUSD *= (1 + AFTER_HOURS_SURCHARGE_PERCENT);
        }

        if (isRoundTrip) {
            fareUSD *= ROUND_TRIP_MULTIPLIER;
        }

        fareUSD = parseFloat(fareUSD.toFixed(2));
        const fareXCD = parseFloat((fareUSD * XCD_EXCHANGE_RATE).toFixed(2));

        // Format distance and duration for display
        const distanceDisplay = `${totalDistanceKm.toFixed(1)} km`;
        const durationDisplay = `${Math.round(totalDurationMinutes)} min`;

        return {
            origin: origin,
            destination: destination,
            pickupPoints: pickupPoints, // Return the collected points
            distance: distanceDisplay,
            duration: durationDisplay,
            bags,
            persons,
            roundTrip: isRoundTrip,
            rideDateTime,
            returnDateTime,
            afterHours,
            fareUSD,
            fareXCD
        };

    } catch (error) {
        console.error("Error calculating quote:", error);
        throw new Error("Failed to calculate fare. Please ensure valid locations and try again. " + error.message);
    }
}
