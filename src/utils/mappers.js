// DB rows use snake_case; the API speaks camelCase.

function mapUser(u) {
  return {
    userId: u.id,
    fullName: u.full_name,
    firstName: u.first_name || null,
    middleName: u.middle_name || null,
    lastName: u.last_name || null,
    role: u.role,
    email: u.email,
    studentId: u.student_id || null,
    program: u.program || null,
    section: u.section || null,
    mustChangePassword: Boolean(u.must_change_password),
  };
}

function mapManagedEvent(e, status, registeredCount) {
  return {
    eventId: e.id,
    eventName: e.event_name,
    description: e.description,
    eventDate: e.event_date,
    location: e.location,
    capacity: e.capacity,
    organizerId: e.organizer_id,
    organizerName: e.organizer_name,
    status,
    registeredCount,
  };
}

module.exports = { mapUser, mapManagedEvent };
