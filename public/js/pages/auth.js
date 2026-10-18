import { api } from "../core/api.js";
import { session } from "../core/session.js";
import { $, setBusy } from "../core/ui.js";

const DASHBOARDS = {
  student: "student.html",
  organizer: "organizer.html",
  admin: "admin.html",
};

const loginBox = $("#loginBox");
const signupBox = $("#signupBox");

function showSignup() {
  loginBox.classList.add("hidden");
  signupBox.classList.remove("hidden");
}

function showLogin() {
  signupBox.classList.add("hidden");
  loginBox.classList.remove("hidden");
}

function showMsg(elementId, message, type) {
  const element = $(`#${elementId}`);
  element.className = `message ${type}`;
  element.textContent = message;
}

// Already logged in? Go straight to the dashboard.
const existing = session.get();
if (existing && DASHBOARDS[existing.role]) {
  window.location.href = DASHBOARDS[existing.role];
}

$("#showSignup").addEventListener("click", showSignup);
$("#showLogin").addEventListener("click", showLogin);

$("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = $("#loginBtn");
  setBusy(button, true, "Logging in...");

  try {
    const { user } = await api.post("/login", {
      loginId: $("#loginId").value.trim(),
      password: $("#loginPassword").value,
    });
    session.set(user);
    showMsg("loginMessage", "✅ Login successful! Redirecting...", "success");
    setTimeout(() => (window.location.href = DASHBOARDS[user.role]), 500);
  } catch (error) {
    showMsg("loginMessage", "❌ " + error.message, "error");
    setBusy(button, false);
  }
});

const programSelect = $("#suProgram");
const sectionGroup = $("#suSectionGroup");
const sectionInput = $("#suSection");

programSelect.addEventListener("change", () => {
  const hasProgram = Boolean(programSelect.value);
  sectionGroup.classList.toggle("hidden", !hasProgram);
  sectionInput.required = hasProgram;
  if (!hasProgram) sectionInput.value = "";
});

sectionInput.addEventListener("input", () => {
  sectionInput.value = sectionInput.value.toUpperCase();
});

$("#signupForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = $("#signupBtn");

  const password = $("#suPassword").value;
  const studentId = $("#suStudentId").value.trim();
  const section = sectionInput.value.trim().toUpperCase();

  // Client-side checks for quick feedback; the server validates again.
  const problem =
    (!/^\d{10}$/.test(studentId) && "Student ID must be exactly 10 digits (e.g. 2401010063)") ||
    (!programSelect.value && "Please select a program") ||
    (!section && "Section is required when a program is selected") ||
    (password.length < 6 && "Password must be at least 6 characters") ||
    (password !== $("#suConfirm").value && "Passwords do not match");
  if (problem) return showMsg("signupMessage", "❌ " + problem, "error");

  setBusy(button, true, "Creating account...");
  try {
    await api.post("/signup", {
      firstName: $("#suFirstName").value,
      middleName: $("#suMiddleName").value,
      lastName: $("#suLastName").value,
      studentId,
      email: $("#suEmail").value,
      program: programSelect.value,
      section,
      password,
    });
    showMsg("signupMessage", "✅ Account created! You can now log in.", "success");
    $("#signupForm").reset();
    sectionGroup.classList.add("hidden");
    setTimeout(showLogin, 1200);
  } catch (error) {
    showMsg("signupMessage", "❌ " + error.message, "error");
  }
  setBusy(button, false);
});
