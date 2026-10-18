require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error(
    "❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in your .env file.",
  );
  process.exit(1);
}

// Service-role client: trusted server-side use only, bypasses RLS.
module.exports = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
