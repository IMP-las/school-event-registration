import { api } from "../core/api.js";
import { session } from "../core/session.js";
import { $, esc, toast, showMessage, setBusy } from "../core/ui.js";
import { openModal, closeModal } from "./modal.js";

const PASSWORD_MIN_LENGTH = 6;

// What each role may edit, and what is shown read-only.
function editableFields(user) {
  if (user.role === "student") {
    return [
      { id: "firstName", label: "First name", value: user.firstName, required: true },
      { id: "middleName", label: "Middle name", value: user.middleName, hint: "Optional" },
      { id: "lastName", label: "Last name", value: user.lastName, required: true },
      { id: "section", label: "Section", value: user.section, required: true, maxLength: 10, upper: true },
    ];
  }
  return [{ id: "fullName", label: "Full name", value: user.fullName, required: true }];
}

function readOnlyDetails(user) {
  const details = [["Email", user.email]];
  if (user.role === "student") {
    details.unshift(["Student ID", user.studentId], ["Program", user.program]);
  } else {
    details.push(["Role", user.role[0].toUpperCase() + user.role.slice(1)]);
  }
  return details;
}

const fieldHtml = (f) => `
  <div class="form-group">
    <label class="form-label" for="set_${f.id}">${esc(f.label)}</label>
    <input class="form-input" id="set_${f.id}" name="${f.id}" type="text"
      value="${esc(f.value)}" ${f.required ? "required" : ""}
      ${f.maxLength ? `maxlength="${f.maxLength}"` : ""} />
    ${f.hint ? `<div class="hint">${esc(f.hint)}</div>` : ""}
  </div>`;

const TEMPLATE = `
  <div class="modal" id="settingsModal">
    <div class="modal-box">
      <div class="modal-header">
        <h2>Settings</h2>
        <button type="button" class="icon-btn" data-close-modal aria-label="Close">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>

      <div class="message error hidden" id="forcedNotice"></div>

      <section id="profileSection">
        <h3 class="subheading">Profile</h3>
        <dl class="details" id="profileDetails"></dl>
        <form id="profileForm"></form>
        <div id="profileMessage"></div>
      </section>

      <section>
        <h3 class="subheading">Change password</h3>
        <form id="passwordForm">
          <div class="form-group">
            <label class="form-label" for="currentPassword">Current password</label>
            <input class="form-input" id="currentPassword" type="password" autocomplete="current-password" required />
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label" for="newPassword">New password</label>
              <input class="form-input" id="newPassword" type="password" autocomplete="new-password" required />
            </div>
            <div class="form-group">
              <label class="form-label" for="confirmPassword">Confirm new password</label>
              <input class="form-input" id="confirmPassword" type="password" autocomplete="new-password" required />
            </div>
          </div>
          <button type="submit" class="submit-btn" id="passwordBtn">Update password</button>
        </form>
        <div id="passwordMessage"></div>
      </section>
    </div>
  </div>`;

export function createSettings({ onUpdate }) {
  const host = document.createElement("div");
  host.innerHTML = TEMPLATE;
  document.body.append(host);

  const modal = $("#settingsModal", host);
  const profileForm = $("#profileForm", host);
  const passwordForm = $("#passwordForm", host);
  let resolveForced = null;

  function renderProfile() {
    const user = session.get();
    $("#profileDetails", host).innerHTML = readOnlyDetails(user)
      .map(([label, value]) => `<dt>${esc(label)}</dt><dd>${esc(value || "—")}</dd>`)
      .join("");
    profileForm.innerHTML = `
      ${editableFields(user).map(fieldHtml).join("")}
      <button type="submit" class="submit-btn" id="profileBtn">Save profile</button>`;
    const section = profileForm.elements.section;
    if (section) section.addEventListener("input", () => (section.value = section.value.toUpperCase()));
  }

  function setForcedMode(isForced) {
    modal.dataset.locked = String(isForced);
    $("#forcedNotice", host).classList.toggle("hidden", !isForced);
    $("#forcedNotice", host).textContent = isForced
      ? "You're using a temporary password. Choose a new password to continue."
      : "";
    $("#profileSection", host).classList.toggle("hidden", isForced);
    modal.querySelectorAll("[data-close-modal]").forEach((b) => b.classList.toggle("hidden", isForced));
  }

  profileForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = $("#profileMessage", host);
    const button = $("#profileBtn", host);
    const body = Object.fromEntries(
      editableFields(session.get()).map((f) => [f.id, profileForm.elements[f.id].value]),
    );

    setBusy(button, true, "Saving...");
    try {
      const { user } = await api.put("/profile", body);
      session.set(user);
      onUpdate(user);
      renderProfile();
      showMessage(message, "", "");
      toast("Profile updated");
    } catch (error) {
      showMessage(message, error.message);
      setBusy(button, false);
    }
  });

  passwordForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = $("#passwordMessage", host);
    const button = $("#passwordBtn", host);
    const currentPassword = $("#currentPassword", host).value;
    const newPassword = $("#newPassword", host).value;

    if (newPassword.length < PASSWORD_MIN_LENGTH) {
      return showMessage(message, `New password must be at least ${PASSWORD_MIN_LENGTH} characters`);
    }
    if (newPassword !== $("#confirmPassword", host).value) {
      return showMessage(message, "New passwords do not match");
    }

    setBusy(button, true, "Updating...");
    try {
      const { user } = await api.put("/profile/password", { currentPassword, newPassword });
      session.set(user);
      passwordForm.reset();
      showMessage(message, "", "");
      toast("Password updated");
      if (resolveForced) {
        setForcedMode(false);
        closeModal(modal);
        resolveForced();
        resolveForced = null;
      }
    } catch (error) {
      showMessage(message, error.message);
    }
    setBusy(button, false);
  });

  return {
    open() {
      setForcedMode(false);
      renderProfile();
      showMessage($("#profileMessage", host), "", "");
      showMessage($("#passwordMessage", host), "", "");
      openModal(modal);
    },

    // Resolves once the user has replaced their temporary password.
    requirePasswordChange() {
      renderProfile();
      setForcedMode(true);
      openModal(modal);
      return new Promise((resolve) => (resolveForced = resolve));
    },
  };
}
