import { hasPermission, isRoleReady } from './role-manager.js';

/**
 * Scans the DOM for elements with the `data-permission` attribute and enforces
 * role-based gating. Elements without the required permission are visually hidden.
 */
export function applyRoleGates() {
    // Only proceed if the DOM is ready and the user's role has been loaded
    if (!isRoleReady()) {
        console.warn('Role gates skipped: Role system is not yet initialized.');
        return;
    }

    const gatedElements = document.querySelectorAll('[data-permission]');

    if (gatedElements.length === 0) return;

    gatedElements.forEach(element => {
        // Prevent duplicate processing
        if (element.dataset.roleGateInitialized === 'true') {
            return;
        }

        const permissionKey = element.getAttribute('data-permission');

        if (!permissionKey) return; 

        if (!hasPermission(permissionKey)) {
            // Unlink feature-gating, role-gating generally hides the element silently
            // so unauthorized staff do not simply see disabled UI paths
            element.classList.add('role-locked');
            
            // Preserve original display in case of dynamic re-rendering
            element.dataset.originalDisplay = element.style.display;
            element.style.display = 'none';
        }

        // Mark as processed
        element.dataset.roleGateInitialized = 'true';
    });
}

/**
 * Auto-initialization logic
 * Attempts to apply role gates once the DOM is loaded. If the role isn't ready,
 * it expects the authentication/authorization layer to explicitly invoke
 * applyRoleGates() after calling initializeRole().
 */
function initRoleGating() {
    const tryApply = () => {
        if (isRoleReady()) {
            applyRoleGates();
        } else {
            console.info('Role gating waiting for user role to initialize...');
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', tryApply);
    } else {
        tryApply();
    }
}

// Automatically bind and attempt gating on script load
initRoleGating();
