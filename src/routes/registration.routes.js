const express = require("express");
const supabase = require("../config/supabase");
const asyncHandler = require("../utils/asyncHandler");
const HttpError = require("../utils/httpError");
const { unwrap } = require("../utils/db");
const { requireRole } = require("../middleware/auth");
const {
  ROLES,
  EVENT_STATUS,
  REGISTRATION_STATUS,
  ACTIVE_REGISTRATION_STATUSES,
} = require("../config/constants");
const { findManageableEvent } = require("../services/eventService");

const router = express.Router();

router.patch(
  "/:registrationId/attendance",
  ...requireRole(ROLES.ORGANIZER, ROLES.ADMIN),
  asyncHandler(async (req, res) => {
    const registration = unwrap(
      await supabase
        .from("registrations")
        .select("*")
        .eq("id", req.params.registrationId)
        .maybeSingle(),
    );
    if (!registration || !ACTIVE_REGISTRATION_STATUSES.includes(registration.status)) {
      throw new HttpError(404, "Registration not found");
    }

    const event = await findManageableEvent(req.user, registration.event_id);
    if (event.status === EVENT_STATUS.CANCELLED) {
      throw new HttpError(400, "Attendance can't be marked for a cancelled event");
    }

    const attended = Boolean(req.body.attended);
    unwrap(
      await supabase
        .from("registrations")
        .update({
          status: attended
            ? REGISTRATION_STATUS.ATTENDED
            : REGISTRATION_STATUS.REGISTERED,
        })
        .eq("id", registration.id),
    );

    res.json({ success: true, attended });
  }),
);

module.exports = router;
