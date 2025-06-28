
export function showToast(message, type = "info", duration = 3500) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = "0";
        setTimeout(() => container.removeChild(toast), 400);
    }, duration);
}

export function showLoadingOverlay() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.classList.add('show');
}

export function hideLoadingOverlay() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.classList.remove('show');
}

export function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('show');
}

export function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('show');
}
window.closeModal = closeModal;

/**
 * Custom confirm modal.
 * Usage: await showConfirm("Are you sure?");
 * Returns: Promise<boolean>
 */
export function showConfirm(message) {
    return new Promise((resolve) => {
        // Remove any existing confirm modal
        let existing = document.getElementById('confirm-modal');
        if (existing) existing.remove();

        // Modal overlay
        const overlay = document.createElement('div');
        overlay.id = 'confirm-modal';
        overlay.className = 'modal-overlay';
        overlay.style.position = 'fixed';
        overlay.style.top = 0;
        overlay.style.left = 0;
        overlay.style.width = '100vw';
        overlay.style.height = '100vh';
        overlay.style.background = 'rgba(30,41,59,0.18)';
        overlay.style.zIndex = 3000;
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';

        // Modal content
        const modal = document.createElement('div');
        modal.className = 'modal-content';
        modal.style.background = '#fff';
        modal.style.borderRadius = '12px';
        modal.style.boxShadow = '0 2px 16px rgba(30,41,59,0.12)';
        modal.style.maxWidth = '350px';
        modal.style.width = '90vw';
        modal.style.padding = '2em 1.5em 1.5em 1.5em';
        modal.style.textAlign = 'center';
        modal.style.position = 'relative';

        // Message
        const msg = document.createElement('div');
        msg.style.marginBottom = '1.5em';
        msg.style.fontSize = '1.1em';
        msg.style.color = '#17446b';
        msg.textContent = message;

        // Buttons
        const btnWrap = document.createElement('div');
        btnWrap.style.display = 'flex';
        btnWrap.style.justifyContent = 'center';
        btnWrap.style.gap = '1em';

        const yesBtn = document.createElement('button');
        yesBtn.className = 'btn-primary';
        yesBtn.textContent = 'Yes';
        yesBtn.style.minWidth = '80px';

        const noBtn = document.createElement('button');
        noBtn.className = 'btn-secondary';
        noBtn.textContent = 'No';
        noBtn.style.minWidth = '80px';

        btnWrap.appendChild(yesBtn);
        btnWrap.appendChild(noBtn);

        modal.appendChild(msg);
        modal.appendChild(btnWrap);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // Focus for accessibility
        yesBtn.focus();

        // Button handlers
        yesBtn.onclick = () => {
            overlay.remove();
            resolve(true);
        };
        noBtn.onclick = () => {
            overlay.remove();
            resolve(false);
        };

        // ESC key closes as "No"
        overlay.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                overlay.remove();
                resolve(false);
            }
        });
        overlay.tabIndex = -1;
        overlay.focus();
    });
}