import { db, currentUserId } from './firebase.js';
import { showToast, openModal, hideModal } from './ui.js';
import { collection, query, where, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

export function showRideHistory() {
    if (!db || !currentUserId) {
        showToast("You must be logged in to view ride history.", "warning");
        return;
    }
    openModal('ride-history-modal');
    const historyBody = document.getElementById('ride-history-body');
    if (historyBody) {
        historyBody.innerHTML = '<div class="loading-spinner-container"><div class="spinner"></div><p>Loading ride history...</p></div>';
    }
    const ridesRef = collection(db, "rides");
    const q = query(ridesRef, where("userId", "==", currentUserId), orderBy("timestamp", "desc"));
    let unsubscribe = null; // Declare unsubscribe here to ensure it's always available
    try {
        unsubscribe = onSnapshot(q,
            (snapshot) => {
                if (!historyBody) return;
                if (snapshot.empty) {
                    historyBody.innerHTML = `
                        <div class="empty-state">
                            <i class="fas fa-car fa-3x"></i>
                            <p>No ride history found.</p>
                            <p class="text-sm text-gray-500">Your ride requests will appear here.</p>
                        </div>
                    `;
                    return;
                }
                let html = `
                    <div class="table-container">
                        <table class="modal-ride-history-table">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Origin</th>
                                    <th>Destination</th>
                                    <th>Distance</th>
                                    <th>Fare</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                `;
                snapshot.forEach(doc => {
                    const data = doc.data();
                    const date = data.timestamp ? new Date(data.timestamp.seconds * 1000).toLocaleString() : 'N/A';
                    const status = data.status || 'quoted';
                    const statusClass = status === 'completed' ? 'status-completed' : 'status-quoted';
                    html += `
                        <tr>
                            <td>${date}</td>
                            <td class="truncate" title="${data.origin || 'N/A'}">${data.origin || 'N/A'}</td>
                            <td class="truncate" title="${data.destination || 'N/A'}">${data.destination || 'N/A'}</td>
                            <td>${data.distance || 'N/A'}</td>
                            <td class="fare-amount">
                                ${data.fareXCD ? Math.round(Number(data.fareXCD)) + ' XCD' : ''}
                                ${data.fareUSD ? '/ $' + Math.round(Number(data.fareUSD)) + ' USD' : ''}
                            </td>
                            <td><span class="status-badge ${statusClass}">${status}</span></td>
                        </tr>
                    `;
                });
                html += '</tbody></table></div>';
                historyBody.innerHTML = html;
            },
            (error) => {
                // Use hideModal instead of closeModal
                hideModal('ride-history-modal');
                showToast("Failed to load ride history. Please try again.", "error");
            }
        );
        window.rideHistoryUnsubscribe = unsubscribe;
    } catch (error) {
        // Use hideModal instead of closeModal
        hideModal('ride-history-modal');
        showToast("Failed to load ride history. Please try again.", "error");
    }
}

export function setupHistoryListeners() {
    const navbarViewHistory = document.getElementById('navbar-view-history');
    if (navbarViewHistory) navbarViewHistory.addEventListener('click', showRideHistory);

    // OPTIONAL: Add a listener to unsubscribe when the modal is hidden
    // This is good practice to prevent memory leaks if the modal can be closed without logging out.
    const historyModalElement = document.getElementById('ride-history-modal');
    if (historyModalElement) {
        // Bootstrap's 'hidden.bs.modal' event fires when the modal has finished being hidden.
        historyModalElement.addEventListener('hidden.bs.modal', () => {
            if (window.rideHistoryUnsubscribe) {
                window.rideHistoryUnsubscribe();
                window.rideHistoryUnsubscribe = null; // Clear the reference
                console.log("Firestore ride history listener unsubscribed.");
            }
        });
    }
}