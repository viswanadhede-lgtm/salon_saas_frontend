import { hasSubFeature } from './sub-feature-manager.js';

export function applySubFeatureGates() {
    const gatedElements = document.querySelectorAll('[data-sub-feature]');

    if (gatedElements.length === 0) return;

    gatedElements.forEach(element => {
        const featureKey = element.getAttribute('data-sub-feature');
        if (!featureKey) return;

        // Attach click interceptor once per element to prevent duplicate handlers
        if (!element._subFeatureGateBound) {
            element._subFeatureGateBound = true;
            element.addEventListener('click', (e) => {
                if (element.classList.contains('sub-feature-locked')) {
                    e.preventDefault();
                    e.stopPropagation();
                    alert("Restricted Action: Your role does not have permission to perform this task.");
                }
            }, { capture: true });
        }

        const allowed = hasSubFeature(featureKey);
        const tagName = element.tagName.toLowerCase();

        if (allowed) {
            // UNLOCK STATE: dynamically remove locked state if previously locked
            if (element.classList.contains('sub-feature-locked')) {
                element.classList.remove('sub-feature-locked');
                element.style.opacity = '';
                element.style.cursor = '';

                if (['button', 'input', 'select', 'textarea'].includes(tagName)) {
                    element.disabled = false;
                }

                if (tagName === 'a' && element.dataset.originalHref) {
                    element.setAttribute('href', element.dataset.originalHref);
                }

                // Remove injected lock badge if present
                const badge = element.querySelector('.sub-feature-lock-badge');
                if (badge) {
                    badge.remove();
                }
            }
        } else {
            // LOCK STATE: apply visual and functional restriction
            element.classList.add('sub-feature-locked');
            element.style.opacity = '0.55';
            element.style.cursor = 'not-allowed';

            if (['button', 'input', 'select', 'textarea'].includes(tagName)) {
                element.disabled = true;
            }

            if (tagName === 'a') {
                if (!element.dataset.originalHref && element.hasAttribute('href')) {
                    element.dataset.originalHref = element.getAttribute('href');
                }
                element.removeAttribute('href');
            }

            // Inject tiny lock icon if not already present
            if (element.textContent.trim().length > 0 && tagName === 'button') {
                if (!element.querySelector('.sub-feature-lock-badge')) {
                    const lockBadge = document.createElement('span');
                    lockBadge.className = 'sub-feature-lock-badge';
                    lockBadge.style.cssText = 'font-size:0.85em; opacity:0.85; margin-left:4px; pointer-events:none;';
                    lockBadge.title = 'Locked by your Role';
                    lockBadge.textContent = '🔒';
                    element.appendChild(lockBadge);
                }
            }
        }

        element.setAttribute('data-sub-feature-initialized', 'true');
    });
}

// Auto-run when DOM is fully mapped
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applySubFeatureGates);
} else {
    applySubFeatureGates();
}

// Make accessible to non-module inline scripts
window.applySubFeatureGates = applySubFeatureGates;

