import { supabase } from './lib/supabase.js';

async function checkTransactions() {
    // You'll need to know a sample booking ID that was problematic. 
    // Since I don't have it, I'll grab a recent one with status 'cancelled'
    const { data: cancelledBookings } = await supabase
        .from('bookings')
        .select('booking_id')
        .eq('status', 'cancelled')
        .limit(1);

    if (!cancelledBookings || !cancelledBookings.length) {
        console.log('No cancelled bookings found');
        return;
    }

    const bookingId = cancelledBookings[0].booking_id;
    console.log('Checking transactions for booking:', bookingId);

    const { data: txs, error } = await supabase
        .from('business_transactions')
        .select('*')
        .eq('reference_id', bookingId)
        .eq('reference_type', 'booking');

    if (error) {
        console.error('Error fetching transactions:', error);
        return;
    }

    console.log('Transactions:', JSON.stringify(txs, null, 2));
}

checkTransactions();
