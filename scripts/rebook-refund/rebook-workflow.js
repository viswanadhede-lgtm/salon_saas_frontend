// scripts/rebook-refund/rebook-workflow.js
// Implements window.triggerRebook — prefills and opens the new booking form.
// Performs NO database writes.

import { supabase } from '../../lib/supabase.js';

export async function triggerRebook(bookingId, optBookingObj) {
    let b = optBookingObj;
    if (!b) {
        if (Array.isArray(window.liveBookingsData)) {
            b = window.liveBookingsData.find(x => String(x.booking_id || x.id || '').toLowerCase() === String(bookingId || '').toLowerCase());
        }
        if (!b && Array.isArray(window.todaysBookingsData)) {
            b = window.todaysBookingsData.find(x => String(x.raw_id || x.id || '').toLowerCase() === String(bookingId || '').toLowerCase());
        }
    }

    // Fetch customer email if missing
    let cEmail = (b && (b.customer_email || b.customer_mail)) || '';
    const custId = (b && b.customer_id) || '';
    if (!cEmail && custId) {
        try {
            const { data } = await supabase.from('customers').select('customer_email').eq('customer_id', custId).limit(1).single();
            if (data && data.customer_email) cEmail = data.customer_email;
        } catch(e) { console.error('Failed to fetch customer email', e); }
    }

    let serviceIds = String((b && (b.service_id || b.service_ids)) || '').split(',').map(s => s.trim()).filter(Boolean);
    let staffIds   = String((b && (b.staff_id || b.staff_ids)) || '').split(',').map(s => s.trim()).filter(Boolean);

    // If serviceIds empty, fetch from bookings table
    if (serviceIds.length === 0 && bookingId) {
        try {
            const { data: rows } = await supabase.from('bookings').select('service_id, package_id, staff_id').eq('booking_id', bookingId);
            if (rows && rows.length > 0) {
                serviceIds = rows.map(r => r.service_id || r.package_id).filter(Boolean);
                staffIds   = rows.map(r => r.staff_id).filter(Boolean);
            }
        } catch(e) { console.error('Failed to fetch booking items for rebook', e); }
    }

    if (window.openAndPrefillBooking) {
        // Prefill customer & services, leaving date and time for user to pick!
        await window.openAndPrefillBooking({
            customerId: custId,
            name:       (b && (b.customer_name || b.customer)) || '',
            phone:      (b && (b.customer_phone || b.phone)) || '',
            email:      cEmail,
            serviceIds,
            staffIds,
            notes:      (b && b.notes) || ''
        });
    } else {
        const btnNewBooking = document.getElementById('btnNewBooking') || document.getElementById('btnNewBookingPage');
        if (btnNewBooking) btnNewBooking.click();
    }
}
