// scripts/dashboard/dashboard-navigation.js
// Handles dashboard navigation to appointment detail pages

export function navigateToBooking(status, bookingId) {
    status = (status || '').toLowerCase();
    if (status === 'completed') {
        window.location.href = `completed-appointments.html?highlight=${bookingId}`;
    } else if (status === 'cancelled' || status === 'no-show') {
        window.location.href = `no-shows-cancellations.html?highlight=${bookingId}`;
    } else {
        window.location.href = `upcoming-appointments.html?highlight=${bookingId}`;
    }
}

// Bind to window so inline onclick/ondblclick handlers can call it
if (typeof window !== 'undefined') {
    window.navigateToBooking = navigateToBooking;
}
