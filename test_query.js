import { supabase } from './lib/supabase.js';

async function testQuery() {
    const cid = "100af6d5-f3ea-4daf-95ef-1877322287a8";
    const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('company_id', cid)
        .neq('status', 'deleted')
        .order('created_at', { ascending: false });
        
    console.log("data:", JSON.stringify(data, null, 2));
    console.log("error:", error);
}

testQuery();
