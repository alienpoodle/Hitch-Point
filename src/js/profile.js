import { db, auth } from './firebase.js';
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { showConfirm, showToast } from './ui.js'; 

const profileForm = document.getElementById('user-profile-form');
const firstNameInput = document.getElementById('profile-first-name');
const lastNameInput = document.getElementById('profile-last-name');
const phoneInput = document.getElementById('profile-phone');
const emailInput = document.getElementById('user-email');
const backBtn = document.getElementById('profile-back-btn');
const profileView = document.getElementById('profile-view');
const rideRequestSection = document.getElementById('ride-request-section');

let originalProfile = {};

function fillProfileForm(data, email) {
    if (!firstNameInput || !lastNameInput || !phoneInput || !emailInput) return;
    firstNameInput.value = data?.firstName || '';
    lastNameInput.value = data?.lastName || '';
    phoneInput.value = data?.phone || '';
    emailInput.value = email || data?.email || '';
    originalProfile = {
        firstName: firstNameInput.value,
        lastName: lastNameInput.value,
        phone: phoneInput.value,
        email: emailInput.value
    };
}

function resetProfileForm() {
    fillProfileForm(originalProfile, originalProfile.email);
}

export function initProfileFeature() {
    onAuthStateChanged(auth, async user => {
        if (user && profileForm && firstNameInput && lastNameInput && phoneInput && emailInput && backBtn) {
            // Always use Google account email, never allow editing - to be revised
            emailInput.value = user.email || '';
            emailInput.readOnly = true;
            emailInput.setAttribute('readonly', 'readonly');
            emailInput.classList.add('readonly');

            // Load profile from Firestore
            const docRef = doc(db, "users", user.uid);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                fillProfileForm(docSnap.data(), user.email);
            } else {
                fillProfileForm({}, user.email);
            }

            profileForm.onsubmit = async (e) => {
                e.preventDefault();
                const confirmed = await showConfirm("Are you sure you want to save these changes to your profile?");
                if (!confirmed) return;

                const firstName = firstNameInput.value.trim();
                const lastName = lastNameInput.value.trim();
                const phone = phoneInput.value.trim();
                const email = user.email; // Always use Google email

                try {
                    await setDoc(doc(db, "users", user.uid), {
                        firstName,
                        lastName,
                        phone,
                        email
                    }, { merge: true });

                    showToast("Profile saved!", "success");
                    originalProfile = { firstName, lastName, phone, email };
                } catch (error) {
                    showToast("Error saving profile: " + error.message, "error");
                }
            };

            backBtn.onclick = async (e) => {
                e.preventDefault();
                const confirmed = typeof showConfirm === "function"
                    ? await showConfirm("Discard changes to your profile?")
                    : confirm("Discard changes to your profile?");
                if (confirmed) {
                    resetProfileForm();
                    // Hide profile, show ride request section
                    if (profileView && rideRequestSection) {
                        profileView.classList.add('hidden');
                        rideRequestSection.classList.remove('hidden');
                    }
                }
            };
        }
    });
}