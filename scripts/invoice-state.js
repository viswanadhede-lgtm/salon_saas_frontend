/**
 * ── invoice-state.js ────────────────────────────────────────────────────────
 * Unified Frontend State Manager and Live Preview Renderer for BharathBots Invoices.
 * (V1 Frontend Architecture - Cascades Common settings to Booking, POS, and Membership)
 * ────────────────────────────────────────────────────────────────────────────
 */

import { supabase } from '../lib/supabase.js';

const STORAGE_KEY = 'bharathbots_invoice_config';

export function getCompanyId() {
    try {
        const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
        return ctx.company?.company_id || ctx.company?.id || localStorage.getItem('company_id') || null;
    } catch {
        return localStorage.getItem('company_id') || null;
    }
}

export async function getBranchId(companyId) {
    let bId = localStorage.getItem('active_branch_id');
    if (bId && bId !== 'Downtown Branch' && bId !== 'all') return bId;
    try {
        const ctx = JSON.parse(localStorage.getItem('appContext') || '{}');
        if (ctx.current_branch_id) return ctx.current_branch_id;
        if (ctx.branches && ctx.branches.length > 0 && (ctx.branches[0].id || ctx.branches[0].branch_id)) {
            return ctx.branches[0].id || ctx.branches[0].branch_id;
        }
    } catch {}
    if (companyId) {
        const { data: bList } = await supabase
            .from('branches')
            .select('branch_id')
            .eq('company_id', companyId)
            .limit(1);
        if (bList && bList.length > 0 && bList[0].branch_id) {
            localStorage.setItem('active_branch_id', bList[0].branch_id);
            return bList[0].branch_id;
        }
    }
    return null;
}

export const DEFAULT_INVOICE_CONFIG = {
    // 4A. Invoice Numbering (Shared sequence for Bookings, POS, Memberships)
    prefix: 'INV-',
    startingNumber: '1001',

    // 4B. Common Header Content
    header: {
        showLogo: true,
        showLegalName: false,
        showDisplayName: true,
        showBranchName: true,
        showAddress: true,
        showPhone: true,
        showEmail: false,
        showWebsite: false,
        showGstin: true,
        showPan: false,
    },

    // 4C. Customer Information
    customer: {
        showName: true,
        showPhone: true,
        showEmail: false,
        showAddress: false,
    },

    // 4D. Common Transaction Information
    transaction: {
        showInvoiceNumber: true,
        showInvoiceDate: true,
        showPaymentDate: false,
        showBranchName: true,
        showStaffName: true,
        showPaymentMethod: true,
    },

    // 4E. Items / Services Table
    items: {
        showItemName: true,
        showQuantity: true,
        showStaff: false,
        showUnitPrice: true,
        showDiscount: true,
        showTax: true,
        showTaxRate: false,
        showLineTotal: true,
    },

    // 4F. Totals & Payment
    totals: {
        showSubtotal: true,
        showDiscount: true,
        showTax: true,
        showRoundoff: false,
        showTotal: true,
        showAmountPaid: true,
        showBalanceDue: true,
        showPaymentMethod: true,
        showTransactionRef: false,
    },

    // 4G. Common Footer
    footer: {
        showThankYou: true,
        thankYouMessage: 'Thank you for visiting us. We look forward to seeing you again!',
        showTerms: false,
        termsText: 'Payment is due upon receipt. Goods/Services once sold are non-refundable.',
        showCancellationPolicy: false,
        cancellationPolicyText: 'Cancellations within 24 hours of appointment may incur a fee.',
        showPaymentInstructions: false,
        paymentInstructionsText: 'UPI ID: glowsalon@upi | Bank: HDFC Bank A/C 50200012345678',
        showContactInfo: true,
        showSocialMedia: false,
        socialHandle: '@glowsalon_official',
        customFooterMessage: '',
    },

    // 5. Booking-Specific Settings
    booking: {
        showAppointmentNumber: true,
        showAppointmentDate: true,
        showAppointmentTime: true,
        showServiceName: true,
        showServiceDuration: true,
        showStylistName: true,
        showBranchName: true,
        showBookingNotes: false,
        bookingNotesText: 'Please arrive 10 minutes prior to appointment time.',
    },

    // 6. POS-Specific Settings
    pos: {
        showProductName: true,
        showSku: true,
        showQuantity: true,
        showUnitPrice: true,
        showDiscount: true,
        showTax: true,
        showCashierStaff: true,
        showPosTransactionNo: true,
        showPaymentRef: false,
    },

    // 7. Membership-Specific Settings
    membership: {
        showMembershipName: true,
        showPlan: true,
        showStartDate: true,
        showExpiryDate: true,
        showDuration: true,
        showPrice: true,
        showDiscount: true,
        showBenefits: true,
        showMembershipRef: true,
    }
};

// ── Load & Save Helpers ──────────────────────────────────────────────────────
export function getInvoiceConfig() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) return JSON.parse(JSON.stringify(DEFAULT_INVOICE_CONFIG));
        const parsed = JSON.parse(stored);
        return deepMerge(JSON.parse(JSON.stringify(DEFAULT_INVOICE_CONFIG)), parsed);
    } catch (e) {
        console.warn('[invoice-state] Error reading invoice config:', e);
        return JSON.parse(JSON.stringify(DEFAULT_INVOICE_CONFIG));
    }
}

export function saveInvoiceConfig(config) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
        return true;
    } catch (e) {
        console.error('[invoice-state] Error saving invoice config:', e);
        return false;
    }
}

function deepMerge(target, source) {
    for (const key of Object.keys(source)) {
        if (source[key] instanceof Object && key in target && target[key] instanceof Object) {
            Object.assign(source[key], deepMerge(target[key], source[key]));
        }
    }
    Object.assign(target || {}, source);
    return target;
}

// ── Database Row Mapping Helpers ──────────────────────────────────────────
export function mapRowsToConfig(rows, invoiceType, baseConfig = null) {
    const cfg = baseConfig ? JSON.parse(JSON.stringify(baseConfig)) : getInvoiceConfig();
    if (!Array.isArray(rows) || rows.length === 0) return cfg;

    rows.forEach(r => {
        const key = r.setting_key;
        const val = r.setting_value;
        const enabled = !!r.enabled;

        if (r.invoice_type === 'common' || invoiceType === 'common') {
            // A. Invoice Numbering
            if (key === 'invoice_prefix' && val !== null) cfg.prefix = val;
            if (key === 'starting_invoice_number' && val !== null) cfg.startingNumber = val;

            // B. Header
            if (key === 'business_logo') cfg.header.showLogo = enabled;
            if (key === 'display_brand_name') cfg.header.showDisplayName = enabled;
            if (key === 'legal_business_name') cfg.header.showLegalName = enabled;
            if (key === 'branch_name') cfg.header.showBranchName = enabled;
            if (key === 'business_address') cfg.header.showAddress = enabled;
            if (key === 'business_phone_number') cfg.header.showPhone = enabled;
            if (key === 'email_address') cfg.header.showEmail = enabled;
            if (key === 'website') cfg.header.showWebsite = enabled;
            if (key === 'gstin') cfg.header.showGstin = enabled;
            if (key === 'pan') cfg.header.showPan = enabled;

            // C. Customer Info
            if (key === 'customer_name') cfg.customer.showName = enabled;
            if (key === 'customer_phone_number') cfg.customer.showPhone = enabled;
            if (key === 'customer_email') cfg.customer.showEmail = enabled;
            if (key === 'customer_address') cfg.customer.showAddress = enabled;

            // D. Transaction Info
            if (key === 'invoice_number') cfg.transaction.showInvoiceNumber = enabled;
            if (key === 'invoice_date') cfg.transaction.showInvoiceDate = enabled;
            if (key === 'payment_date') cfg.transaction.showPaymentDate = enabled;
            if (key === 'staff_stylist_name') cfg.transaction.showStaffName = enabled;
            if (key === 'payment_method') cfg.transaction.showPaymentMethod = enabled;

            // E. Items / Services
            if (key === 'item_service_name') cfg.items.showItemName = enabled;
            if (key === 'quantity') cfg.items.showQuantity = enabled;
            if (key === 'unit_price') cfg.items.showUnitPrice = enabled;
            if (key === 'tax_amount') cfg.items.showTax = enabled;
            if (key === 'tax_rate') cfg.items.showTaxRate = enabled;
            if (key === 'line_total') cfg.items.showLineTotal = enabled;

            // F. Totals / Payment
            if (key === 'subtotal') cfg.totals.showSubtotal = enabled;
            if (key === 'total_tax') cfg.totals.showTax = enabled;
            if (key === 'round_off') cfg.totals.showRoundoff = enabled;
            if (key === 'grand_total') cfg.totals.showTotal = enabled;
            if (key === 'amount_paid') cfg.totals.showAmountPaid = enabled;
            if (key === 'balance_due') cfg.totals.showBalanceDue = enabled;

            // G. Footer
            if (key === 'thank_you_message') {
                cfg.footer.showThankYou = enabled;
                if (val !== null) cfg.footer.thankYouMessage = val;
            }
            if (key === 'terms_and_conditions') {
                cfg.footer.showTerms = enabled;
                if (val !== null) cfg.footer.termsText = val;
            }
            if (key === 'payment_instructions') {
                cfg.footer.showPaymentInstructions = enabled;
                if (val !== null) cfg.footer.paymentInstructionsText = val;
            }
            if (key === 'custom_footer_note') {
                if (val !== null) cfg.footer.customFooterMessage = val;
            }
        }
        
        if (r.invoice_type === 'booking') {
            if (key === 'appointment_booking_number') cfg.booking.showAppointmentNumber = enabled;
            if (key === 'appointment_date') cfg.booking.showAppointmentDate = enabled;
            if (key === 'appointment_time') cfg.booking.showAppointmentTime = enabled;
            if (key === 'service_duration') cfg.booking.showServiceDuration = enabled;
            if (key === 'staff_stylist_name') cfg.booking.showStylistName = enabled;
            if (key === 'branch_name') cfg.booking.showBranchName = enabled;
            if (key === 'booking_notes') {
                cfg.booking.showBookingNotes = enabled;
                if (val !== null) cfg.booking.bookingNotesText = val;
            }
        } else if (r.invoice_type === 'pos') {
            if (key === 'product_name') cfg.pos.showProductName = enabled;
            if (key === 'product_sku_barcode') cfg.pos.showSku = enabled;
            if (key === 'cashier_staff_name') cfg.pos.showCashierStaff = enabled;
            if (key === 'pos_transaction_number') cfg.pos.showPosTransactionNo = enabled;
            if (key === 'payment_reference_number') cfg.pos.showPaymentRef = enabled;
        } else if (r.invoice_type === 'membership') {
            if (key === 'membership_tier_name') cfg.membership.showMembershipName = enabled;
            if (key === 'membership_plan_details') cfg.membership.showPlan = enabled;
            if (key === 'validity_duration') cfg.membership.showDuration = enabled;
            if (key === 'start_date') cfg.membership.showStartDate = enabled;
            if (key === 'expiry_date') cfg.membership.showExpiryDate = enabled;
            if (key === 'member_reference_id') cfg.membership.showMembershipRef = enabled;
        }
    });

    return cfg;
}

export function buildRowsFromConfig(companyId, branchId, invoiceType, config) {
    const rows = [];
    const cfg = config || getInvoiceConfig();

    if (invoiceType === 'common') {
        // A. Numbering
        rows.push({ company_id: companyId, branch_id: branchId, invoice_type: 'common', setting_key: 'invoice_prefix', setting_value: cfg.prefix || 'INV-', enabled: true });
        rows.push({ company_id: companyId, branch_id: branchId, invoice_type: 'common', setting_key: 'starting_invoice_number', setting_value: String(cfg.startingNumber || '1001'), enabled: true });

        // B. Header
        rows.push({ company_id: companyId, branch_id: branchId, invoice_type: 'common', setting_key: 'business_logo', setting_value: null, enabled: !!cfg.header.showLogo });
        rows.push({ company_id: companyId, branch_id: branchId, invoice_type: 'common', setting_key: 'display_brand_name', setting_value: null, enabled: !!cfg.header.showDisplayName });
        rows.push({ company_id: companyId, branch_id: branchId, invoice_type: 'common', setting_key: 'legal_business_name', setting_value: null, enabled: !!cfg.header.showLegalName });
        rows.push({ company_id: companyId, branch_id: branchId, invoice_type: 'common', setting_key: 'branch_name', setting_value: null, enabled: !!cfg.header.showBranchName });
        rows.push({ company_id: companyId, branch_id: branchId, invoice_type: 'common', setting_key: 'business_address', setting_value: null, enabled: !!cfg.header.showAddress });
        rows.push({ company_id: companyId, branch_id: branchId, invoice_type: 'common', setting_key: 'business_phone_number', setting_value: null, enabled: !!cfg.header.showPhone });
        rows.push({ company_id: companyId, branch_id: branchId, invoice_type: 'common', setting_key: 'email_address', setting_value: null, enabled: !!cfg.header.showEmail });
        rows.push({ company_id: companyId, branch_id: branchId, invoice_type: 'common', setting_key: 'website', setting_value: null, enabled: !!cfg.header.showWebsite });
        rows.push({ company_id: companyId, branch_id: branchId, invoice_type: 'common', setting_key: 'gstin', setting_value: null, enabled: !!cfg.header.showGstin });
        rows.push({ company_id: companyId, branch_id: branchId, invoice_type: 'common', setting_key: 'pan', setting_value: null, enabled: !!cfg.header.showPan });

        // C. Customer Information
        rows.push({ company_id: companyId, branch_id: branchId, invoice_type: 'common', setting_key: 'customer_name', setting_value: null, enabled: !!cfg.customer.showName });
        rows.push({ company_id: companyId, branch_id: branchId, invoice_type: 'common', setting_key: 'customer_phone_number', setting_value: null, enabled: !!cfg.customer.showPhone });
        rows.push({ company_id: companyId, branch_id: branchId, invoice_type: 'common', setting_key: 'customer_email', setting_value: null, enabled: !!cfg.customer.showEmail });
        rows.push({ company_id: companyId, branch_id: branchId, invoice_type: 'common', setting_key: 'customer_address', setting_value: null, enabled: !!cfg.customer.showAddress });

        // D. Transaction Information
        rows.push({ company_id: companyId, branch_id: branchId, invoice_type: 'common', setting_key: 'invoice_number', setting_value: null, enabled: !!cfg.transaction.showInvoiceNumber });
        rows.push({ company_id: companyId, branch_id: branchId, invoice_type: 'common', setting_key: 'invoice_date', setting_value: null, enabled: !!cfg.transaction.showInvoiceDate });
        rows.push({ company_id: companyId, branch_id: branchId, invoice_type: 'common', setting_key: 'payment_date', setting_value: null, enabled: !!cfg.transaction.showPaymentDate });
        rows.push({ company_id: companyId, branch_id: branchId, invoice_type: 'common', setting_key: 'staff_stylist_name', setting_value: null, enabled: !!cfg.transaction.showStaffName });
        rows.push({ company_id: companyId, branch_id: branchId, invoice_type: 'common', setting_key: 'payment_method', setting_value: null, enabled: !!cfg.transaction.showPaymentMethod });

        // E. Items / Services
        rows.push({ company_id: companyId, branch_id: branchId, invoice_type: 'common', setting_key: 'item_service_name', setting_value: null, enabled: !!cfg.items.showItemName });
        rows.push({ company_id: companyId, branch_id: branchId, invoice_type: 'common', setting_key: 'quantity', setting_value: null, enabled: !!cfg.items.showQuantity });
        rows.push({ company_id: companyId, branch_id: branchId, invoice_type: 'common', setting_key: 'unit_price', setting_value: null, enabled: !!cfg.items.showUnitPrice });
        rows.push({ company_id: companyId, branch_id: branchId, invoice_type: 'common', setting_key: 'tax_amount', setting_value: null, enabled: !!cfg.items.showTax });
        rows.push({ company_id: companyId, branch_id: branchId, invoice_type: 'common', setting_key: 'tax_rate', setting_value: null, enabled: !!cfg.items.showTaxRate });
        rows.push({ company_id: companyId, branch_id: branchId, invoice_type: 'common', setting_key: 'line_total', setting_value: null, enabled: !!cfg.items.showLineTotal });

        // F. Totals / Payment
        rows.push({ company_id: companyId, branch_id: branchId, invoice_type: 'common', setting_key: 'subtotal', setting_value: null, enabled: !!cfg.totals.showSubtotal });
        rows.push({ company_id: companyId, branch_id: branchId, invoice_type: 'common', setting_key: 'total_tax', setting_value: null, enabled: !!cfg.totals.showTax });
        rows.push({ company_id: companyId, branch_id: branchId, invoice_type: 'common', setting_key: 'round_off', setting_value: null, enabled: !!cfg.totals.showRoundoff });
        rows.push({ company_id: companyId, branch_id: branchId, invoice_type: 'common', setting_key: 'grand_total', setting_value: null, enabled: !!cfg.totals.showTotal });
        rows.push({ company_id: companyId, branch_id: branchId, invoice_type: 'common', setting_key: 'amount_paid', setting_value: null, enabled: !!cfg.totals.showAmountPaid });
        rows.push({ company_id: companyId, branch_id: branchId, invoice_type: 'common', setting_key: 'balance_due', setting_value: null, enabled: !!cfg.totals.showBalanceDue });

        // G. Footer
        rows.push({ company_id: companyId, branch_id: branchId, invoice_type: 'common', setting_key: 'thank_you_message', setting_value: cfg.footer.thankYouMessage || '', enabled: !!cfg.footer.showThankYou });
        rows.push({ company_id: companyId, branch_id: branchId, invoice_type: 'common', setting_key: 'terms_and_conditions', setting_value: cfg.footer.termsText || '', enabled: !!cfg.footer.showTerms });
        rows.push({ company_id: companyId, branch_id: branchId, invoice_type: 'common', setting_key: 'payment_instructions', setting_value: cfg.footer.paymentInstructionsText || '', enabled: !!cfg.footer.showPaymentInstructions });
        rows.push({ company_id: companyId, branch_id: branchId, invoice_type: 'common', setting_key: 'custom_footer_note', setting_value: cfg.footer.customFooterMessage || '', enabled: true });
    } else if (invoiceType === 'booking') {
        rows.push({ company_id: companyId, branch_id: branchId, invoice_type: 'booking', setting_key: 'appointment_booking_number', setting_value: null, enabled: !!cfg.booking.showAppointmentNumber });
        rows.push({ company_id: companyId, branch_id: branchId, invoice_type: 'booking', setting_key: 'appointment_date', setting_value: null, enabled: !!cfg.booking.showAppointmentDate });
        rows.push({ company_id: companyId, branch_id: branchId, invoice_type: 'booking', setting_key: 'appointment_time', setting_value: null, enabled: !!cfg.booking.showAppointmentTime });
        rows.push({ company_id: companyId, branch_id: branchId, invoice_type: 'booking', setting_key: 'service_duration', setting_value: null, enabled: !!cfg.booking.showServiceDuration });
        rows.push({ company_id: companyId, branch_id: branchId, invoice_type: 'booking', setting_key: 'staff_stylist_name', setting_value: null, enabled: !!cfg.booking.showStylistName });
        rows.push({ company_id: companyId, branch_id: branchId, invoice_type: 'booking', setting_key: 'branch_name', setting_value: null, enabled: !!cfg.booking.showBranchName });
        rows.push({ company_id: companyId, branch_id: branchId, invoice_type: 'booking', setting_key: 'booking_notes', setting_value: cfg.booking.bookingNotesText || '', enabled: !!cfg.booking.showBookingNotes });
    } else if (invoiceType === 'pos') {
        rows.push({ company_id: companyId, branch_id: branchId, invoice_type: 'pos', setting_key: 'product_name', setting_value: null, enabled: !!cfg.pos.showProductName });
        rows.push({ company_id: companyId, branch_id: branchId, invoice_type: 'pos', setting_key: 'product_sku_barcode', setting_value: null, enabled: !!cfg.pos.showSku });
        rows.push({ company_id: companyId, branch_id: branchId, invoice_type: 'pos', setting_key: 'cashier_staff_name', setting_value: null, enabled: !!cfg.pos.showCashierStaff });
        rows.push({ company_id: companyId, branch_id: branchId, invoice_type: 'pos', setting_key: 'pos_transaction_number', setting_value: null, enabled: !!cfg.pos.showPosTransactionNo });
        rows.push({ company_id: companyId, branch_id: branchId, invoice_type: 'pos', setting_key: 'payment_reference_number', setting_value: null, enabled: !!cfg.pos.showPaymentRef });
    } else if (invoiceType === 'membership') {
        rows.push({ company_id: companyId, branch_id: branchId, invoice_type: 'membership', setting_key: 'membership_tier_name', setting_value: null, enabled: !!cfg.membership.showMembershipName });
        rows.push({ company_id: companyId, branch_id: branchId, invoice_type: 'membership', setting_key: 'membership_plan_details', setting_value: null, enabled: !!cfg.membership.showPlan });
        rows.push({ company_id: companyId, branch_id: branchId, invoice_type: 'membership', setting_key: 'validity_duration', setting_value: null, enabled: !!cfg.membership.showDuration });
        rows.push({ company_id: companyId, branch_id: branchId, invoice_type: 'membership', setting_key: 'start_date', setting_value: null, enabled: !!cfg.membership.showStartDate });
        rows.push({ company_id: companyId, branch_id: branchId, invoice_type: 'membership', setting_key: 'expiry_date', setting_value: null, enabled: !!cfg.membership.showExpiryDate });
        rows.push({ company_id: companyId, branch_id: branchId, invoice_type: 'membership', setting_key: 'member_reference_id', setting_value: null, enabled: !!cfg.membership.showMembershipRef });
    }

    return rows;
}

// ── Supabase Load & Save Functions ──────────────────────────────────────────
export async function loadInvoiceSettingsFromDB(invoiceType) {
    const companyId = getCompanyId();
    if (!companyId) return getInvoiceConfig();
    const branchId = await getBranchId(companyId);

    try {
        let query = supabase
            .from('invoice_settings')
            .select('*')
            .eq('company_id', companyId);

        if (branchId) {
            query = query.eq('branch_id', branchId);
        }

        // Always also include common settings if on a sub-invoice page so inherited branding cascades
        if (invoiceType && invoiceType !== 'common') {
            query = query.in('invoice_type', [invoiceType, 'common']);
        } else if (invoiceType) {
            query = query.eq('invoice_type', invoiceType);
        }

        const { data: rows, error } = await query;
        if (error) {
            console.warn('[invoice-state] Error loading invoice settings from DB:', error);
            return getInvoiceConfig();
        }

        let cfg = getInvoiceConfig();
        if (rows && rows.length > 0) {
            // Apply common rows first
            const commonRows = rows.filter(r => r.invoice_type === 'common');
            if (commonRows.length > 0) {
                cfg = mapRowsToConfig(commonRows, 'common', cfg);
            }
            // Apply specific type rows
            if (invoiceType && invoiceType !== 'common') {
                const specificRows = rows.filter(r => r.invoice_type === invoiceType);
                if (specificRows.length > 0) {
                    cfg = mapRowsToConfig(specificRows, invoiceType, cfg);
                }
            }
            saveInvoiceConfig(cfg);
            if (branchId) {
                localStorage.setItem(`bharathbots_invoice_config_${companyId}_${branchId}`, JSON.stringify(cfg));
            }
        }
        return cfg;
    } catch (err) {
        console.error('[invoice-state] Unexpected load error:', err);
        return getInvoiceConfig();
    }
}

export async function saveInvoiceSettingsToDB(invoiceType, config) {
    const companyId = getCompanyId();
    if (!companyId) throw new Error('No company ID found. Please log in.');
    const branchId = await getBranchId(companyId);
    if (!branchId) throw new Error('No active branch found. Please select a branch.');

    const rows = buildRowsFromConfig(companyId, branchId, invoiceType, config);
    console.log(`[invoice-state] Saving ${rows.length} rows for type=${invoiceType}, branch=${branchId}`);

    // Upsert using the unique constraint on (company_id, branch_id, invoice_type, setting_key)
    const { data, error } = await supabase
        .from('invoice_settings')
        .upsert(rows, { onConflict: 'company_id,branch_id,invoice_type,setting_key' });

    if (error) {
        console.error('[invoice-state] Supabase save error:', error);
        throw error;
    }

    saveInvoiceConfig(config);
    localStorage.setItem(`bharathbots_invoice_config_${companyId}_${branchId}`, JSON.stringify(config));
    return true;
}

export async function loadBusinessPreviewData() {
    try {
        const companyId = getCompanyId();
        if (!companyId) return;
        const branchId = await getBranchId(companyId);

        // 1. Company Settings
        const { data: cSettings } = await supabase
            .from('company_settings')
            .select('display_name, legal_business_name, website, logo_url')
            .eq('company_id', companyId)
            .maybeSingle();

        if (cSettings) {
            if (cSettings.display_name) SAMPLE_COMPANY.brandName = cSettings.display_name;
            if (cSettings.legal_business_name) SAMPLE_COMPANY.legalName = cSettings.legal_business_name;
            if (cSettings.website) SAMPLE_COMPANY.website = cSettings.website;
            if (cSettings.logo_url) SAMPLE_COMPANY.logoUrl = cSettings.logo_url;
        }

        // 2. Branch Info
        if (branchId) {
            const { data: bData } = await supabase
                .from('branches')
                .select('branch_name, address, phone')
                .eq('branch_id', branchId)
                .maybeSingle();

            if (bData) {
                if (bData.branch_name) SAMPLE_COMPANY.branchName = bData.branch_name;
                if (bData.address) SAMPLE_COMPANY.address = bData.address;
                if (bData.phone) SAMPLE_COMPANY.phone = bData.phone;
            }
        }

        // 3. Tax Settings
        const { data: tData } = await supabase
            .from('company_tax_settings')
            .select('gstin, pan')
            .eq('company_id', companyId)
            .maybeSingle();

        if (tData) {
            if (tData.gstin) SAMPLE_COMPANY.gstin = tData.gstin;
            if (tData.pan) SAMPLE_COMPANY.pan = tData.pan;
        }

        // 4. Company Contacts
        const { data: ctData } = await supabase
            .from('company_contacts')
            .select('phone_number, email, address_line1, city, state, postal_code')
            .eq('company_id', companyId)
            .maybeSingle();

        if (ctData) {
            if (ctData.phone_number && !SAMPLE_COMPANY.phone) SAMPLE_COMPANY.phone = ctData.phone_number;
            if (ctData.email) SAMPLE_COMPANY.email = ctData.email;
            if (ctData.address_line1 && !SAMPLE_COMPANY.address) {
                SAMPLE_COMPANY.address = [ctData.address_line1, ctData.city, ctData.state, ctData.postal_code].filter(Boolean).join(', ');
            }
        }
    } catch (e) {
        console.warn('[invoice-state] Business info preview load error (non-fatal):', e);
    }
}

// ── Realistic Sample Data ───────────────────────────────────────────────────
export const SAMPLE_COMPANY = {
    brandName: 'GLOW SALON',
    legalName: 'Glow Salon & Wellness Pvt Ltd',
    branchName: 'Downtown Flagship Branch',
    address: '#42, 100ft Road, Indiranagar, Bengaluru, KA 560038',
    phone: '+91 98765 43210',
    email: 'billing@glowsalon.com',
    website: 'www.glowsalon.com',
    gstin: '29ABCDE1234F1Z5',
    pan: 'ABCDE1234F',
};

export const SAMPLE_CUSTOMER = {
    name: 'Priya Sharma',
    phone: '9876543210',
    email: 'priya.sharma@example.com',
    address: 'Flat 4B, Palm Grove Apts, Bengaluru',
};

// ── Live HTML Preview Generator ─────────────────────────────────────────────
export function generateInvoiceHTML(type = 'common', config = null) {
    const cfg = config || getInvoiceConfig();
    const prefix = cfg.prefix || 'INV-';
    const startNum = parseInt(cfg.startingNumber, 10) || 1001;

    let invoiceNum = `${prefix}00${startNum}`;
    let invoiceDate = '05-09-2026';
    let paymentMethod = 'UPI';

    if (type === 'booking') invoiceNum = `${prefix}00${startNum}`;
    if (type === 'pos') {
        invoiceNum = `${prefix}00${startNum + 1}`;
        paymentMethod = 'Cash';
    }
    if (type === 'membership') {
        invoiceNum = `${prefix}00${startNum + 2}`;
        paymentMethod = 'UPI';
    }

    // 1. Header Section
    let headerHTML = `
        <div class="inv-header">
            <div class="inv-brand-row">
                <div style="display:flex;align-items:center;gap:10px;">
                    ${cfg.header.showLogo ? (SAMPLE_COMPANY.logoUrl ? `<img src="${SAMPLE_COMPANY.logoUrl}" class="inv-logo-box" style="object-fit:cover;width:40px;height:40px;border-radius:6px;">` : `<div class="inv-logo-box">${(SAMPLE_COMPANY.brandName || 'BB').slice(0, 2).toUpperCase()}</div>`) : ''}
                    <div>
                        ${cfg.header.showDisplayName ? `<h3 class="inv-brand-name">${SAMPLE_COMPANY.brandName}</h3>` : ''}
                        ${cfg.header.showLegalName ? `<div class="inv-legal-name">${SAMPLE_COMPANY.legalName}</div>` : ''}
                        ${cfg.header.showBranchName ? `<div style="font-size:0.75rem;color:#64748b;">${SAMPLE_COMPANY.branchName}</div>` : ''}
                    </div>
                </div>
                <div class="inv-meta-right">
                    <div class="inv-title">Tax Invoice</div>
                    ${cfg.transaction.showInvoiceNumber ? `<div class="inv-number">${invoiceNum}</div>` : ''}
                    ${cfg.transaction.showInvoiceDate ? `<div class="inv-date">${invoiceDate}</div>` : ''}
                    ${cfg.transaction.showPaymentDate ? `<div style="font-size:0.7rem;color:#94a3b8;">Paid: ${invoiceDate}</div>` : ''}
                </div>
            </div>

            <div class="inv-business-info">
                ${cfg.header.showAddress ? `<div>${SAMPLE_COMPANY.address}</div>` : ''}
                <div>
                    ${cfg.header.showPhone ? `<span>Ph: ${SAMPLE_COMPANY.phone}</span>` : ''}
                    ${cfg.header.showPhone && cfg.header.showEmail ? ` &bull; ` : ''}
                    ${cfg.header.showEmail ? `<span>Email: ${SAMPLE_COMPANY.email}</span>` : ''}
                    ${cfg.header.showWebsite ? ` &bull; <span>${SAMPLE_COMPANY.website}</span>` : ''}
                </div>
                <div class="inv-tax-ids">
                    ${cfg.header.showGstin ? `<span><strong>GSTIN:</strong> ${SAMPLE_COMPANY.gstin}</span>` : ''}
                    ${cfg.header.showPan ? `<span><strong>PAN:</strong> ${SAMPLE_COMPANY.pan}</span>` : ''}
                </div>
            </div>
        </div>
    `;

    // 2. Customer Section
    let hasCustomerInfo = cfg.customer.showName || cfg.customer.showPhone || cfg.customer.showEmail || cfg.customer.showAddress;
    let customerHTML = '';
    if (hasCustomerInfo) {
        customerHTML = `
            <div class="inv-section-box">
                <div class="inv-section-title">Billed To:</div>
                ${cfg.customer.showName ? `<div class="inv-customer-name">${SAMPLE_CUSTOMER.name}</div>` : ''}
                ${cfg.customer.showPhone ? `<div class="inv-customer-detail">Phone: ${SAMPLE_CUSTOMER.phone}</div>` : ''}
                ${cfg.customer.showEmail ? `<div class="inv-customer-detail">Email: ${SAMPLE_CUSTOMER.email}</div>` : ''}
                ${cfg.customer.showAddress ? `<div class="inv-customer-detail">${SAMPLE_CUSTOMER.address}</div>` : ''}
            </div>
        `;
    }

    // 3. Source-Specific Header Add-ons
    let sourceMetaHTML = '';
    if (type === 'booking') {
        sourceMetaHTML = `
            <div class="inv-section-box" style="background:#eff6ff;border-color:#dbeafe;">
                <div class="inv-section-title" style="color:#1e40af;">Appointment Details</div>
                <div class="inv-booking-badge-grid">
                    ${cfg.booking.showAppointmentDate ? `<div><span class="inv-spec-label">Date: </span><span class="inv-spec-value">05 Sep 2026</span></div>` : ''}
                    ${cfg.booking.showAppointmentTime ? `<div><span class="inv-spec-label">Time: </span><span class="inv-spec-value">3:00 PM</span></div>` : ''}
                    ${cfg.booking.showStylistName ? `<div><span class="inv-spec-label">Stylist: </span><span class="inv-spec-value">Anita</span></div>` : ''}
                    ${cfg.booking.showAppointmentNumber ? `<div><span class="inv-spec-label">Booking ID: </span><span class="inv-spec-value">#BK-9021</span></div>` : ''}
                </div>
                ${cfg.booking.showBookingNotes ? `<div style="font-size:0.72rem;color:#64748b;margin-top:4px;"><strong>Note:</strong> ${cfg.booking.bookingNotesText || 'Arrive 10m prior.'}</div>` : ''}
            </div>
        `;
    } else if (type === 'pos') {
        sourceMetaHTML = `
            <div class="inv-section-box" style="background:#f0fdf4;border-color:#dcfce7;">
                <div class="inv-section-title" style="color:#166534;">POS Transaction Info</div>
                <div class="inv-booking-badge-grid">
                    ${cfg.pos.showCashierStaff ? `<div><span class="inv-spec-label">Cashier: </span><span class="inv-spec-value">Vikram (POS-01)</span></div>` : ''}
                    ${cfg.pos.showPosTransactionNo ? `<div><span class="inv-spec-label">Txn No: </span><span class="inv-spec-value">TXN-88219</span></div>` : ''}
                    ${cfg.pos.showPaymentRef ? `<div><span class="inv-spec-label">Ref ID: </span><span class="inv-spec-value">POS-REF-994</span></div>` : ''}
                </div>
            </div>
        `;
    } else if (type === 'membership') {
        sourceMetaHTML = `
            <div class="inv-section-box" style="background:#fdf4ff;border-color:#fae8ff;">
                <div class="inv-section-title" style="color:#86198f;">Membership Subscription</div>
                <div style="font-weight:700;color:#0f172a;font-size:0.85rem;">${cfg.membership.showMembershipName ? 'Gold Annual VIP Membership' : 'Membership'}</div>
                ${cfg.membership.showPlan ? `<div style="font-size:0.74rem;color:#701a75;">Tier: Gold Plan (15% Off all services & 1 free facial/month)</div>` : ''}
                <div class="inv-booking-badge-grid" style="margin-top:6px;">
                    ${cfg.membership.showDuration ? `<div><span class="inv-spec-label">Validity: </span><span class="inv-spec-value">1 Year</span></div>` : ''}
                    ${cfg.membership.showStartDate ? `<div><span class="inv-spec-label">Start Date: </span><span class="inv-spec-value">05-09-2026</span></div>` : ''}
                    ${cfg.membership.showExpiryDate ? `<div><span class="inv-spec-label">Expiry Date: </span><span class="inv-spec-value">04-09-2027</span></div>` : ''}
                    ${cfg.membership.showMembershipRef ? `<div><span class="inv-spec-label">Member ID: </span><span class="inv-spec-value">MBR-GOLD-2026</span></div>` : ''}
                </div>
            </div>
        `;
    }

    // 4. Items Table
    let tableHTML = '';
    if (type === 'booking') {
        tableHTML = `
            <table class="inv-items-table">
                <thead>
                    <tr>
                        <th>Services</th>
                        ${cfg.items.showQuantity ? `<th class="text-center">Qty</th>` : ''}
                        ${cfg.items.showUnitPrice ? `<th class="text-right">Price</th>` : ''}
                        ${cfg.items.showTax ? `<th class="text-right">Tax</th>` : ''}
                        ${cfg.items.showLineTotal ? `<th class="text-right">Total</th>` : ''}
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>
                            <div class="inv-item-name">Haircut (Wash & Blowdry)</div>
                            ${cfg.booking.showServiceDuration ? `<div class="inv-item-sub">Duration: 45 mins</div>` : ''}
                        </td>
                        ${cfg.items.showQuantity ? `<td class="text-center">1</td>` : ''}
                        ${cfg.items.showUnitPrice ? `<td class="text-right">&#8377;500</td>` : ''}
                        ${cfg.items.showTax ? `<td class="text-right">&#8377;90</td>` : ''}
                        ${cfg.items.showLineTotal ? `<td class="text-right">&#8377;500</td>` : ''}
                    </tr>
                    <tr>
                        <td>
                            <div class="inv-item-name">Hydra Glow Facial</div>
                            ${cfg.booking.showServiceDuration ? `<div class="inv-item-sub">Duration: 60 mins</div>` : ''}
                        </td>
                        ${cfg.items.showQuantity ? `<td class="text-center">1</td>` : ''}
                        ${cfg.items.showUnitPrice ? `<td class="text-right">&#8377;1,000</td>` : ''}
                        ${cfg.items.showTax ? `<td class="text-right">&#8377;180</td>` : ''}
                        ${cfg.items.showLineTotal ? `<td class="text-right">&#8377;1,000</td>` : ''}
                    </tr>
                </tbody>
            </table>
        `;
    } else if (type === 'pos') {
        tableHTML = `
            <table class="inv-items-table">
                <thead>
                    <tr>
                        <th>Products</th>
                        ${cfg.items.showQuantity ? `<th class="text-center">Qty</th>` : ''}
                        ${cfg.items.showUnitPrice ? `<th class="text-right">Price</th>` : ''}
                        ${cfg.items.showTax ? `<th class="text-right">Tax</th>` : ''}
                        ${cfg.items.showLineTotal ? `<th class="text-right">Total</th>` : ''}
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>
                            <div class="inv-item-name">Keratin Smooth Shampoo (250ml)</div>
                            ${cfg.pos.showSku ? `<div class="inv-item-sub">SKU: SHMP-KRT-01</div>` : ''}
                        </td>
                        ${cfg.items.showQuantity ? `<td class="text-center">1</td>` : ''}
                        ${cfg.items.showUnitPrice ? `<td class="text-right">&#8377;800</td>` : ''}
                        ${cfg.items.showTax ? `<td class="text-right">&#8377;144</td>` : ''}
                        ${cfg.items.showLineTotal ? `<td class="text-right">&#8377;800</td>` : ''}
                    </tr>
                    <tr>
                        <td>
                            <div class="inv-item-name">Argan Hair Serum (100ml)</div>
                            ${cfg.pos.showSku ? `<div class="inv-item-sub">SKU: SRM-ARG-02</div>` : ''}
                        </td>
                        ${cfg.items.showQuantity ? `<td class="text-center">2</td>` : ''}
                        ${cfg.items.showUnitPrice ? `<td class="text-right">&#8377;500</td>` : ''}
                        ${cfg.items.showTax ? `<td class="text-right">&#8377;180</td>` : ''}
                        ${cfg.items.showLineTotal ? `<td class="text-right">&#8377;1,000</td>` : ''}
                    </tr>
                </tbody>
            </table>
        `;
    } else if (type === 'membership') {
        tableHTML = `
            <table class="inv-items-table">
                <thead>
                    <tr>
                        <th>Membership Plan</th>
                        ${cfg.items.showQuantity ? `<th class="text-center">Qty</th>` : ''}
                        ${cfg.items.showUnitPrice ? `<th class="text-right">Price</th>` : ''}
                        ${cfg.items.showTax ? `<th class="text-right">Tax</th>` : ''}
                        ${cfg.items.showLineTotal ? `<th class="text-right">Total</th>` : ''}
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>
                            <div class="inv-item-name">Gold Annual VIP Membership</div>
                            <div class="inv-item-sub">1 Year All-Access &bull; Free Monthly Facial</div>
                        </td>
                        ${cfg.items.showQuantity ? `<td class="text-center">1</td>` : ''}
                        ${cfg.items.showUnitPrice ? `<td class="text-right">&#8377;5,000</td>` : ''}
                        ${cfg.items.showTax ? `<td class="text-right">&#8377;900</td>` : ''}
                        ${cfg.items.showLineTotal ? `<td class="text-right">&#8377;5,000</td>` : ''}
                    </tr>
                </tbody>
            </table>
        `;
    } else {
        // Common sample table
        tableHTML = `
            <table class="inv-items-table">
                <thead>
                    <tr>
                        <th>Item / Service</th>
                        ${cfg.items.showQuantity ? `<th class="text-center">Qty</th>` : ''}
                        ${cfg.items.showUnitPrice ? `<th class="text-right">Price</th>` : ''}
                        ${cfg.items.showTax ? `<th class="text-right">Tax</th>` : ''}
                        ${cfg.items.showLineTotal ? `<th class="text-right">Total</th>` : ''}
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>
                            <div class="inv-item-name">Signature Hair Treatment</div>
                            <div class="inv-item-sub">Service ID: #SVC-102</div>
                        </td>
                        ${cfg.items.showQuantity ? `<td class="text-center">1</td>` : ''}
                        ${cfg.items.showUnitPrice ? `<td class="text-right">&#8377;1,200</td>` : ''}
                        ${cfg.items.showTax ? `<td class="text-right">&#8377;216</td>` : ''}
                        ${cfg.items.showLineTotal ? `<td class="text-right">&#8377;1,200</td>` : ''}
                    </tr>
                    <tr>
                        <td>
                            <div class="inv-item-name">Argan Hair Oil (100ml)</div>
                            <div class="inv-item-sub">Product SKU: OIL-ARG-01</div>
                        </td>
                        ${cfg.items.showQuantity ? `<td class="text-center">1</td>` : ''}
                        ${cfg.items.showUnitPrice ? `<td class="text-right">&#8377;600</td>` : ''}
                        ${cfg.items.showTax ? `<td class="text-right">&#8377;108</td>` : ''}
                        ${cfg.items.showLineTotal ? `<td class="text-right">&#8377;600</td>` : ''}
                    </tr>
                </tbody>
            </table>
        `;
    }

    // 5. Totals Calculations based on type
    let subtotal = 1800;
    let taxAmt = 324;
    let grandTotal = 2124;

    if (type === 'booking') {
        subtotal = 1500;
        taxAmt = 270;
        grandTotal = 1770;
    } else if (type === 'pos') {
        subtotal = 1800;
        taxAmt = 324;
        grandTotal = 2124;
    } else if (type === 'membership') {
        subtotal = 5000;
        taxAmt = 900;
        grandTotal = 5900;
    }

    let totalsHTML = `
        <div class="inv-totals-box">
            ${cfg.totals.showSubtotal ? `<div class="inv-total-row"><span>Subtotal:</span><span>&#8377;${subtotal.toLocaleString('en-IN')}</span></div>` : ''}
            ${cfg.totals.showTax ? `<div class="inv-total-row"><span>GST (18%):</span><span>&#8377;${taxAmt.toLocaleString('en-IN')}</span></div>` : ''}
            ${cfg.totals.showRoundoff ? `<div class="inv-total-row"><span>Round-off:</span><span>&#8377;0.00</span></div>` : ''}
            ${cfg.totals.showTotal ? `<div class="inv-total-row grand-total"><span>Total:</span><span>&#8377;${grandTotal.toLocaleString('en-IN')}</span></div>` : ''}
            ${cfg.totals.showAmountPaid ? `<div class="inv-total-row" style="color:#16a34a;font-weight:600;"><span>Amount Paid:</span><span>&#8377;${grandTotal.toLocaleString('en-IN')}</span></div>` : ''}
            ${cfg.totals.showBalanceDue ? `<div class="inv-total-row" style="color:#64748b;"><span>Balance Due:</span><span>&#8377;0</span></div>` : ''}
        </div>

        ${cfg.totals.showPaymentMethod ? `
            <div class="inv-payment-badge">
                <span>Payment Method: <strong>${paymentMethod}</strong></span>
                <span>Status: <strong>PAID</strong></span>
            </div>
        ` : ''}
    `;

    // 6. Footer Section
    let footerHTML = '';
    const hasFooter = cfg.footer.showThankYou || cfg.footer.showTerms || cfg.footer.showCancellationPolicy || cfg.footer.showPaymentInstructions || cfg.footer.customFooterMessage;
    if (hasFooter) {
        footerHTML = `
            <div class="inv-footer-area">
                ${cfg.footer.showThankYou ? `<div class="inv-thank-you">${cfg.footer.thankYouMessage || 'Thank you for visiting us!'}</div>` : ''}
                ${cfg.footer.customFooterMessage ? `<div style="font-weight:500;color:#475569;margin-bottom:4px;">${cfg.footer.customFooterMessage}</div>` : ''}
                ${cfg.footer.showPaymentInstructions ? `<div style="font-size:0.72rem;color:#64748b;margin-bottom:4px;">${cfg.footer.paymentInstructionsText}</div>` : ''}
                ${cfg.footer.showTerms ? `<div class="inv-footer-terms">${cfg.footer.termsText}</div>` : ''}
                ${cfg.footer.showCancellationPolicy ? `<div class="inv-footer-terms">${cfg.footer.cancellationPolicyText}</div>` : ''}
            </div>
        `;
    }

    return `
        <div class="invoice-paper">
            ${headerHTML}
            ${customerHTML}
            ${sourceMetaHTML}
            ${tableHTML}
            ${totalsHTML}
            ${footerHTML}
        </div>
    `;
}

// ── Render Function for Pages ───────────────────────────────────────────────
export function renderLiveInvoicePreview(type, containerId = 'invoicePreviewContainer', customConfig = null) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = generateInvoiceHTML(type, customConfig);
}
