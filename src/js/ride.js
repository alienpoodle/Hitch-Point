import { showToast, showLoadingOverlay, hideLoadingOverlay } from './ui.js';

export function setupMultipointPickup() {
    const routePointsList = document.getElementById('route-points-list');
    const addPickupBtn = document.getElementById('add-pickup-btn');

    function updateLabels() {
        const points = routePointsList.querySelectorAll('.route-point');
        points.forEach((group, idx) => {
            const label = group.querySelector('.input-group-text');
            if (idx === 0) {
                label.textContent = 'Start';
                label.className = 'input-group-text bg-primary text-white';
            } else if (idx === points.length - 1) {
                label.textContent = 'Finish';
                label.className = 'input-group-text bg-secondary text-white';
            } else {
                label.textContent = `Pickup ${idx}`;
                label.className = 'input-group-text bg-info text-white';
            }
            // Show remove button only for pickup points
            let removeBtn = group.querySelector('.remove-pickup-btn');
            if (idx > 0 && idx < points.length - 1) {
                if (!removeBtn) {
                    removeBtn = document.createElement('button');
                    removeBtn.type = 'button';
                    removeBtn.className = 'btn btn-outline-danger btn-sm remove-pickup-btn';
                    removeBtn.title = 'Remove Pickup';
                    removeBtn.innerHTML = '<i class="fas fa-times"></i>';
                    removeBtn.onclick = () => {
                        group.remove();
                        updateLabels();
                    };
                    group.appendChild(removeBtn);
                }
            } else if (removeBtn) {
                removeBtn.remove();
            }
        });
    }

    if (addPickupBtn && routePointsList) {
        addPickupBtn.addEventListener('click', () => {
            const points = routePointsList.querySelectorAll('.route-point');
            const newIdx = points.length - 1;
            // Insert before the last (finish) point
            const finishGroup = points[points.length - 1];
            const pickupGroup = document.createElement('div');
            pickupGroup.className = 'input-group mb-2 route-point';
            pickupGroup.setAttribute('data-index', newIdx);
            pickupGroup.innerHTML = `
                    <span class="input-group-text bg-info text-white">Pickup ${newIdx}</span>
                    <input type="text" class="form-control route-point-input" placeholder="Enter pickup point" required>
                    <button class="btn btn-outline-secondary select-map-btn" type="button" title="Pin on Map"
                        data-bs-toggle="modal" data-bs-target="#map-modal">
                        <i class="fas fa-map-marker-alt"></i>
                    </button>
                `;
            routePointsList.insertBefore(pickupGroup, finishGroup);
            updateLabels();
        });
    }
    updateLabels();
}

export function setupRideListeners() {
    const requestRideBtn = document.getElementById('request-ride-btn');
    if (requestRideBtn) requestRideBtn.addEventListener('click', calculateRoute);

    const printQuoteBtn = document.getElementById('print-quote-btn');
    if (printQuoteBtn) printQuoteBtn.addEventListener('click', printQuote);

    // Multipoint setup
    setupMultipointPickup();
}

function isAfterHours(dateObj) {
    // After hours: before 6:00 AM or after 8:00 PM
    const hour = dateObj.getHours();
    return (hour < 6 || hour >= 20);
}

export async function calculateRoute() {
    const routeInputs = document.querySelectorAll('.route-point-input');
    if (routeInputs.length < 2) {
        showToast("Please enter at least a start and finish point.", "warning");
        return;
    }
    const points = Array.from(routeInputs).map(input => input.value.trim()).filter(Boolean);
    if (points.length < 2) {
        showToast("Please enter all route points.", "warning");
        return;
    }
    const bagsInput = document.getElementById('bags-input');
    const personsInput = document.getElementById('persons-input');
    const rideDateTimeInput = document.getElementById('ride-datetime-input');
    const roundTripInput = document.getElementById('round-trip-input');
    const returnDateTimeInput = document.getElementById('return-datetime-input');
    const bags = parseInt(bagsInput?.value, 10) || 0;
    const persons = parseInt(personsInput?.value, 10) || 1;
    const isRoundTrip = roundTripInput?.checked || false;
    const rideDateTimeValue = rideDateTimeInput.value;
    const returnDateTimeValue = isRoundTrip && returnDateTimeInput ? returnDateTimeInput.value : null;
    if (!rideDateTimeValue) {
        showToast("Please select a ride date and time.", "warning");
        return;
    }
    if (isRoundTrip && !returnDateTimeValue) {
        showToast("Please select a return date and time.", "warning");
        return;
    }
    if (!window.google || !window.google.maps) {
        showToast("Google Maps is not loaded yet. Please try again.", "error");
        return;
    }
    // Parse date/time
    const rideDateObj = new Date(rideDateTimeValue);
    if (isNaN(rideDateObj.getTime())) {
        showToast("Invalid ride date/time.", "warning");
        return;
    }
    let returnDateObj = null;
    if (isRoundTrip) {
        returnDateObj = new Date(returnDateTimeValue);
        if (isNaN(returnDateObj.getTime())) {
            showToast("Invalid return date/time.", "warning");
            return;
        }
    }
    const afterHours = isAfterHours(rideDateObj);

    showLoadingOverlay();
    try {
        const directionsService = new google.maps.DirectionsService();
        directionsService.route(
            {
                origin: points[0],
                destination: points[points.length - 1],
                waypoints: points.slice(1, -1).map(address => ({ location: address, stopover: true })),
                travelMode: google.maps.TravelMode.DRIVING
            },
            async (result, status) => {
                hideLoadingOverlay();
                if (status !== 'OK' || !result.routes.length) {
                    showToast("Could not calculate route. Please check your points.", "error");
                    return;
                }
                // Example: sum up distance/duration
                let totalDistance = 0, totalDuration = 0;
                result.routes[0].legs.forEach(leg => {
                    totalDistance += leg.distance.value;
                    totalDuration += leg.duration.value;
                });
                // Show quote modal, fill in details.
                document.getElementById('quote-origin').textContent = points[0];
                document.getElementById('quote-destination').textContent = points[points.length - 1];
                document.getElementById('quote-distance').textContent = (totalDistance / 1000).toFixed(2) + " km";
                document.getElementById('quote-duration').textContent = Math.round(totalDuration / 60) + " min";
                document.getElementById('quote-bags').textContent = bags;
                document.getElementById('quote-persons').textContent = persons;
                document.getElementById('quote-datetime').textContent = rideDateObj.toLocaleString();
                document.getElementById('quote-return-datetime').textContent = isRoundTrip && returnDateObj ? returnDateObj.toLocaleString() : "-";
                document.getElementById('quote-afterHours').textContent = afterHours ? "Yes" : "No";
                document.getElementById('quote-roundtrip').textContent = isRoundTrip ? "Yes" : "No";
                // Example fare calculation
                let fare = 20 + (totalDistance / 1000) * 2 + (afterHours ? 10 : 0) + (isRoundTrip ? 15 : 0);
                document.getElementById('quote-fare').textContent = "$" + fare.toFixed(2);
                const quoteModal = new bootstrap.Modal(document.getElementById('quote-display-modal'));
                quoteModal.show();
            }
        );
    } catch (err) {
        hideLoadingOverlay();
        showToast("Error calculating route.", "error");
    }
}

export function resetRideForm() {
    const routeInputs = document.querySelectorAll('.route-point-input');
    routeInputs.forEach(input => input.value = "");
    const bagsInput = document.getElementById('bags-input');
    const personsInput = document.getElementById('persons-input');
    const rideDateTimeInput = document.getElementById('ride-datetime-input');
    const roundTripInput = document.getElementById('round-trip-input');
    const returnDateTimeInput = document.getElementById('return-datetime-input');
    if (bagsInput) bagsInput.value = "0";
    if (personsInput) personsInput.value = "1";
    if (rideDateTimeInput) rideDateTimeInput.value = "";
    if (roundTripInput) roundTripInput.checked = false;
    if (returnDateTimeInput) returnDateTimeInput.value = "";
}

export function printQuote() {
    window.print();
}