const supabase = require("../config/supabase");
const HttpError = require("../utils/httpError");
const { unwrap } = require("../utils/db");
const {
  EVENT_STATUS,
  REGISTRATION_STATUS,
  ACTIVE_REGISTRATION_STATUSES,
} = require("../config/constants");
const {
  hasEnded,
  closeExpiredEvents,
  countActiveRegistrations,
  findEvent,
} = require("./eventService");

const today = () => new Date().toISOString().split("T")[0];
const fail = (message) => new HttpError(400, message);

async function registerStudent(user, eventId) {
  await closeExpiredEvents();
  const event = await findEvent(eventId);

  if (event.status === EVENT_STATUS.CANCELLED) throw fail("This event was cancelled");
  if (event.status !== EVENT_STATUS.OPEN || hasEnded(event)) {
    throw fail("This event is closed");
  }
  if ((await countActiveRegistrations(event.id)) >= event.capacity) {
    throw fail("Sorry, this event is already full");
  }

  const [previous] = unwrap(
    await supabase
      .from("registrations")
      .select("id, status")
      .eq("event_id", event.id)
      .eq("student_id", user.id)
      .limit(1),
  );
  if (previous && ACTIVE_REGISTRATION_STATUSES.includes(previous.status)) {
    throw fail("You are already registered for this event");
  }

  const fields = {
    status: REGISTRATION_STATUS.REGISTERED,
    registration_date: today(),
    student_name: user.full_name,
    student_id_number: user.student_id || null,
    program: user.program || null,
    event_name: event.event_name,
    event_date: event.event_date,
    location: event.location,
  };

  // A student who cancelled earlier gets their old row back instead of a duplicate.
  if (previous) {
    unwrap(await supabase.from("registrations").update(fields).eq("id", previous.id));
  } else {
    unwrap(
      await supabase
        .from("registrations")
        .insert([{ ...fields, student_id: user.id, event_id: event.id }]),
    );
  }

  // Two students can pass the seat check at the same moment; undo if we overshot.
  if ((await countActiveRegistrations(event.id)) > event.capacity) {
    if (previous) {
      await supabase
        .from("registrations")
        .update({ status: REGISTRATION_STATUS.CANCELLED })
        .eq("id", previous.id);
    } else {
      await supabase
        .from("registrations")
        .delete()
        .eq("event_id", event.id)
        .eq("student_id", user.id);
    }
    throw fail("Sorry, this event is already full");
  }

  return event;
}

async function cancelRegistration(user, eventId) {
  const event = await findEvent(eventId);
  if (event.status === EVENT_STATUS.CANCELLED || hasEnded(event)) {
    throw fail("This event has already ended or was cancelled");
  }

  const updated = unwrap(
    await supabase
      .from("registrations")
      .update({ status: REGISTRATION_STATUS.CANCELLED })
      .eq("event_id", event.id)
      .eq("student_id", user.id)
      .eq("status", REGISTRATION_STATUS.REGISTERED)
      .select("id"),
  );
  if (updated.length === 0) throw fail("You are not registered for this event");

  return event;
}

module.exports = { registerStudent, cancelRegistration };
