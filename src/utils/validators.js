const HttpError = require("./httpError");
const {
  VALID_PROGRAMS,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
} = require("../config/constants");

const NAME_PATTERN = /^[\p{L}][\p{L}\p{M} .'’-]*$/u;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STUDENT_ID_PATTERN = /^\d{10}$/;
const SECTION_PATTERN = /^[A-Z0-9 -]{1,10}$/;

const bad = (message) => new HttpError(400, message);
const text = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

function cleanName(value, label, { required = true, max = 50 } = {}) {
  const name = text(value);
  if (!name) {
    if (required) throw bad(`${label} is required`);
    return "";
  }
  if (name.length > max) throw bad(`${label} must be ${max} characters or fewer`);
  if (!NAME_PATTERN.test(name)) throw bad(`${label} contains invalid characters`);
  return name;
}

function cleanStudentName(body) {
  const firstName = cleanName(body.firstName, "First name");
  const middleName = cleanName(body.middleName, "Middle name", { required: false });
  const lastName = cleanName(body.lastName, "Last name");
  return { firstName, middleName, lastName };
}

const composeFullName = ({ firstName, middleName, lastName }) =>
  [firstName, middleName, lastName].filter(Boolean).join(" ");

function cleanEmail(value) {
  const email = text(value).toLowerCase();
  if (!email) throw bad("Email is required");
  if (!EMAIL_PATTERN.test(email)) throw bad("Invalid email format");
  return email;
}

function cleanStudentId(value) {
  const studentId = text(value);
  if (!STUDENT_ID_PATTERN.test(studentId)) {
    throw bad("Student ID must be in format 2401010063 (10 digits)");
  }
  return studentId;
}

function cleanProgram(value) {
  if (!VALID_PROGRAMS.includes(value)) throw bad("Please select a valid program");
  return value;
}

function cleanSection(value) {
  const section = text(value).toUpperCase();
  if (!section) throw bad("Section is required");
  if (!SECTION_PATTERN.test(section)) {
    throw bad("Section must be up to 10 letters, numbers or dashes");
  }
  return section;
}

function cleanPassword(value, label = "Password") {
  const password = String(value ?? "");
  if (!password) throw bad(`${label} is required`);
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw bad(`${label} must be at least ${PASSWORD_MIN_LENGTH} characters`);
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    throw bad(`${label} must be ${PASSWORD_MAX_LENGTH} characters or fewer`);
  }
  return password;
}

function cleanEventInput(body) {
  const eventName = text(body.eventName);
  const description = String(body.description ?? "").trim();
  const location = text(body.location);
  const capacity = Number(body.capacity);
  const eventDate = new Date(body.eventDate);

  if (!eventName || !description || !location || !body.eventDate || !body.capacity) {
    throw bad("All fields are required");
  }
  if (eventName.length > 100) throw bad("Event name must be 100 characters or fewer");
  if (location.length > 100) throw bad("Location must be 100 characters or fewer");
  if (description.length > 1000) {
    throw bad("Description must be 1000 characters or fewer");
  }
  if (!Number.isInteger(capacity) || capacity < 1) {
    throw bad("Capacity must be a whole number greater than 0");
  }
  if (Number.isNaN(eventDate.getTime())) throw bad("Invalid event date");
  if (eventDate.getTime() <= Date.now()) throw bad("Event date must be in the future");

  return {
    event_name: eventName,
    description,
    location,
    capacity,
    event_date: eventDate.toISOString(),
  };
}

module.exports = {
  cleanName,
  cleanStudentName,
  composeFullName,
  cleanEmail,
  cleanStudentId,
  cleanProgram,
  cleanSection,
  cleanPassword,
  cleanEventInput,
};
