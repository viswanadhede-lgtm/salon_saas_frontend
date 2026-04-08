import { supabase } from './lib/supabase.js';

async function testInvalidUuid() {
    const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('company_id', 'invalid-uuid')
        .order('created_at', { ascending: false });
        
    console.log("error:", error);
}

testInvalidUuid();
