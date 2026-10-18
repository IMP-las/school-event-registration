import { esc } from "./ui.js";

const LOCALE = "en-PH";

export const formatDate = (iso) =>
  new Date(iso).toLocaleDateString(LOCALE, { year: "numeric", month: "short", day: "numeric" });

export const formatDateTime = (iso) =>
  new Date(iso).toLocaleString(LOCALE, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

// <input type="datetime-local"> gives local time without a zone; send an unambiguous instant.
export const localInputToIso = (value) => new Date(value).toISOString();

export function isoToLocalInput(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const STATUS_META = {
  open: { label: "Open", className: "status-open" },
  full: { label: "Full", className: "status-full" },
  closed: { label: "Closed", className: "status-closed" },
  ended: { label: "Ended", className: "status-ended" },
  cancelled: { label: "Cancelled", className: "status-cancelled" },
  registered: { label: "Registered", className: "status-registered" },
  attended: { label: "Attended", className: "status-open" },
  event_cancelled: { label: "Event cancelled", className: "status-cancelled" },
};

export const statusLabel = (code) => STATUS_META[code]?.label ?? code;

export function statusPill(code) {
  const meta = STATUS_META[code] ?? { label: code, className: "" };
  return `<span class="status-pill ${meta.className}">${esc(meta.label)}</span>`;
}
