// scripts/settings/settings-invoice-booking-ui.js - Booking invoice settings UI bindings

        import { 
            getInvoiceConfig, 
            saveInvoiceConfig, 
            renderLiveInvoicePreview,
            loadInvoiceSettingsFromDB,
            saveInvoiceSettingsToDB,
            loadBusinessPreviewData
        } from '../invoice-state.js';

        let config = getInvoiceConfig();

        function syncUIFromConfig() {
            setChecked('bkApptNum', config.booking.showAppointmentNumber);
            setChecked('bkApptDate', config.booking.showAppointmentDate);
            setChecked('bkApptTime', config.booking.showAppointmentTime);
            setChecked('bkDuration', config.booking.showServiceDuration);
            setChecked('bkStylist', config.booking.showStylistName);
            setChecked('bkBranch', config.booking.showBranchName);
            setChecked('bkNotes', config.booking.showBookingNotes);
            setVal('bkNotesText', config.booking.bookingNotesText || '');

            updateNotesVisibility();
            renderPreview();
        }

        function syncConfigFromUI() {
            config.booking.showAppointmentNumber = isChecked('bkApptNum');
            config.booking.showAppointmentDate = isChecked('bkApptDate');
            config.booking.showAppointmentTime = isChecked('bkApptTime');
            config.booking.showServiceDuration = isChecked('bkDuration');
            config.booking.showStylistName = isChecked('bkStylist');
            config.booking.showBranchName = isChecked('bkBranch');
            config.booking.showBookingNotes = isChecked('bkNotes');
            config.booking.bookingNotesText = getVal('bkNotesText');

            updateNotesVisibility();
            renderPreview();
            markDirty();
        }

        function updateNotesVisibility() {
            const el = document.getElementById('bkNotesGroup');
            if (el) el.style.display = isChecked('bkNotes') ? 'block' : 'none';
        }

        function renderPreview() {
            renderLiveInvoicePreview('booking', 'bookingInvoicePreview', config);
        }

        window.saveBookingConfig = async function() {
            const btn = document.getElementById('btnSave');
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '<div style="width:14px;height:14px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:spin 1s linear infinite;display:inline-block;"></div> Saving...';
            }

            try {
                await saveInvoiceSettingsToDB('booking', config);
                showToast('? Booking invoice settings saved!', 'success');
                document.getElementById('savebar')?.classList.remove('visible');
            } catch (err) {
                console.error('Error saving booking invoice settings:', err);
                showToast(err.message || 'Failed to save. Please try again.', 'error');
            } finally {
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = '<i data-feather="save" style="width:15px;height:15px;"></i> Save Booking Invoice';
                    if (typeof feather !== 'undefined') feather.replace();
                }
            }
        };

        window.cancelBookingConfig = async function() {
            config = await loadInvoiceSettingsFromDB('booking');
            syncUIFromConfig();
            document.getElementById('savebar')?.classList.remove('visible');
        };

        function setVal(id, val) { const el = document.getElementById(id); if (el) el.value = val; }
        function getVal(id) { const el = document.getElementById(id); return el ? el.value.trim() : ''; }
        function setChecked(id, val) { const el = document.getElementById(id); if (el) el.checked = !!val; }
        function isChecked(id) { const el = document.getElementById(id); return el ? el.checked : false; }

        function markDirty() {
            document.getElementById('savebar')?.classList.add('visible');
            if (typeof feather !== 'undefined') feather.replace();
        }

        function showToast(msg, type = 'success') {
            const t = document.getElementById('toastNotification');
            if (!t) return;
            t.textContent = msg;
            t.style.background = type === 'error' ? '#ef4444' : '#22c55e';
            t.classList.add('visible');
            setTimeout(() => { t.classList.remove('visible'); t.style.background = ''; }, 3500);
        }


// Expose window APIs for inline HTML handlers
window.saveBookingConfig = saveBookingConfig;
window.cancelBookingConfig = cancelBookingConfig;

export async function initInvoiceBooking() {
            if (typeof feather !== 'undefined') feather.replace();
            
            await loadBusinessPreviewData();
            config = await loadInvoiceSettingsFromDB('booking');
            syncUIFromConfig();

            document.querySelectorAll('.form-input, .form-textarea, input[type=checkbox]').forEach(el => {
                el.addEventListener(el.type === 'checkbox' ? 'change' : 'input', syncConfigFromUI);
            });
}

// Safe initialization guard
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initInvoiceBooking);
} else {
    initInvoiceBooking();
}