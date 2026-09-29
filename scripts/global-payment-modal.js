// scripts/global-payment-modal.js — Thin Orchestrator (v2.3.0)
// Modularized into:
//   scripts/global-payment-modal/gpm-state.js
//   scripts/global-payment-modal/gpm-ui.js
//   scripts/global-payment-modal/gpm-discounts.js
//   scripts/global-payment-modal/gpm-payment.js
//   scripts/global-payment-modal/gpm-confirm-modal.js

(function () {
    'use strict';

    let modulesLoaded = null;

    async function loadModules() {
        if (!modulesLoaded) {
            modulesLoaded = (async () => {
                const [stateMod, uiMod, discountsMod, paymentMod, confirmMod] = await Promise.all([
                    import('./global-payment-modal/gpm-state.js'),
                    import('./global-payment-modal/gpm-ui.js'),
                    import('./global-payment-modal/gpm-discounts.js'),
                    import('./global-payment-modal/gpm-payment.js'),
                    import('./global-payment-modal/gpm-confirm-modal.js')
                ]);
                return { stateMod, uiMod, discountsMod, paymentMod, confirmMod };
            })();
        }
        return modulesLoaded;
    }

    let isInitialized = false;

    async function initGlobalPaymentModal() {
        if (isInitialized) return;
        const mods = await loadModules();

        mods.uiMod.injectGlobalPaymentModalStyles();
        mods.uiMod.injectGlobalPaymentModalHTML();
        mods.confirmMod.injectBookingConfirmModalHTML();
        bindGlobalPaymentModalEvents(mods);
        isInitialized = true;
    }

    function bindGlobalPaymentModalEvents(mods) {
        const { gpmState } = mods.stateMod;
        const { closeGlobalPaymentModal, calculateFinalDue } = mods.uiMod;
        const { fetchCustomerMembership, applySelectedOffer, applyCouponCode } = mods.discountsMod;
        const { finalizePayment } = mods.paymentMod;

        document.getElementById('gpmBtnClose')?.addEventListener('click', closeGlobalPaymentModal);
        document.getElementById('gpmBtnCancel')?.addEventListener('click', closeGlobalPaymentModal);

        // Click outside to close
        document.getElementById('gpmOverlay')?.addEventListener('click', (e) => {
            if (e.target.id === 'gpmOverlay') closeGlobalPaymentModal();
        });

        // Customer View Profile
        document.getElementById('gpmBtnViewProfile')?.addEventListener('click', () => {
            if (gpmState.globalPaymentConfig?.customerId && window.viewCustomerProfile) {
                window.viewCustomerProfile(gpmState.globalPaymentConfig.customerId, gpmState.globalPaymentConfig.customerName);
            } else {
                alert('Customer profile not available for walk-in customer.');
            }
        });

        // Edit Booking
        document.getElementById('gpmBtnEditBooking')?.addEventListener('click', () => {
            if (gpmState.globalPaymentConfig?.bookingId && window.openEditBookingModal) {
                window.closeGlobalPaymentModal();
                window.openEditBookingModal(gpmState.globalPaymentConfig.bookingId);
            } else {
                alert('Edit booking is not available for this appointment.');
            }
        });

        // Payment Methods
        document.querySelectorAll('.gpm-method-card').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.gpm-method-card').forEach(b => b.classList.remove('active'));
                const target = e.currentTarget;
                target.classList.add('active');
                gpmState.paymentState.method = target.dataset.method;
            });
        });

        // Membership Toggle
        document.getElementById('gpmMembershipToggle')?.addEventListener('change', async (e) => {
            if (e.target.checked) {
                if (gpmState.globalPaymentConfig?.customerId) {
                    await fetchCustomerMembership(gpmState.globalPaymentConfig.customerId);
                }
            } else {
                gpmState.paymentState.appliedMembership = null;
                document.getElementById('gpmMembershipSection')?.classList.remove('applied');
                const resEl = document.getElementById('gpmMembershipResult');
                if (resEl) {
                    resEl.className = 'gpm-membership-result';
                    resEl.textContent = '';
                    resEl.style.display = 'none';
                }
                const sub = document.getElementById('gpmMembershipSubtitle');
                if (sub) sub.textContent = 'No active membership found.';
                calculateFinalDue();
            }
        });

        // Offers Select & Clear
        document.getElementById('gpmOfferSelect')?.addEventListener('change', (e) => {
            applySelectedOffer(e.target.value);
        });
        document.getElementById('gpmBtnClearOffer')?.addEventListener('click', () => {
            const sel = document.getElementById('gpmOfferSelect');
            if (sel) sel.value = '';
            applySelectedOffer('');
        });

        // Coupon Apply / Remove
        document.getElementById('gpmBtnApplyCoupon')?.addEventListener('click', applyCouponCode);

        // Proceed
        document.getElementById('gpmBtnProceed')?.addEventListener('click', finalizePayment);
    }

    // ── Open Modal API ───────────────────────────────────────────────────────────
    window.openGlobalPaymentModal = async function(config) {
        if (!config || config.totalAmount === undefined) {
            console.error("Invalid config provided to openGlobalPaymentModal");
            return;
        }

        const mods = await loadModules();
        if (!isInitialized) {
            await initGlobalPaymentModal();
        }

        const { gpmState, resetPaymentState, setGlobalPaymentConfig } = mods.stateMod;
        const { gpmFormatCurrency, gpmFormatDate, calculateFinalDue } = mods.uiMod;
        const { fetchCustomerMembership, loadAvailableOffers } = mods.discountsMod;

        setGlobalPaymentConfig(config);
        resetPaymentState(config.totalAmount);

        // Reset UI Inputs & Box States
        document.getElementById('gpmMembershipSection')?.classList.remove('applied');
        document.getElementById('gpmCouponSection')?.classList.remove('applied');
        document.getElementById('gpmOffersSection')?.classList.remove('applied');

        // Re-enable the proceed button (may have been disabled by a previous payment)
        const proceedBtn = document.getElementById('gpmBtnProceed');
        if (proceedBtn) proceedBtn.disabled = false;

        const oSelect = document.getElementById('gpmOfferSelect');
        if (oSelect) oSelect.value = '';
        const oBtnClear = document.getElementById('gpmBtnClearOffer');
        if (oBtnClear) oBtnClear.style.display = 'none';
        const oMsg = document.getElementById('gpmOfferMsg');
        if (oMsg) oMsg.style.display = 'none';

        if (document.getElementById('gpmCouponInput')) {
            const cIn = document.getElementById('gpmCouponInput');
            cIn.value = '';
            cIn.disabled = false;
        }
        if (document.getElementById('gpmBtnApplyCoupon')) {
            const btn = document.getElementById('gpmBtnApplyCoupon');
            btn.disabled = false;
            btn.textContent = 'Apply';
        }
        if (document.getElementById('gpmCouponMsg')) document.getElementById('gpmCouponMsg').style.display = 'none';

        // Payment methods
        document.querySelectorAll('.gpm-method-card').forEach(b => b.classList.remove('active'));
        document.querySelector('.gpm-method-card[data-method="cash"]')?.classList.add('active');

        // Context & Header
        const type = (config.type || 'pos').toLowerCase();
        const titleEl = document.getElementById('gpmTitle');
        if (titleEl) {
            titleEl.textContent = config.title || (type === 'booking' ? 'Booking Payment' : (type === 'membership' ? 'Membership Purchase' : 'POS Checkout'));
        }

        const custName = (config.customerName || 'Walk-in Customer').trim();
        const custPhone = config.customerPhone || 'N/A';
        if (document.getElementById('gpmCustName')) document.getElementById('gpmCustName').textContent = custName;
        if (document.getElementById('gpmCustPhone')) document.getElementById('gpmCustPhone').textContent = custPhone;
        if (document.getElementById('gpmCustAvatar')) document.getElementById('gpmCustAvatar').textContent = (custName[0] || 'C').toUpperCase();

        const subtitleEl = document.getElementById('gpmSubtitle');
        if (subtitleEl) {
            const saleIdStr = config.saleId ? `#${config.saleId}` : (config.bookingId ? `#${String(config.bookingId).slice(0, 8).toUpperCase()}` : '');
            const dateStr = gpmFormatDate(config.bookingDate);
            const timeStr = config.bookingTime ? `, ${config.bookingTime}` : '';
            const dateTimeStr = (dateStr || timeStr) ? `${dateStr}${timeStr}` : '';
            const branchStr = config.branchName || 'Main Branch';
            const parts = [saleIdStr, dateTimeStr, branchStr].filter(Boolean);
            subtitleEl.textContent = parts.length > 0 ? parts.join(' • ') : custName;
        }

        // Render Services Table
        const itemsHeader = document.getElementById('gpmItemsHeader');
        const tbody = document.getElementById('gpmServicesTbody');
        const subtotalEl = document.getElementById('gpmServicesSubtotal');
        const noteEl = document.getElementById('gpmServiceNote');
        const statItemsCount = document.getElementById('gpmStatItemsCount');

        const items = config.items || [];
        const itemsCount = items.length || 1;

        if (itemsHeader) {
            itemsHeader.textContent = type === 'booking' ? `Booked Services (${itemsCount})` : `Order Items (${itemsCount})`;
        }
        if (statItemsCount) {
            statItemsCount.textContent = `${itemsCount} item${itemsCount !== 1 ? 's' : ''}`;
        }
        if (subtotalEl) {
            subtotalEl.textContent = gpmFormatCurrency(config.totalAmount || 0);
        }
        if (noteEl) {
            noteEl.style.display = (config.hasMultipleServices || itemsCount > 1) ? 'flex' : 'none';
        }

        if (tbody) {
            if (items.length > 0) {
                tbody.innerHTML = items.map((it, idx) => `
                    <tr>
                        <td class="svc-idx">${it.index || (idx + 1)}</td>
                        <td class="svc-name">${it.name || 'Service'}</td>
                        <td class="svc-staff">${it.staff || it.staff_name || 'Assigned'}</td>
                        <td class="svc-time">${it.time || it.start_time || config.bookingTime || ''}</td>
                        <td class="svc-price">${gpmFormatCurrency(it.price || 0)}</td>
                    </tr>
                `).join('');
            } else {
                tbody.innerHTML = `
                    <tr>
                        <td class="svc-idx">1</td>
                        <td class="svc-name">${config.title || 'Service Appointment'}</td>
                        <td class="svc-staff">Assigned</td>
                        <td class="svc-time">${config.bookingTime || ''}</td>
                        <td class="svc-price">${gpmFormatCurrency(config.totalAmount || 0)}</td>
                    </tr>
                `;
            }
        }

        // Show/hide membership perk toggle
        const memSection = document.getElementById('gpmMembershipSection');
        const memToggle = document.getElementById('gpmMembershipToggle');
        const memSub = document.getElementById('gpmMembershipSubtitle');
        if (config.customerId && !config.isMembershipPurchase) {
            if (memSection) memSection.style.display = 'flex';
            if (memToggle) memToggle.checked = false;
            if (memSub) memSub.textContent = 'Checking membership...';
            const resEl = document.getElementById('gpmMembershipResult');
            if (resEl) {
                resEl.className = 'gpm-membership-result';
                resEl.textContent = '';
                resEl.style.display = 'none';
            }
            // Auto-check customer membership
            fetchCustomerMembership(config.customerId).then(found => {
                if (found && memToggle) memToggle.checked = true;
            });
        } else {
            if (memSection) memSection.style.display = 'flex';
            if (memToggle) memToggle.checked = false;
            if (memSub) memSub.textContent = 'No active membership found.';
        }

        // Fetch active offers for branch
        loadAvailableOffers();

        calculateFinalDue();

        // Reveal Modal
        document.getElementById('gpmOverlay')?.classList.add('active');
        if (window.feather) feather.replace();
    };

    window.closeGlobalPaymentModal = function() {
        document.getElementById('gpmOverlay')?.classList.remove('active');
    };

    window.openBookingConfirmModal = async function(opts) {
        const mods = await loadModules();
        if (!isInitialized) {
            await initGlobalPaymentModal();
        }
        mods.confirmMod.openBookingConfirmModal(opts);
    };

    // ── Inject Styles & HTML on DOMContentLoaded ─────────────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initGlobalPaymentModal);
    } else {
        initGlobalPaymentModal();
    }
})();
