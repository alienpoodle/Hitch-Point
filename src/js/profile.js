import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { showConfirm, showToast } from './ui.js'; 

let db, auth;

const profileForm = document.getElementById('user-profile-form');
const firstNameInput = document.getElementById('profile-first-name');
const lastNameInput = document.getElementById('profile-last-name');
const phoneInput = document.getElementById('profile-phone');
const emailInput = document.getElementById('user-email');
const backBtn = document.getElementById('profile-back-btn');

let originalProfile = {};

function fillProfileForm(data, email) {
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
    db = getFirestore();
    auth = getAuth();

    onAuthStateChanged(auth, async user => {
        if (user && profileForm) {
            // Always use Google account email, never allow editing
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
                const email = user.email; // always use Google email

                try {
                    await setDoc(doc(db, "users", user.uid), {
                        uid: user.uid,
                        firstName,
                        lastName,
                        phone,
                        email
                    }, { merge: true }); // merge: true preserves role and other fields

                    showToast("Profile saved!", "success");
                    originalProfile = { firstName, lastName, phone, email };
                } catch (error) {
                    showToast("Error saving profile: " + error.message, "error");
                }
            };

            backBtn.onclick = async (e) => {
                e.preventDefault();
                const confirmed = await showConfirm("Discard changes to your profile?");
                if (confirmed) {
                    resetProfileForm();
                }
            };
        }
    });
}