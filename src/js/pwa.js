import { showToast } from './ui.js';

let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const installBtn = document.getElementById('install-pwa-btn');
    if (installBtn) installBtn.classList.remove('hidden');
});

export function setupPWA() {
    const installBtn = document.getElementById('install-pwa-btn');
    if (installBtn) {
        installBtn.addEventListener('click', async () => {
            if (!deferredPrompt) {
                showToast("App is already installed or not available for installation.", "info");
                return;
            }
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') {
                showToast("App installed successfully!", "success");
            }
            deferredPrompt = null;
            installBtn.classList.add('hidden');
        });
    }
}