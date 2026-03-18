import { hasFeature, isSubscriptionReady } from './subscription-manager.js';
import { showUpgradeModal } from './upgrade-modal.js';

/**
 * Scans the DOM for elements with the `data-feature` attribute and enforces
 * feature gating based on the current subscription state.
 */
export function applyFeatureGates() {
    // Only proceed if the DOM is ready and subscription data is loaded
    if (!isSubscriptionReady()) {
        console.warn('Feature gates skipped: Subscription is not yet ready.');
        return;
    }

    const gatedElements = document.querySelectorAll('[data-feature]');

    if (gatedElements.length === 0) return;

    gatedElements.forEach(element => {
        // Prevent duplicate processing
        if (element.getAttribute('data-feature-gate-initialized') === 'true') {
            return;
        }

        const featureKey = element.getAttribute('data-feature');

        if (!featureKey) return;

        if (!hasFeature(featureKey)) {
            // Apply visual locked state
            element.classList.add('feature-locked');

            // Disable standard interactive elements and links
            const tagName = element.tagName.toLowerCase();
            if (['button', 'input', 'select', 'textarea'].includes(tagName)) {
                element.disabled = true;
            }

            if (tagName === 'a') {
                element.removeAttribute('href');
            }

            // Intercept clicks to show the upgrade modal
            // Note: capturing listener ensures we stop other events even if it's not a disabled button
            element.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                showUpgradeModal(featureKey);
            }, { capture: true });
        }

        // Mark as processed
        element.setAttribute('data-feature-gate-initialized', 'true');
    });
}

/**
 * Auto-initialization logic
 * Attempts to apply gates once the DOM is loaded. If subscription isn't ready,
 * it sets up a brief polling mechanism or assumes the app will call applyFeatureGates()
 * manually once data is fetched.
 */
function initFeatureGating() {
    const tryApply = () => {
        if (isSubscriptionReady()) {
            applyFeatureGates();
        } else {
            // If subscription isn't ready on DOM load (e.g., async fetch), 
            // the platform's API/auth layer should explicitly call applyFeatureGates() 
            // after calling initializeSubscription().
            // For safety, we can try a few times or just wait for the explicit call.
            console.info('Feature gating waiting for subscription data...');
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', tryApply);
    } else {
        tryApply();
    }
}

// Run the auto-init on script load
initFeatureGating();
