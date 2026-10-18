const express = require("express");
const bcrypt = require("bcryptjs");
const supabase = require("../config/supabase");
const asyncHandler = require("../utils/asyncHandler");
const HttpError = require("../utils/httpError");
const { unwrap } = require("../utils/db");
const { mapUser } = require("../utils/mappers");
const { requireAuth } = require("../middleware/auth");
const { recordAudit } = require("../services/auditService");
const { ROLES } = require("../config/constants");
const {
  cleanName,
  cleanStudentName,
  composeFullName,
  cleanSection,
  cleanPassword,
} = require("../utils/validators");

const router = express.Router();

// Profile routes use requireAuth only, so a user who must change a temporary
// password can still reach them.
router.use(requireAuth);

function profileChanges(user, body) {
  if (user.role === ROLES.STUDENT) {
    const names = cleanStudentName(body);
    return {
      full_name: composeFullName(names),
      first_name: names.firstName,
      middle_name: names.middleName || null,
      last_name: names.lastName,
      section: cleanSection(body.section),
    };
  }
  return { full_name: cleanName(body.fullName, "Full name", { max: 100 }) };
}

// Names are copied onto registrations and events for display, so keep them in sync.
async function syncDenormalizedNames(user, fullName) {
  if (user.role === ROLES.STUDENT) {
    unwrap(
      await supabase
        .from("registrations")
        .update({ student_name: fullName })
        .eq("student_id", user.id),
    );
  } else if (user.role === ROLES.ORGANIZER) {
    unwrap(
      await supabase
        .from("events")
        .update({ organizer_name: fullName })
        .eq("organizer_id", user.id),
    );
  }
}

router.get("/", (req, res) => {
  res.json({ success: true, user: mapUser(req.user) });
});

router.put(
  "/",
  asyncHandler(async (req, res) => {
    const changes = profileChanges(req.user, req.body);

    const updated = unwrap(
      await supabase
        .from("users")
        .update(changes)
        .eq("id", req.user.id)
        .select("*")
        .single(),
    );
    await syncDenormalizedNames(req.user, changes.full_name);

    res.json({ success: true, message: "Profile updated", user: mapUser(updated) });
  }),
);

router.put(
  "/password",
  asyncHandler(async (req, res) => {
    const { currentPassword } = req.body;
    if (!currentPassword) throw new HttpError(400, "Current password is required");

    const isCurrent = await bcrypt.compare(currentPassword, req.user.password);
    if (!isCurrent) throw new HttpError(400, "Current password is incorrect");

    const newPassword = cleanPassword(req.body.newPassword, "New password");
    if (newPassword === currentPassword) {
      throw new HttpError(400, "New password must be different from the current one");
    }

    const updated = unwrap(
      await supabase
        .from("users")
        .update({
          password: await bcrypt.hash(newPassword, 10),
          must_change_password: false,
        })
        .eq("id", req.user.id)
        .select("*")
        .single(),
    );

    if (req.user.role !== ROLES.STUDENT) {
      await recordAudit(req.user, "password.changed", "Changed their account password");
    }

    res.json({ success: true, message: "Password updated", user: mapUser(updated) });
  }),
);

module.exports = router;
