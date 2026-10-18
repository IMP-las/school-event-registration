const supabase = require("../config/supabase");
const HttpError = require("../utils/httpError");
const { selectByIds } = require("../utils/db");
const {
  ROLES,
  EVENT_STATUS,
  ACTIVE_REGISTRATION_STATUSES,
  EVENT_CLOSE_GRACE_MINUTES,
} = require("../config/constants");

const graceMs = EVENT_CLOSE_GRACE_MINUTES * 60 * 1000;

const hasEnded = (event, now = Date.now()) =>
  new Date(event.event_date).getTime() + graceMs <= now;

/*
 * The status shown to users. The stored `status` only says open / closed /
 * cancelled; "ended" and "full" are derived so they are always accurate, even
 * before the scheduler has had a chance to update the row.
 */
function resolveStatus(event, registeredCount) {
  if (event.status === EVENT_STATUS.CANCELLED) return "cancelled";
  if (hasEnded(event)) return "ended";
  if (event.status === EVENT_STATUS.CLOSED) return "closed";
  return registeredCount >= event.capacity ? "full" : "open";
}

// Persist the auto-close: every open event whose time has passed becomes closed.
async function closeExpiredEvents() {
  try {
    const cutoff = new Date(Date.now() - graceMs).toISOString();
    const { error } = await supabase
      .from("events")
      .update({ status: EVENT_STATUS.CLOSED })
      .eq("status", EVENT_STATUS.OPEN)
      .lte("event_date", cutoff);
    if (error) throw error;
  } catch (err) {
    console.error("Could not auto-close events:", err.message);
  }
}

async function countActiveRegistrations(eventId) {
  const { count, error } = await supabase
    .from("registrations")
    .select("*", { count: "exact", head: true })
    .eq("event_id", eventId)
    .in("status", ACTIVE_REGISTRATION_STATUSES);
  if (error) throw error;
  return count || 0;
}

// Registered counts for many events at once (uses the event_registration_counts view).
async function getRegistrationCounts(eventIds) {
  const rows = await selectByIds(
    "event_registration_counts",
    "event_id",
    eventIds,
    "event_id, registered_count",
  );
  return new Map(rows.map((r) => [String(r.event_id), r.registered_count]));
}

async function findEvent(eventId) {
  const { data: event, error } = await supabase
    .from("events")
    .select("*")
    .eq("id", eventId)
    .maybeSingle();
  if (error || !event) throw new HttpError(404, "Event not found");
  return event;
}

// Organizers may only touch their own events; admins may touch any.
async function findManageableEvent(user, eventId) {
  const event = await findEvent(eventId);
  const isOwner = String(event.organizer_id) === String(user.id);
  if (user.role === ROLES.ORGANIZER && !isOwner) {
    throw new HttpError(403, "You can only manage your own events.");
  }
  return event;
}

module.exports = {
  hasEnded,
  resolveStatus,
  closeExpiredEvents,
  countActiveRegistrations,
  getRegistrationCounts,
  findEvent,
  findManageableEvent,
};
