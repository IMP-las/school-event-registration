const express = require("express");
const supabase = require("../config/supabase");
const asyncHandler = require("../utils/asyncHandler");
const HttpError = require("../utils/httpError");
const { unwrap, selectByIds } = require("../utils/db");
const { mapManagedEvent } = require("../utils/mappers");
const { cleanEventInput } = require("../utils/validators");
const { requireRole } = require("../middleware/auth");
const { recordAudit } = require("../services/auditService");
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
  countActiveRegistrations,
  getRegistrationCounts,
  findManageableEvent,
} = require("../services/eventService");

const router = express.Router();

const MANAGEABLE_STATUSES = Object.values(EVENT_STATUS);
const EVENT_LIST_LIMIT = 500;

async function withCounts(events) {
  const counts = await getRegistrationCounts(events.map((e) => e.id));
  return events.map((e) => {
    const registeredCount = counts.get(String(e.id)) || 0;
    return mapManagedEvent(e, resolveStatus(e, registeredCount), registeredCount);
  });
}

function assertEditable(event) {
  if (event.status === EVENT_STATUS.CANCELLED || hasEnded(event)) {
    throw new HttpError(400, "Ended or cancelled events can't be changed");
  }
}

router.post(
  "/",
  ...requireRole(ROLES.ORGANIZER),
  asyncHandler(async (req, res) => {
    const input = cleanEventInput(req.body);

    const event = unwrap(
      await supabase
        .from("events")
        .insert([
          {
            ...input,
            organizer_id: req.user.id,
            organizer_name: req.user.full_name,
            status: EVENT_STATUS.OPEN,
          },
        ])
        .select("*")
        .single(),
    );

    await recordAudit(req.user, "event.created", `Created event “${event.event_name}”`);
    res.json({ success: true, event: mapManagedEvent(event, "open", 0) });
  }),
);

router.get(
  "/mine",
  ...requireRole(ROLES.ORGANIZER),
  asyncHandler(async (req, res) => {
    await closeExpiredEvents();
    const events = unwrap(
      await supabase
        .from("events")
        .select("*")
        .eq("organizer_id", req.user.id)
        .order("event_date", { ascending: false })
        .limit(EVENT_LIST_LIMIT),
    );
    res.json(await withCounts(events));
  }),
);

router.get(
  "/",
  ...requireRole(ROLES.ADMIN),
  asyncHandler(async (req, res) => {
    await closeExpiredEvents();
    const events = unwrap(
      await supabase
        .from("events")
        .select("*")
        .order("event_date", { ascending: false })
        .limit(EVENT_LIST_LIMIT),
    );
    res.json(await withCounts(events));
  }),
);

router.put(
  "/:eventId",
  ...requireRole(ROLES.ORGANIZER),
  asyncHandler(async (req, res) => {
    const event = await findManageableEvent(req.user, req.params.eventId);
    assertEditable(event);

    const input = cleanEventInput(req.body);
    const registeredCount = await countActiveRegistrations(event.id);
    if (input.capacity < registeredCount) {
      throw new HttpError(
        400,
        `Capacity can't be lower than the ${registeredCount} students already registered`,
      );
    }

    const updated = unwrap(
      await supabase
        .from("events")
        .update(input)
        .eq("id", event.id)
        .select("*")
        .single(),
    );

    // Registrations keep a display copy of the event details.
    unwrap(
      await supabase
        .from("registrations")
        .update({
          event_name: input.event_name,
          event_date: input.event_date,
          location: input.location,
        })
        .eq("event_id", event.id),
    );

    await recordAudit(req.user, "event.updated", `Edited event “${updated.event_name}”`);
    res.json({
      success: true,
      event: mapManagedEvent(updated, resolveStatus(updated, registeredCount), registeredCount),
    });
  }),
);

router.patch(
  "/:eventId/status",
  ...requireRole(ROLES.ORGANIZER, ROLES.ADMIN),
  asyncHandler(async (req, res) => {
    const { status } = req.body;
    if (!MANAGEABLE_STATUSES.includes(status)) {
      throw new HttpError(400, "Invalid status");
    }

    const event = await findManageableEvent(req.user, req.params.eventId);
    assertEditable(event);

    unwrap(await supabase.from("events").update({ status }).eq("id", event.id));

    const verbs = {
      [EVENT_STATUS.OPEN]: "Reopened",
      [EVENT_STATUS.CLOSED]: "Closed registration for",
      [EVENT_STATUS.CANCELLED]: "Cancelled",
    };
    await recordAudit(req.user, "event.status_changed", `${verbs[status]} event “${event.event_name}”`);

    res.json({ success: true, message: "Event updated" });
  }),
);

router.get(
  "/:eventId/registrations",
  ...requireRole(ROLES.ORGANIZER, ROLES.ADMIN),
  asyncHandler(async (req, res) => {
    const event = await findManageableEvent(req.user, req.params.eventId);

    const registrations = unwrap(
      await supabase
        .from("registrations")
        .select("*")
        .eq("event_id", event.id)
        .in("status", ACTIVE_REGISTRATION_STATUSES)
        .order("student_name", { ascending: true }),
    );
    const students = await selectByIds(
      "users",
      "id",
      registrations.map((r) => r.student_id),
      "id, section",
    );
    const sectionById = new Map(students.map((s) => [String(s.id), s.section]));

    res.json({
      eventName: event.event_name,
      status: resolveStatus(event, registrations.length),
      registrations: registrations.map((r) => ({
        registrationId: r.id,
        studentName: r.student_name,
        studentIdNumber: r.student_id_number,
        program: r.program,
        section: sectionById.get(String(r.student_id)) || null,
        registrationDate: r.registration_date,
        attended: r.status === REGISTRATION_STATUS.ATTENDED,
      })),
    });
  }),
);

router.delete(
  "/:eventId",
  ...requireRole(ROLES.ORGANIZER, ROLES.ADMIN),
  asyncHandler(async (req, res) => {
    const event = await findManageableEvent(req.user, req.params.eventId);
    // Registrations are removed by the foreign key's ON DELETE CASCADE.
    unwrap(await supabase.from("events").delete().eq("id", event.id));

    await recordAudit(req.user, "event.deleted", `Deleted event “${event.event_name}”`);
    res.json({ success: true, message: "Event deleted" });
  }),
);

module.exports = router;
