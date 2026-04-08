import { supabase } from './lib/supabase.js';

async function countUsers() {
    const { data, error, count } = await supabase
        .from('users')
        .select('*', { count: 'exact' });
        
    console.log("Total users:", data?.length, "Count:", count);
    if (data) {
        data.forEach(d => console.log("User:", d.name, "| Status:", d.status));
    }
}

countUsers();
