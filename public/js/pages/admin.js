import { api } from "../core/api.js";
import { startDashboard } from "../core/bootstrap.js";
import { $, esc, emptyState, onClick, onChange, run, toast, showMessage, setBusy, debounce } from "../core/ui.js";
import { formatDateTime, statusPill } from "../core/format.js";
import { initTabs } from "../components/tabs.js";
import { openModal, closeModal } from "../components/modal.js";
import { renderPager } from "../components/pager.js";

const ACTION_LABELS = {
  "user.created": "Account created",
  "user.deleted": "User deleted",
  "user.role_changed": "Role changed",
  "event.created": "Event created",
  "event.updated": "Event edited",
  "event.status_changed": "Event status",
  "event.deleted": "Event deleted",
  "password.changed": "Password changed",
};

const CANCELLABLE_STATUSES = ["open", "full", "closed"];

const els = {
  stats: $("#statsGrid"),
  usersBody: $("#usersBody"),
  usersPager: $("#usersPager"),
  eventsBody: $("#eventsBody"),
  auditBody: $("#auditBody"),
  auditPager: $("#auditPager"),
  search: $("#userSearch"),
  role: $("#roleFilter"),
};

let currentUser = null;
let users = [];
let events = [];
const query = { page: 1 };

const rowMessage = (columns, html) => `<tr><td colspan="${columns}" class="empty-cell">${html}</td></tr>`;

// ----- overview -----
const STAT_BOXES = [
  ["totalUsers", "Total Users"],
  ["totalStudents", "Students"],
  ["totalOrganizers", "Organizers"],
  ["totalEvents", "Events"],
  ["openEvents", "Open Events"],
  ["closedEvents", "Closed Events"],
  ["cancelledEvents", "Cancelled Events"],
  ["totalRegistrations", "Registrations"],
  ["totalAttended", "Attended"],
];

async function loadStats() {
  try {
    const report = await api.get("/admin/report");
    els.stats.innerHTML = STAT_BOXES.map(
      ([key, label]) => `<div class="stat-box"><div class="number">${report[key]}</div><div class="label">${label}</div></div>`,
    ).join("");
  } catch (error) {
    els.stats.innerHTML = emptyState(error.message);
  }
}

// ----- users -----
function roleCell(u) {
  const badge = `<span class="role-badge role-${esc(u.role)}">${esc(u.role.toUpperCase())}</span>`;
  const canChange = u.role !== "admin";
  if (!canChange) return badge;
  return `
    <select class="form-select select-small" data-change="role" data-id="${esc(u.userId)}" aria-label="Role of ${esc(u.fullName)}">
      <option value="student" ${u.role === "student" ? "selected" : ""}>Student</option>
      <option value="organizer" ${u.role === "organizer" ? "selected" : ""}>Organizer</option>
    </select>`;
}

function userRow(u) {
  const isSelf = String(u.userId) === String(currentUser.userId);
  const classGroup = [u.program, u.section].filter(Boolean).join(" · ") || "—";
  return `
    <tr>
      <td>${esc(u.fullName)}</td>
      <td>${esc(u.studentId || "—")}</td>
      <td>${esc(u.email)}</td>
      <td>${esc(classGroup)}</td>
      <td>${roleCell(u)}</td>
      <td>${isSelf
        ? '<span class="hint">You</span>'
        : `<button class="btn-small btn-danger" data-action="deleteUser" data-id="${esc(u.userId)}">Delete</button>`}</td>
    </tr>`;
}

async function loadUsers() {
  const params = new URLSearchParams({ page: query.page });
  if (els.search.value.trim()) params.set("search", els.search.value.trim());
  if (els.role.value) params.set("role", els.role.value);

  try {
    const result = await api.get(`/admin/users?${params}`);
    users = result.users;
    els.usersBody.innerHTML = users.length ? users.map(userRow).join("") : rowMessage(6, "No users found");
    renderPager(els.usersPager, result, (page) => {
      query.page = page;
      loadUsers();
    });
  } catch (error) {
    els.usersBody.innerHTML = rowMessage(6, esc(error.message));
  }
}

const reloadUsersFromFirstPage = () => {
  query.page = 1;
  loadUsers();
};

async function deleteUser(user) {
  if (!confirm(`Delete "${user.fullName}"? This also removes their registrations/events.`)) return;
  const result = await run(() => api.delete(`/admin/users/${user.userId}`));
  if (result) toast("User deleted");
  loadUsers();
  loadStats();
}

async function changeRole(select) {
  const user = users.find((u) => String(u.userId) === select.dataset.id);
  const role = select.value;
  if (!confirm(`Change ${user.fullName} from ${user.role} to ${role}?`)) {
    select.value = user.role;
    return;
  }
  const result = await run(() => api.patch(`/admin/users/${user.userId}/role`, { role }));
  if (result) toast(result.message);
  loadUsers();
  loadStats();
}

// ----- create organizer -----
const organizerModal = $("#organizerModal");
const organizerForm = $("#organizerForm");

function generatePassword() {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
}

organizerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = $("#organizerBtn");
  setBusy(button, true, "Creating...");
  try {
    const result = await api.post("/admin/organizers", {
      fullName: $("#orgName").value,
      email: $("#orgEmail").value,
      password: $("#orgPassword").value,
    });
    toast(result.message);
    organizerForm.reset();
    closeModal(organizerModal);
    loadUsers();
    loadStats();
  } catch (error) {
    showMessage($("#organizerMessage"), error.message);
  }
  setBusy(button, false);
});

// ----- events -----
function eventRow(e, index) {
  const cancel = CANCELLABLE_STATUSES.includes(e.status)
    ? `<button class="btn-small btn-warning" data-action="cancelEvent" data-id="${esc(e.eventId)}">Cancel</button>`
    : "";
  return `
    <tr>
      <td>${index + 1}</td>
      <td>${esc(e.eventName)}</td>
      <td>${esc(e.organizerName)}</td>
      <td>${esc(formatDateTime(e.eventDate))}</td>
      <td>${e.capacity}</td>
      <td>${e.registeredCount}</td>
      <td>${statusPill(e.status)}</td>
      <td class="action-cell">${cancel}<button class="btn-small btn-danger" data-action="deleteEvent" data-id="${esc(e.eventId)}">Delete</button></td>
    </tr>`;
}

async function loadEvents() {
  try {
    events = await api.get("/events");
    els.eventsBody.innerHTML = events.length ? events.map(eventRow).join("") : rowMessage(8, "No events found");
  } catch (error) {
    els.eventsBody.innerHTML = rowMessage(8, esc(error.message));
  }
}

const findEvent = (id) => events.find((e) => String(e.eventId) === String(id));

async function cancelEvent(event) {
  if (!confirm(`Cancel "${event.eventName}"? Registered students will see it as cancelled.`)) return;
  const result = await run(() => api.patch(`/events/${event.eventId}/status`, { status: "cancelled" }));
  if (result) toast("Event cancelled");
  loadEvents();
  loadStats();
}

async function deleteEvent(event) {
  if (!confirm(`Delete "${event.eventName}"? All registrations will also be removed.`)) return;
  const result = await run(() => api.delete(`/events/${event.eventId}`));
  if (result) toast("Event deleted");
  loadEvents();
  loadStats();
}

// ----- audit log -----
let auditPage = 1;

function auditRow(log) {
  return `
    <tr>
      <td class="nowrap">${esc(formatDateTime(log.createdAt))}</td>
      <td>${esc(log.actorName)} <span class="role-badge role-${esc(log.actorRole)}">${esc(log.actorRole)}</span></td>
      <td><strong>${esc(ACTION_LABELS[log.action] || log.action)}</strong><br />${esc(log.description)}</td>
    </tr>`;
}

async function loadAuditLog() {
  try {
    const result = await api.get(`/admin/audit-logs?page=${auditPage}`);
    els.auditBody.innerHTML = result.logs.length
      ? result.logs.map(auditRow).join("")
      : rowMessage(3, "No activity recorded yet");
    renderPager(els.auditPager, result, (page) => {
      auditPage = page;
      loadAuditLog();
    });
  } catch (error) {
    els.auditBody.innerHTML = rowMessage(3, esc(error.message));
  }
}

// ----- startup -----
const TAB_LOADERS = { overview: loadStats, users: loadUsers, events: loadEvents, audit: loadAuditLog };

async function init() {
  currentUser = await startDashboard({
    role: "admin",
    title: "Admin Dashboard",
    icon: "fa-user-tie",
  });
  if (!currentUser) return;

  // Each tab loads fresh data whenever it is opened.
  initTabs($("#tabs"), { onChange: (tab) => TAB_LOADERS[tab]() });

  els.search.addEventListener("input", debounce(reloadUsersFromFirstPage, 300));
  els.role.addEventListener("change", reloadUsersFromFirstPage);
  $("#refreshAuditBtn").addEventListener("click", loadAuditLog);

  $("#newOrganizerBtn").addEventListener("click", () => {
    organizerForm.reset();
    showMessage($("#organizerMessage"), "");
    openModal(organizerModal);
  });
  $("#generatePasswordBtn").addEventListener("click", () => {
    $("#orgPassword").value = generatePassword();
  });

  onClick($("#tabs"), {
    deleteUser: (el) => deleteUser(users.find((u) => String(u.userId) === el.dataset.id)),
    cancelEvent: (el) => cancelEvent(findEvent(el.dataset.id)),
    deleteEvent: (el) => deleteEvent(findEvent(el.dataset.id)),
  });
  onChange($("#tabs"), { role: changeRole });
}

init();
