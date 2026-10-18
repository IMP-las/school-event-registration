import { api } from "../core/api.js";
import { startDashboard } from "../core/bootstrap.js";
import { $, esc, emptyState, onClick, onChange, run, toast, showMessage, setBusy } from "../core/ui.js";
import { formatDate, formatDateTime, statusPill, isoToLocalInput, localInputToIso } from "../core/format.js";
import { openModal, closeModal } from "../components/modal.js";

// Which actions each event status offers (a full event behaves like an open one).
const ACTIONS_BY_STATUS = {
  open: ["attendance", "edit", "close", "cancel", "delete"],
  full: ["attendance", "edit", "close", "cancel", "delete"],
  closed: ["attendance", "edit", "reopen", "cancel", "delete"],
  ended: ["attendance", "delete"],
  cancelled: ["attendance", "delete"],
};

const ACTIONS = {
  attendance: { label: "Attendance", className: "btn-primary" },
  edit: { label: "Edit", className: "btn-secondary" },
  close: { label: "Close registration", className: "btn-secondary" },
  reopen: { label: "Reopen", className: "btn-success" },
  cancel: { label: "Cancel event", className: "btn-warning" },
  delete: { label: "Delete", className: "btn-danger" },
};

const eventsContainer = $("#myEvents");
const eventModal = $("#eventModal");
const eventForm = $("#eventForm");
const participantModal = $("#participantModal");

let events = [];
let editingEventId = null;

const fields = {
  name: $("#eventName"),
  date: $("#eventDate"),
  location: $("#eventLocation"),
  capacity: $("#eventCapacity"),
  description: $("#eventDesc"),
};

const findEvent = (id) => events.find((e) => String(e.eventId) === String(id));

function eventCard(e) {
  const buttons = ACTIONS_BY_STATUS[e.status]
    .map((key) => `<button class="btn-small ${ACTIONS[key].className}" data-action="${key}" data-id="${esc(e.eventId)}">${ACTIONS[key].label}</button>`)
    .join("");

  return `
    <div class="card">
      ${statusPill(e.status)}
      <h3>${esc(e.eventName)}</h3>
      <p>${esc(e.description)}</p>
      <p><i class="fa-solid fa-calendar"></i> ${esc(formatDateTime(e.eventDate))}</p>
      <p><i class="fa-solid fa-map-pin"></i> ${esc(e.location)}</p>
      <p><i class="fa-solid fa-users"></i> Registered: <strong>${e.registeredCount}</strong> / ${e.capacity}</p>
      <div class="btn-group">${buttons}</div>
    </div>`;
}

async function loadEvents() {
  try {
    events = await api.get("/events/mine");
    eventsContainer.innerHTML = events.length
      ? `<div class="cards-grid">${events.map(eventCard).join("")}</div>`
      : emptyState("You haven't created any events yet.");
  } catch (error) {
    eventsContainer.innerHTML = emptyState(error.message);
  }
}

// ----- create / edit -----
function openEventForm(event) {
  editingEventId = event ? event.eventId : null;
  $("#eventModalTitle").textContent = event ? "Edit Event" : "New Event";
  $("#eventSubmitBtn").textContent = event ? "Save Changes" : "Create Event";
  showMessage($("#eventFormMessage"), "");

  fields.name.value = event?.eventName ?? "";
  fields.date.value = event ? isoToLocalInput(event.eventDate) : "";
  fields.location.value = event?.location ?? "";
  fields.capacity.value = event?.capacity ?? "";
  fields.description.value = event?.description ?? "";
  fields.date.min = isoToLocalInput(new Date().toISOString());

  openModal(eventModal);
}

eventForm.addEventListener("submit", async (submitEvent) => {
  submitEvent.preventDefault();
  const button = $("#eventSubmitBtn");
  const body = {
    eventName: fields.name.value,
    eventDate: fields.date.value ? localInputToIso(fields.date.value) : "",
    location: fields.location.value,
    capacity: Number(fields.capacity.value),
    description: fields.description.value,
  };

  setBusy(button, true, "Saving...");
  try {
    if (editingEventId) await api.put(`/events/${editingEventId}`, body);
    else await api.post("/events", body);
    closeModal(eventModal);
    toast(editingEventId ? "Event updated" : "Event created");
    loadEvents();
  } catch (error) {
    showMessage($("#eventFormMessage"), error.message);
  }
  setBusy(button, false);
});

// ----- status changes / delete -----
async function changeStatus(event, status, confirmation) {
  if (confirmation && !confirm(confirmation)) return;
  const result = await run(() => api.patch(`/events/${event.eventId}/status`, { status }));
  if (result) toast("Event updated");
  loadEvents();
}

async function deleteEvent(event) {
  if (!confirm(`Delete "${event.eventName}"? All registrations will also be removed.`)) return;
  const result = await run(() => api.delete(`/events/${event.eventId}`));
  if (result) toast("Event deleted");
  loadEvents();
}

// ----- attendance -----
function updateAttendanceSummary() {
  const boxes = [...participantModal.querySelectorAll("[data-change='attendance']")];
  const present = boxes.filter((b) => b.checked).length;
  $("#attendanceSummary").textContent = boxes.length
    ? `${present} of ${boxes.length} marked present`
    : "";
}

function participantRow(r, index, locked) {
  const classGroup = [r.program, r.section].filter(Boolean).join(" · ") || "—";
  return `
    <tr>
      <td>${index + 1}</td>
      <td>${esc(r.studentName)}</td>
      <td>${esc(r.studentIdNumber || "—")}</td>
      <td>${esc(classGroup)}</td>
      <td>${esc(r.registrationDate ? formatDate(r.registrationDate) : "—")}</td>
      <td>
        <input type="checkbox" class="attendance-box" data-change="attendance" data-id="${esc(r.registrationId)}"
          aria-label="Present: ${esc(r.studentName)}" ${r.attended ? "checked" : ""} ${locked ? "disabled" : ""} />
      </td>
    </tr>`;
}

async function openAttendance(event) {
  const result = await run(() => api.get(`/events/${event.eventId}/registrations`));
  if (!result) return;

  $("#participantTitle").textContent = `Participants — ${result.eventName}`;
  const locked = result.status === "cancelled";
  $("#participantBody").innerHTML = result.registrations.length
    ? result.registrations.map((r, i) => participantRow(r, i, locked)).join("")
    : '<tr><td colspan="6" class="empty-cell">No registrations yet</td></tr>';
  updateAttendanceSummary();
  openModal(participantModal);
}

async function saveAttendance(checkbox) {
  const attended = checkbox.checked;
  const result = await run(() => api.patch(`/registrations/${checkbox.dataset.id}/attendance`, { attended }));
  if (!result) checkbox.checked = !attended;
  updateAttendanceSummary();
}

async function init() {
  const user = await startDashboard({
    role: "organizer",
    title: "Organizer Dashboard",
    icon: "fa-users-gear",
  });
  if (!user) return;

  $("#newEventBtn").addEventListener("click", () => openEventForm(null));

  onClick(eventsContainer, {
    attendance: (el) => openAttendance(findEvent(el.dataset.id)),
    edit: (el) => openEventForm(findEvent(el.dataset.id)),
    close: (el) => changeStatus(findEvent(el.dataset.id), "closed", "Close registration for this event? Students won't be able to join until you reopen it."),
    reopen: (el) => changeStatus(findEvent(el.dataset.id), "open"),
    cancel: (el) => changeStatus(findEvent(el.dataset.id), "cancelled", "Cancel this event? Registered students will see it as cancelled. This can't be undone."),
    delete: (el) => deleteEvent(findEvent(el.dataset.id)),
  });
  onChange(participantModal, { attendance: saveAttendance });

  loadEvents();
}

init();
