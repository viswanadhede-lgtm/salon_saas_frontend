// scripts/invoice-state.js
// Invoice display configuration state.
// getInvoiceConfig() returns the layout/display toggles used by booking-invoice-engine.js
// when rendering printed invoices and the in-modal invoice preview.

/**
 * Returns the current invoice configuration with display flags.
 * All flags default to ON so invoices look complete out-of-the-box.
 *
 * Future: load from localStorage / supabase settings so the owner can
 * customise their invoice layout from the Settings page.
 *
 * @returns {{
 *   header:   { showLogo: boolean, showDisplayName: boolean, showLegalName: boolean,
 *               showBranchName: boolean, showAddress: boolean, showPhone: boolean, showGstin: boolean },
 *   customer: { showName: boolean, showPhone: boolean },
 *   booking:  { showAppointmentDate: boolean, showAppointmentTime: boolean },
 *   totals:   { showDiscount: boolean, showPaymentMethod: boolean },
 *   footer:   { showThankYou: boolean, thankYouMessage: string, showTerms: boolean, termsText: string }
 * }}
 */
export function getInvoiceConfig() {
    // Try to load persisted settings from localStorage (set by settings page, if implemented)
    try {
        const saved = localStorage.getItem('invoiceConfig');
        if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed && typeof parsed === 'object') return parsed;
        }
    } catch {
        // ignore parse errors — fall through to defaults
    }

    return {
        header: {
            showLogo:        true,
            showDisplayName: true,
            showLegalName:   false,
            showBranchName:  true,
            showAddress:     true,
            showPhone:       true,
            showGstin:       true,
        },
        customer: {
            showName:  true,
            showPhone: true,
        },
        booking: {
            showAppointmentDate: true,
            showAppointmentTime: true,
        },
        totals: {
            showDiscount:      true,
            showPaymentMethod: true,
        },
        footer: {
            showThankYou:    true,
            thankYouMessage: 'Thank you for visiting us! We hope to see you again.',
            showTerms:       false,
            termsText:       'All services are non-refundable once rendered.',
        },
    };
}

/**
 * Persist a custom invoice config to localStorage.
 * @param {object} config - Full config object matching the shape above.
 */
export function setInvoiceConfig(config) {
    try {
        localStorage.setItem('invoiceConfig', JSON.stringify(config));
    } catch {
        console.warn('[invoice-state] Could not persist invoice config:', config);
    }
}
