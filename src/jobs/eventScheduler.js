const { closeExpiredEvents } = require("../services/eventService");
const { SCHEDULER_INTERVAL_MS } = require("../config/constants");

/*
 * Closes events whose time has passed. Only used when the server runs as a
 * long-lived process. On serverless hosts (e.g. Vercel) no timer survives, so
 * the same sweep also runs at the start of every event-related request.
 */
function startEventScheduler() {
  closeExpiredEvents();
  return setInterval(closeExpiredEvents, SCHEDULER_INTERVAL_MS);
}

module.exports = { startEventScheduler };
