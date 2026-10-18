const bcrypt = require("bcryptjs");
const supabase = require("../config/supabase");
const { ROLES } = require("../config/constants");

// Default staff accounts are created once and must change their password at first login.
async function seedStaff() {
  const { data: existing, error } = await supabase
    .from("users")
    .select("id")
    .in("role", [ROLES.ORGANIZER, ROLES.ADMIN])
    .limit(1);

  if (error) {
    console.error("❌ SEED CHECK ERROR:", error.message);
    return;
  }
  if (existing && existing.length > 0) {
    console.log("✅ Staff accounts already exist. Skipping seed.");
    return;
  }

  console.log("🌱 Seeding organizer & admin accounts...");
  const [organizerPassword, adminPassword] = await Promise.all([
    bcrypt.hash("pass123", 10),
    bcrypt.hash("admin123", 10),
  ]);

  const { error: insertError } = await supabase.from("users").insert([
    {
      full_name: "Mark Organizer",
      email: "org1@school.com",
      password: organizerPassword,
      role: ROLES.ORGANIZER,
      must_change_password: true,
    },
    {
      full_name: "Admin User",
      email: "admin@school.com",
      password: adminPassword,
      role: ROLES.ADMIN,
      must_change_password: true,
    },
  ]);

  if (insertError) console.error("❌ SEED INSERT ERROR:", insertError.message);
  else console.log("✅ Staff accounts ready.");
}

module.exports = { seedStaff };
