import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env
config({ path: resolve('./.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  console.log("Attempting to login...");
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'dev@khatalens.com',
    password: 'DevPass123!'
  });

  if (authError) {
    console.error("Login failed:", authError.message);
    process.exit(1);
  }

  console.log("Login successful! User ID:", authData.user.id);

  console.log("Attempting to insert a dummy invoice...");
  const dummyInvoice = {
    user_id: authData.user.id,
    supplier_name: "Test Supplier",
    total_amount: 100.00
  };

  const { data, error } = await supabase
    .from('invoices')
    .insert(dummyInvoice)
    .select('id')
    .single();

  if (error) {
    console.error("Insert failed:", error.message, error.details, error.hint);
  } else {
    console.log("Insert successful! Invoice ID:", data.id);
    
    // Clean up
    await supabase.from('invoices').delete().eq('id', data.id);
    console.log("Cleaned up dummy invoice.");
  }
}

test();
