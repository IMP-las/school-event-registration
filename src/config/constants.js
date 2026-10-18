const ROLES = { STUDENT: "student", ORGANIZER: "organizer", ADMIN: "admin" };

const EVENT_STATUS = { OPEN: "open", CLOSED: "closed", CANCELLED: "cancelled" };

const REGISTRATION_STATUS = {
  REGISTERED: "registered",
  ATTENDED: "attended",
  CANCELLED: "cancelled",
};

module.exports = {
  ROLES,
  EVENT_STATUS,
  REGISTRATION_STATUS,
  ACTIVE_REGISTRATION_STATUSES: [
    REGISTRATION_STATUS.REGISTERED,
    REGISTRATION_STATUS.ATTENDED,
  ],
  VALID_PROGRAMS: ["EN", "CpE", "IT", "CS"],
  PASSWORD_MIN_LENGTH: 6,
  PASSWORD_MAX_LENGTH: 72,
  // Registration closes this many minutes after an event's start time (0 = at start).
  EVENT_CLOSE_GRACE_MINUTES: Number(process.env.EVENT_CLOSE_GRACE_MINUTES) || 0,
  SCHEDULER_INTERVAL_MS: 60 * 1000,
};
