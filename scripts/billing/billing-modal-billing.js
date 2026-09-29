// billing-modal-billing.js — Modal 4: Edit Billing Information
// Part of scripts/billing/ modularization of billing-subscription.js
// THIS IS THE ONE DB WRITE MODULE — writes to company_billing_information only.

'use strict';

import { state } from './billing-state.js';
import { showToast } from './billing-helpers.js';
import { openModal, closeModal, renderBillingInfo } from './billing-renders.js';

// DOM references and callback — injected via initModalBilling()
let dom = {};
let _resolveCompanyId = null;

export function initModalBilling(domRefs, resolveCompanyIdFn) {
    dom = domRefs;
    _resolveCompanyId = resolveCompanyIdFn;
}

// ── Event Binding ──────────────────────────────────────────────

export function bindBillingInfoEvents() {
    const btnOpenEditBilling = document.getElementById('btnOpenEditBilling');
    if (btnOpenEditBilling) {
        btnOpenEditBilling.addEventListener('click', function () {
            if (dom.inputLegalName) dom.inputLegalName.value = state.billingInfo.legalName || '';
            if (dom.inputGstin) dom.inputGstin.value = state.billingInfo.gstin || '';
            if (dom.inputPan) dom.inputPan.value = state.billingInfo.pan || '';
            if (dom.inputBillingEmail) dom.inputBillingEmail.value = state.billingInfo.email || '';
            if (dom.inputBillingPhone) dom.inputBillingPhone.value = state.billingInfo.phone || '';
            if (dom.inputAddressLine1) dom.inputAddressLine1.value = state.billingInfo.addressLine1 || '';
            if (dom.inputAddressLine2) dom.inputAddressLine2.value = state.billingInfo.addressLine2 || '';
            if (dom.inputCity) dom.inputCity.value = state.billingInfo.city || '';
            if (dom.inputDistrict) dom.inputDistrict.value = state.billingInfo.district || '';
            if (dom.inputState) dom.inputState.value = state.billingInfo.state || '';
            if (dom.inputPincode) dom.inputPincode.value = state.billingInfo.pincode || '';
            if (dom.inputCountry) dom.inputCountry.value = state.billingInfo.country || 'India';
            openModal(dom.modalEditBilling);
        });
    }

    if (dom.btnSaveBillingInfo) {
        dom.btnSaveBillingInfo.addEventListener('click', async function () {
            const legalName = (dom.inputLegalName && dom.inputLegalName.value.trim()) || '';
            const email = (dom.inputBillingEmail && dom.inputBillingEmail.value.trim()) || '';
            const addressLine1 = (dom.inputAddressLine1 && dom.inputAddressLine1.value.trim()) || '';
            const city = (dom.inputCity && dom.inputCity.value.trim()) || '';
            const stateVal = (dom.inputState && dom.inputState.value.trim()) || '';
            const pincode = (dom.inputPincode && dom.inputPincode.value.trim()) || '';
            const gstin = dom.inputGstin ? dom.inputGstin.value.trim().toUpperCase() : '';
            const pan = dom.inputPan ? dom.inputPan.value.trim().toUpperCase() : '';
            const phone = dom.inputBillingPhone ? dom.inputBillingPhone.value.trim() : '';
            const addressLine2 = dom.inputAddressLine2 ? dom.inputAddressLine2.value.trim() : '';
            const district = dom.inputDistrict ? dom.inputDistrict.value.trim() : '';
            const country = (dom.inputCountry && dom.inputCountry.value.trim()) || 'India';

            if (!legalName) {
                showToast('Please enter legal business name.');
                if (dom.inputLegalName) dom.inputLegalName.focus();
                return;
            }
            if (!email) {
                showToast('Please enter billing email.');
                if (dom.inputBillingEmail) dom.inputBillingEmail.focus();
                return;
            }
            if (!addressLine1) {
                showToast('Please enter address line 1.');
                if (dom.inputAddressLine1) dom.inputAddressLine1.focus();
                return;
            }
            if (!city) {
                showToast('Please enter city.');
                if (dom.inputCity) dom.inputCity.focus();
                return;
            }
            if (!stateVal) {
                showToast('Please enter state.');
                if (dom.inputState) dom.inputState.focus();
                return;
            }
            if (!pincode) {
                showToast('Please enter PIN code.');
                if (dom.inputPincode) dom.inputPincode.focus();
                return;
            }

            const prevHtml = dom.btnSaveBillingInfo.innerHTML;
            dom.btnSaveBillingInfo.disabled = true;
            dom.btnSaveBillingInfo.innerHTML = '<span class="btn-spinner"></span> <span>Saving...</span>';

            try {
                // resolveCompanyId is passed in via initModalBilling to avoid circular deps
                const companyId = typeof _resolveCompanyId === 'function' ? await _resolveCompanyId() : null;
                if (companyId) {
                    const { supabase } = await import('../../lib/supabase.js');
                    if (supabase) {
                        let rowId = state.billingInfo.id;
                        if (!rowId) {
                            const { data: existingRows } = await supabase
                                .from('company_billing_information')
                                .select('id')
                                .eq('company_id', companyId)
                                .order('created_at', { ascending: false })
                                .limit(1);
                            if (existingRows && existingRows.length > 0) {
                                rowId = existingRows[0].id;
                            }
                        }

                        const payload = {
                            company_id: companyId,
                            legal_business_name: legalName,
                            gstin: gstin,
                            pan: pan,
                            billing_email: email,
                            billing_phone: phone,
                            address_line_1: addressLine1,
                            address_line_2: addressLine2,
                            city: city,
                            district: district,
                            state: stateVal,
                            pin_code: pincode,
                            country: country,
                            updated_at: new Date().toISOString()
                        };

                        if (rowId) {
                            const { error: updErr } = await supabase
                                .from('company_billing_information')
                                .update(payload)
                                .eq('id', rowId);
                            if (updErr) {
                                console.error('[Billing] Error updating billing information:', updErr);
                                throw updErr;
                            }
                            state.billingInfo.id = rowId;
                        } else {
                            payload.created_at = new Date().toISOString();
                            const { data: insData, error: insErr } = await supabase
                                .from('company_billing_information')
                                .insert([payload])
                                .select('id')
                                .maybeSingle();
                            if (insErr) {
                                console.error('[Billing] Error inserting billing information:', insErr);
                                throw insErr;
                            }
                            if (insData?.id) {
                                state.billingInfo.id = insData.id;
                            }
                        }
                    }
                }

                state.billingInfo.legalName = legalName;
                state.billingInfo.gstin = gstin;
                state.billingInfo.pan = pan;
                state.billingInfo.email = email;
                state.billingInfo.phone = phone;
                state.billingInfo.addressLine1 = addressLine1;
                state.billingInfo.addressLine2 = addressLine2;
                state.billingInfo.city = city;
                state.billingInfo.district = district;
                state.billingInfo.state = stateVal;
                state.billingInfo.pincode = pincode;
                state.billingInfo.country = country;
                state.billingInfo.loaded = true;

                closeModal(dom.modalEditBilling);
                renderBillingInfo();
                showToast('Billing information saved successfully.');
            } catch (err) {
                console.error('[Billing] Failed to save billing information:', err);
                showToast('Failed to save billing information. Please try again.');
            } finally {
                dom.btnSaveBillingInfo.disabled = false;
                dom.btnSaveBillingInfo.innerHTML = prevHtml;
            }
        });
    }
}
