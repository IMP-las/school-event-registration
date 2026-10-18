const supabase = require("../config/supabase");

// Audit logging must never break the action being logged.
async function recordAudit(actor, action, description) {
  try {
    const { error } = await supabase.from("audit_logs").insert([
      {
        actor_id: String(actor.id),
        actor_name: actor.full_name,
        actor_role: actor.role,
        action,
        description,
      },
    ]);
    if (error) throw error;
  } catch (err) {
    console.error("Could not write audit log:", err.message);
  }
}

module.exports = { recordAudit };
