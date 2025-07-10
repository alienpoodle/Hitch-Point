import { BASE_FARE_XCD, DEFAULT_PER_KM_RATE_XCD, AFTER_HOURS_SURCHARGE_PERCENTAGE, XCD_TO_USD_EXCHANGE_RATE, COST_PER_ADDITIONAL_BAG_XCD, COST_PER_ADDITIONAL_PERSON_XCD, FREE_PERSON_COUNT } from './constants.js';
import { loadGoogleMapsScript(apiKey) } from './maps.js';// Still needed here for DirectionsService

/**
 * Performs the core fare calculation and route lookup.
 * Returns a promise that resolves with the calculated quote details.
 * Does NOT interact with the DOM for display or with Firestore.
 * @param {object} params - Object containing ride details.
 * @param {string} params.origin - Origin address.
 * @param {string} params.destination - Destination address.
 * @param {number} params.bags - Number of bags.
 * @param {number} params.persons - Number of persons.
 * @param {boolean} params.isRoundTrip - Is it a round trip?
 * @param {string} params.rideDateTime - Pickup date/time for the first leg.
 * @param {string} [params.returnDateTime] - Pickup date/time for the return leg (if round trip).
 * @returns {Promise<object>} - A promise that resolves with quote details.
 */
export async function getCalculatedQuote({ origin, destination, bags, persons, isRoundTrip, rideDateTime, returnDateTime }) {
    await loadGoogleMapsApi(apiKey); // Ensure Maps API is loaded

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

                    /// Round Trip (doubles the entire calculated fare up to this point)
                    if (isRoundTrip) {
                        fareXCD *= 2;
                    }

                    const fareUSD = fareXCD * XCD_TO_USD_EXCHANGE_RATE;

                    // Placeholder for pickupPoints. This needs to be populated if you have this data.
                    // For now, it's an empty array or you can remove it if not used.
                    const pickupPoints = []; // Example: If you intend to add logic later to get these from the form or API.

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
                        pickupPoints: pickupPoints, // Include this in the returned object
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
