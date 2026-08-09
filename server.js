/*
=================================================================
SCHOOL EVENT REGISTRATION SYSTEM — v2
Implements: system_algorithm_v2.md
=================================================================

KEY CHANGES FROM v1:
  - Students self-register via /api/signup (Student ID, Program added)
  - Admin "Add User" endpoint REMOVED — admin can only view/delete
  - Event now has: location, capacity, status ("open"/"closed"/"cancelled")
  - Registration checks capacity + duplicate + event status internally
  - Student-facing endpoints return simplified data (no IDs/capacity shown)
  - Organizer/Admin endpoints still return full data (IDs, capacity, etc.)

FIRESTORE COLLECTIONS:
  users          { fullName, studentId?, email, program?, password(hashed), role, createdAt }
  events         { eventName, description, eventDate, location, capacity, organizerId, organizerName, status, createdAt }
  registrations  { studentId, studentName, studentIdNumber, program, eventId, eventName,
                    eventDate, location, registrationDate, status }
=================================================================
*/

const express = require("express");
const cors = require("cors");
const path = require("path");
const bcrypt = require("bcryptjs");
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// ===== FIREBASE SETUP =====
const serviceAccount = require("./serviceAccountKey.json");
initializeApp({
   credential: cert(serviceAccount)
});
const db = getFirestore();

const VALID_PROGRAMS = ["EN", "CpE", "IT", "CS", "EE", "CE"];

// ===== SEED STAFF ACCOUNTS (organizer/admin only — students sign up themselves) =====
async function seedStaff() {
  const snap = await db
    .collection("users")
    .where("role", "in", ["organizer", "admin"])
    .get();
  if (!snap.empty) return;

  console.log("🌱 Seeding organizer & admin accounts...");
  const orgPass = await bcrypt.hash("pass123", 10);
  const adminPass = await bcrypt.hash("admin123", 10);

  await db.collection("users").add({
    fullName: "Mark Organizer",
    email: "org1@school.com",
    password: orgPass,
    role: "organizer",
    createdAt: new Date().toISOString(),
  });
  await db.collection("users").add({
    fullName: "Admin User",
    email: "admin@school.com",
    password: adminPass,
    role: "admin",
    createdAt: new Date().toISOString(),
  });
  console.log("✅ Staff accounts ready.");
}

// ===== HELPERS =====
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function getRegisteredCount(eventId) {
  const snap = await db
    .collection("registrations")
    .where("eventId", "==", eventId)
    .where("status", "==", "registered")
    .get();
  return snap.size;
}

// ===== 1. STUDENT SIGN UP =====
app.post("/api/signup", async (req, res) => {
  const { fullName, studentId, email, program, password } = req.body;

  if (!fullName || !fullName.trim()) {
    return res
      .status(400)
      .json({ success: false, message: "Full name is required" });
  }

  if (!studentId || !/^\d{10}$/.test(studentId)) {
    return res.status(400).json({
      success: false,
      message: "Student ID must be in format 2401010063 (10 digits)",
    });
  }

  const dupId = await db
    .collection("users")
    .where("studentId", "==", studentId)
    .get();
  if (!dupId.empty) {
    return res.status(400).json({
      success: false,
      message: "This Student ID is already registered",
    });
  }

  if (!email || !isValidEmail(email)) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid email format" });
  }

  const dupEmail = await db
    .collection("users")
    .where("email", "==", email)
    .get();
  if (!dupEmail.empty) {
    return res
      .status(400)
      .json({ success: false, message: "Email is already registered" });
  }

  if (!VALID_PROGRAMS.includes(program)) {
    return res
      .status(400)
      .json({ success: false, message: "Please select a valid program" });
  }

  if (!password || password.length < 6) {
    return res.status(400).json({
      success: false,
      message: "Password must be at least 6 characters",
    });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = {
      fullName,
      studentId,
      email,
      program,
      password: hashedPassword,
      role: "student",
      createdAt: new Date().toISOString(),
    };

    const ref = await db.collection("users").add(newUser);
    res.json({
      success: true,
      message: "Account created successfully! You can now log in.",
      userId: ref.id,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Database error occurred. Please try again.",
    });
  }
});

// ===== 2. LOGIN (by Student ID or Email) =====
app.post("/api/login", async (req, res) => {
  const { loginId, password } = req.body;

  if (!loginId || !password) {
    return res
      .status(400)
      .json({ success: false, message: "All fields are required" });
  }

  try {
    // Try matching by studentId first, then by email
    let snap = await db
      .collection("users")
      .where("studentId", "==", loginId)
      .get();
    if (snap.empty) {
      snap = await db.collection("users").where("email", "==", loginId).get();
    }

    if (snap.empty) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials" });
    }

    const userDoc = snap.docs[0];
    const user = userDoc.data();

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials" });
    }

    res.json({
      success: true,
      user: {
        userId: userDoc.id,
        fullName: user.fullName,
        role: user.role,
        email: user.email,
        studentId: user.studentId || null,
        program: user.program || null,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ===== 3. STUDENT: GET AVAILABLE EVENTS (simplified — no ID/capacity shown) =====
app.get("/api/student/:studentId/events", async (req, res) => {
  try {
    const eventsSnap = await db
      .collection("events")
      .where("status", "==", "open")
      .get();

    const events = await Promise.all(
      eventsSnap.docs.map(async (doc) => {
        const event = doc.data();
        const registeredCount = await getRegisteredCount(doc.id);
        const isFull = registeredCount >= event.capacity;

        return {
          eventId: doc.id, // kept internally for the register button, never printed as text
          eventName: event.eventName,
          description: event.description,
          eventDate: event.eventDate,
          location: event.location,
          status: isFull ? "Full" : "Open",
        };
      }),
    );

    res.json(events);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ===== 4. STUDENT: GET MY REGISTRATIONS (simplified) =====
app.get("/api/student/:studentId/registrations", async (req, res) => {
  const { studentId } = req.params;

  try {
    const snap = await db
      .collection("registrations")
      .where("studentId", "==", studentId)
      .where("status", "==", "registered")
      .get();

    const registrations = snap.docs.map((doc) => {
      const r = doc.data();
      return {
        eventId: r.eventId, // internal use only
        eventName: r.eventName,
        eventDate: r.eventDate,
        location: r.location,
        status: "Registered",
      };
    });

    res.json(registrations);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ===== 5. STUDENT: REGISTER FOR EVENT =====
app.post("/api/register", async (req, res) => {
  const { eventId, studentId, studentName } = req.body;

  try {
    const eventDoc = await db.collection("events").doc(eventId).get();
    if (!eventDoc.exists) {
      return res
        .status(404)
        .json({ success: false, message: "Event not found" });
    }
    const event = eventDoc.data();

    if (event.status !== "open") {
      return res
        .status(400)
        .json({ success: false, message: "This event is closed" });
    }

    const registeredCount = await getRegisteredCount(eventId);
    if (registeredCount >= event.capacity) {
      return res
        .status(400)
        .json({ success: false, message: "Sorry, this event is already full" });
    }

    const dup = await db
      .collection("registrations")
      .where("eventId", "==", eventId)
      .where("studentId", "==", studentId)
      .where("status", "==", "registered")
      .get();
    if (!dup.empty) {
      return res.status(400).json({
        success: false,
        message: "You are already registered for this event",
      });
    }

    // Get student's studentId number and program for organizer's participant list
    const studentDoc = await db.collection("users").doc(studentId).get();
    const studentData = studentDoc.exists ? studentDoc.data() : {};

    const newReg = {
      studentId,
      studentName,
      studentIdNumber: studentData.studentId || null,
      program: studentData.program || null,
      eventId,
      eventName: event.eventName,
      eventDate: event.eventDate,
      location: event.location,
      registrationDate: new Date().toISOString().split("T")[0],
      status: "registered",
    };

    await db.collection("registrations").add(newReg);
    res.json({
      success: true,
      message: `You're registered for ${event.eventName}!`,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ===== 6. STUDENT: UNREGISTER =====
app.post("/api/unregister", async (req, res) => {
  const { eventId, studentId } = req.body;

  try {
    const snap = await db
      .collection("registrations")
      .where("eventId", "==", eventId)
      .where("studentId", "==", studentId)
      .where("status", "==", "registered")
      .get();

    const batch = db.batch();
    snap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();

    res.json({ success: true, message: "Unregistered successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ===== 7. ORGANIZER: CREATE EVENT =====
app.post("/api/events", async (req, res) => {
  const {
    eventName,
    description,
    eventDate,
    location,
    capacity,
    organizerId,
    organizerName,
  } = req.body;

  if (!eventName || !description || !eventDate || !location || !capacity) {
    return res
      .status(400)
      .json({ success: false, message: "All fields are required" });
  }
  if (capacity <= 0) {
    return res
      .status(400)
      .json({ success: false, message: "Capacity must be greater than 0" });
  }

  try {
    const newEvent = {
      eventName,
      description,
      eventDate,
      location,
      capacity: parseInt(capacity),
      organizerId,
      organizerName,
      status: "open",
      createdAt: new Date().toISOString(),
    };
    const ref = await db.collection("events").add(newEvent);
    res.json({ success: true, event: { eventId: ref.id, ...newEvent } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ===== 8. ORGANIZER: GET MY EVENTS (full detail) =====
app.get("/api/organizer/events/:organizerId", async (req, res) => {
  const { organizerId } = req.params;

  try {
    const snap = await db
      .collection("events")
      .where("organizerId", "==", organizerId)
      .get();

    const events = await Promise.all(
      snap.docs.map(async (doc) => {
        const event = doc.data();
        const registeredCount = await getRegisteredCount(doc.id);
        return { eventId: doc.id, ...event, registeredCount };
      }),
    );

    res.json(events);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ===== 9. GET ALL EVENTS (full detail — used by Admin) =====
app.get("/api/events", async (req, res) => {
  try {
    const snap = await db.collection("events").get();
    const events = await Promise.all(
      snap.docs.map(async (doc) => {
        const event = doc.data();
        const registeredCount = await getRegisteredCount(doc.id);
        return { eventId: doc.id, ...event, registeredCount };
      }),
    );
    res.json(events);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ===== 10. GET PARTICIPANTS FOR EVENT (Organizer/Admin) =====
app.get("/api/events/:eventId/registrations", async (req, res) => {
  const { eventId } = req.params;

  try {
    const snap = await db
      .collection("registrations")
      .where("eventId", "==", eventId)
      .where("status", "==", "registered")
      .get();

    const registrations = snap.docs.map((doc) => ({
      regId: doc.id,
      ...doc.data(),
    }));
    res.json(registrations);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ===== 11. DELETE EVENT (Organizer/Admin) — cascades to registrations =====
app.delete("/api/events/:eventId", async (req, res) => {
  const { eventId } = req.params;

  try {
    await db.collection("events").doc(eventId).delete();

    const regsSnap = await db
      .collection("registrations")
      .where("eventId", "==", eventId)
      .get();
    for (const doc of regsSnap.docs) {
      await doc.ref.delete();
    }

    res.json({ success: true, message: "Event deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ===== 12. ADMIN: GET ALL USERS (view only) =====
app.get("/api/users", async (req, res) => {
  try {
    const snap = await db.collection("users").get();
    const users = snap.docs.map((doc) => {
      const u = doc.data();
      return {
        userId: doc.id,
        fullName: u.fullName,
        studentId: u.studentId || null,
        email: u.email,
        program: u.program || null,
        role: u.role,
      };
    });
    res.json(users);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ===== 13. ADMIN: DELETE USER — cascades, blocks deleting last admin =====
app.delete("/api/users/:userId", async (req, res) => {
  const { userId } = req.params;

  try {
    const userDoc = await db.collection("users").doc(userId).get();
    if (!userDoc.exists) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }
    const user = userDoc.data();

    if (user.role === "admin") {
      const adminSnap = await db
        .collection("users")
        .where("role", "==", "admin")
        .get();
      if (adminSnap.size === 1) {
        return res.status(400).json({
          success: false,
          message: "Cannot delete the only admin account",
        });
      }
    }

    await db.collection("users").doc(userId).delete();

    // Cascade: delete their registrations (if student)
    const regsSnap = await db
      .collection("registrations")
      .where("studentId", "==", userId)
      .get();
    for (const doc of regsSnap.docs) await doc.ref.delete();

    // Cascade: delete their events + those events' registrations (if organizer)
    const eventsSnap = await db
      .collection("events")
      .where("organizerId", "==", userId)
      .get();
    for (const eventDoc of eventsSnap.docs) {
      const eventRegsSnap = await db
        .collection("registrations")
        .where("eventId", "==", eventDoc.id)
        .get();
      for (const regDoc of eventRegsSnap.docs) await regDoc.ref.delete();
      await eventDoc.ref.delete();
    }

    res.json({ success: true, message: "User deleted successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ===== 14. ADMIN: SYSTEM REPORT =====
app.get("/api/admin/report", async (req, res) => {
  try {
    const [usersSnap, eventsSnap, regsSnap] = await Promise.all([
      db.collection("users").get(),
      db.collection("events").get(),
      db.collection("registrations").where("status", "==", "registered").get(),
    ]);

    const users = usersSnap.docs.map((d) => d.data());

    res.json({
      totalUsers: usersSnap.size,
      totalStudents: users.filter((u) => u.role === "student").length,
      totalOrganizers: users.filter((u) => u.role === "organizer").length,
      totalEvents: eventsSnap.size,
      totalRegistrations: regsSnap.size,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ===== SERVE LOGIN PAGE =====
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ===== START SERVER =====
app.listen(PORT, async () => {
  console.log(`
  ╔════════════════════════════════════════════╗
  ║   School Event Registration System v2      ║
  ║   🔥 Firebase Firestore                    ║
  ║   Server running on http://localhost:3000  ║
  ╚════════════════════════════════════════════╝
  `);
  await seedStaff();
});
