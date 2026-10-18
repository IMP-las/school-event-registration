import { $, esc } from "../core/ui.js";
import { session } from "../core/session.js";

export function mountNavbar({ title, icon, user, onSettings }) {
  const root = $("#navbar");
  root.className = "navbar";
  root.innerHTML = `
    <div class="icon-text-container">
      <i class="fa-solid ${esc(icon)}"></i>
      <h2>${esc(title)}</h2>
    </div>
    <div class="right">
      <span class="user-name" id="userName">${esc(user.fullName)}</span>
      <button class="nav-btn" id="settingsBtn" type="button">
        <i class="fa-solid fa-gear"></i> Settings
      </button>
      <button class="logout-btn" id="logoutBtn" type="button">Logout</button>
    </div>`;

  $("#settingsBtn", root).addEventListener("click", onSettings);
  $("#logoutBtn", root).addEventListener("click", session.logout);

  return {
    setName(name) {
      $("#userName", root).textContent = name;
    },
  };
}
