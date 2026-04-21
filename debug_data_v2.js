const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = "https://qxmgyxjwpxkdbgldpdil.supabase.co";
const supabaseKey = "sb_publishable_aqCSbMiVxH5cSZxgssdNqw_jQZvzmA0";
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkData() {
    const now = new Date();
    const localISOTime = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
    console.log("Checking for date:", localISOTime);

    const { data: bookings, error: bError } = await supabase
        .from('bookings_for_business_transaction')
        .select('branch_id, booking_date, status')
        .limit(20);
    
    if (bError) {
        console.error("Error fetching bookings:", bError);
    } else {
        console.log("Sample bookings (all dates):", bookings);
    }

    const { data: today, error: tError } = await supabase
        .from('bookings_for_business_transaction')
        .select('*')
        .eq('booking_date', localISOTime);

    if (tError) {
        console.error("Error fetching today's bookings:", tError);
    } else {
        console.log(`Found ${today.length} bookings for today (${localISOTime}).`);
        if (today.length > 0) {
            console.log("Branch IDs for today:", [...new Set(today.map(b => b.branch_id))]);
        }
    }
}

checkData();
