import { hasSubFeature } from './sub-feature-manager.js';

export function applySubFeatureGates() {
    const gatedElements = document.querySelectorAll('[data-sub-feature]');

    if (gatedElements.length === 0) return;

    gatedElements.forEach(element => {
        if (element.getAttribute('data-sub-feature-initialized') === 'true') {
            return;
        }

        const featureKey = element.getAttribute('data-sub-feature');
        if (!featureKey) return;

        if (!hasSubFeature(featureKey)) {
            // Apply visual locked state (can be styled via CSS later: opacity:0.6, cursor:not-allowed)
            element.classList.add('sub-feature-locked');
            element.style.opacity = '0.55';
            element.style.cursor = 'not-allowed';
            
            // Disable natively if possible
            const tagName = element.tagName.toLowerCase();
            if (['button', 'input', 'select', 'textarea'].includes(tagName)) {
                element.disabled = true;
            }

            if (tagName === 'a') {
                element.removeAttribute('href');
            }

            // Optional: inject a tiny lock icon to make the restriction visually obvious
            if (element.textContent.trim().length > 0 && tagName === 'button') {
                 element.innerHTML += ' <span style="font-size:0.85em; opacity:0.85; margin-left:4px;" title="Locked by your Role">🔒</span>';
            }

            // Intercept clicks to stop default action completely
            element.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                // Show a quick generic lock message
                alert("Restricted Action: Your role does not have permission to perform this task.");
            }, { capture: true });
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
