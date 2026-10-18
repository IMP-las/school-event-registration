const express = require("express");
const supabase = require("../config/supabase");
const asyncHandler = require("../utils/asyncHandler");
const { unwrap, selectByIds } = require("../utils/db");
const { requireRole } = require("../middleware/auth");
const {
  ROLES,
  EVENT_STATUS,
  REGISTRATION_STATUS,
  ACTIVE_REGISTRATION_STATUSES,
} = require("../config/constants");
const {
  hasEnded,
  resolveStatus,
  closeExpiredEvents,
  getRegistrationCounts,
} = require("../services/eventService");
const {
  registerStudent,
  cancelRegistration,
} = require("../services/registrationService");

const router = express.Router();
router.use(...requireRole(ROLES.STUDENT));

// Students never see event ids as text, seat counts or registration ids:
// ids are only returned so the UI can call register / cancel.
router.get(
  "/events",
  asyncHandler(async (req, res) => {
    await closeExpiredEvents();

    const events = unwrap(
      await supabase
        .from("events")
        .select("*")
        .eq("status", EVENT_STATUS.OPEN)
        .order("event_date", { ascending: true }),
    ).filter((e) => !hasEnded(e));

    const [counts, mine] = await Promise.all([
      getRegistrationCounts(events.map((e) => e.id)),
      supabase
        .from("registrations")
        .select("event_id")
        .eq("student_id", req.user.id)
        .in("status", ACTIVE_REGISTRATION_STATUSES)
        .then(unwrap),
    ]);
    const registeredIds = new Set(mine.map((r) => String(r.event_id)));

    res.json(
      events.map((e) => ({
        eventId: e.id,
        eventName: e.event_name,
        description: e.description,
        eventDate: e.event_date,
        location: e.location,
        status: resolveStatus(e, counts.get(String(e.id)) || 0),
        isRegistered: registeredIds.has(String(e.id)),
      })),
    );
  }),
);

function displayStatus(registration, event) {
  if (registration.status === REGISTRATION_STATUS.CANCELLED) return "cancelled";
  if (registration.status === REGISTRATION_STATUS.ATTENDED) return "attended";
  if (event.status === EVENT_STATUS.CANCELLED) return "event_cancelled";
  if (hasEnded(event)) return "ended";
  return "registered";
}

router.get(
  "/registrations",
  asyncHandler(async (req, res) => {
    const registrations = unwrap(
      await supabase.from("registrations").select("*").eq("student_id", req.user.id),
    );
    const events = await selectByIds(
      "events",
      "id",
      registrations.map((r) => r.event_id),
    );
    const eventsById = new Map(events.map((e) => [String(e.id), e]));

    const result = registrations
      .filter((r) => eventsById.has(String(r.event_id)))
      .map((r) => {
        const event = eventsById.get(String(r.event_id));
        const status = displayStatus(r, event);
        return {
          eventId: event.id,
          eventName: event.event_name,
          eventDate: event.event_date,
          location: event.location,
          status,
          canCancel: status === "registered",
        };
      })
      .sort((a, b) => new Date(a.eventDate) - new Date(b.eventDate));

    res.json(result);
  }),
);

router.post(
  "/events/:eventId/register",
  asyncHandler(async (req, res) => {
    const event = await registerStudent(req.user, req.params.eventId);
    res.json({ success: true, message: `You're registered for ${event.event_name}!` });
  }),
);

router.post(
  "/events/:eventId/cancel",
  asyncHandler(async (req, res) => {
    const event = await cancelRegistration(req.user, req.params.eventId);
    res.json({
      success: true,
      message: `Your registration for ${event.event_name} was cancelled.`,
    });
  }),
);

module.exports = router;
