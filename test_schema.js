import { supabase } from './lib/supabase.js';

async function describeTable() {
    const { data, error } = await supabase
        .from('users')
        .select('*')
        .limit(0);
        
    console.log("error:", error);
}

describeTable();
