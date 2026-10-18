import { api } from "../core/api.js";
import { startDashboard } from "../core/bootstrap.js";
import { $, esc, emptyState, onClick, debounce, run, toast } from "../core/ui.js";
import { formatDateTime, statusPill } from "../core/format.js";
import { initTabs } from "../components/tabs.js";

const DAY_MS = 24 * 60 * 60 * 1000;

const state = { events: [], registrations: [] };

const els = {
  events: $("#eventsList"),
  upcoming: $("#upcomingList"),
  history: $("#historyList"),
  search: $("#searchInput"),
  status: $("#statusFilter"),
  range: $("#rangeFilter"),
};

const cardMeta = (eventDate, location) => `
  <p><i class="fa-solid fa-calendar"></i> ${esc(formatDateTime(eventDate))}</p>
  <p><i class="fa-solid fa-map-pin"></i> ${esc(location)}</p>`;

const cancelButton = (eventId) =>
  `<button class="btn-small btn-danger" data-action="cancel" data-id="${esc(eventId)}">Cancel registration</button>`;

function eventCard(e) {
  const action = e.isRegistered
    ? cancelButton(e.eventId)
    : `<button class="btn-small btn-primary" data-action="register" data-id="${esc(e.eventId)}" ${e.status === "full" ? "disabled" : ""}>
        ${e.status === "full" ? "Event Full" : "Register"}
      </button>`;

  return `
    <div class="card">
      ${statusPill(e.status)}${e.isRegistered ? statusPill("registered") : ""}
      <h3>${esc(e.eventName)}</h3>
      <p>${esc(e.description)}</p>
      ${cardMeta(e.eventDate, e.location)}
      <div class="btn-group">${action}</div>
    </div>`;
}

function registrationCard(r) {
  return `
    <div class="card">
      ${statusPill(r.status)}
      <h3>${esc(r.eventName)}</h3>
      ${cardMeta(r.eventDate, r.location)}
      ${r.canCancel ? `<div class="btn-group">${cancelButton(r.eventId)}</div>` : ""}
    </div>`;
}

const grid = (items, render) => `<div class="cards-grid">${items.map(render).join("")}</div>`;

function filteredEvents() {
  const query = els.search.value.trim().toLowerCase();
  const status = els.status.value;
  const days = Number(els.range.value);

  return state.events.filter((e) => {
    const haystack = `${e.eventName} ${e.location} ${e.description}`.toLowerCase();
    const inRange = !days || new Date(e.eventDate) - Date.now() <= days * DAY_MS;
    return (!query || haystack.includes(query)) && (status === "all" || e.status === status) && inRange;
  });
}

function renderEvents() {
  const events = filteredEvents();
  const message = state.events.length === 0 ? "No events available right now." : "No events match your search.";
  els.events.innerHTML = events.length ? grid(events, eventCard) : emptyState(message);
}

function renderRegistrations() {
  const upcoming = state.registrations.filter((r) => r.status === "registered");
  const history = state.registrations.filter((r) => r.status !== "registered").reverse();

  els.upcoming.innerHTML = upcoming.length
    ? grid(upcoming, registrationCard)
    : emptyState("You have no upcoming registrations.");
  els.history.innerHTML = history.length
    ? grid(history, registrationCard)
    : emptyState("Your past and cancelled registrations will show up here.");

  $("#upcomingCount").textContent = upcoming.length || "";
  $("#historyCount").textContent = history.length || "";
}

async function loadAll() {
  try {
    [state.events, state.registrations] = await Promise.all([
      api.get("/student/events"),
      api.get("/student/registrations"),
    ]);
    renderEvents();
    renderRegistrations();
  } catch (error) {
    const failure = emptyState(error.message || "Could not load events.");
    els.events.innerHTML = els.upcoming.innerHTML = els.history.innerHTML = failure;
  }
}

async function changeRegistration(eventId, action) {
  const result = await run(() => api.post(`/student/events/${eventId}/${action}`));
  if (result) toast(result.message);
  await loadAll();
}

async function init() {
  const user = await startDashboard({
    role: "student",
    title: "Student Dashboard",
    icon: "fa-circle-user",
  });
  if (!user) return;

  initTabs($("#tabs"));
  [els.status, els.range].forEach((el) => el.addEventListener("change", renderEvents));
  els.search.addEventListener("input", debounce(renderEvents, 150));

  onClick($("#tabs"), {
    register: (el) => changeRegistration(el.dataset.id, "register"),
    cancel: (el) => {
      if (confirm("Cancel your registration for this event?")) {
        changeRegistration(el.dataset.id, "cancel");
      }
    },
  });

  loadAll();
}

init();
