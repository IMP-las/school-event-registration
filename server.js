require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const bcrypt = require("bcryptjs");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// ===== SUPABASE SETUP =====
// Use the SERVICE ROLE key here (never the anon key) — this is a trusted
// server environment, and RLS is disabled, so the service key gives full access.
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error(
    "❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in your .env file.",
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const VALID_PROGRAMS = ["EN", "CpE", "IT", "CS", "EE", "CE"];

// ===== SEED STAFF ACCOUNTS =====
async function seedStaff() {
  const { data: existing, error } = await supabase
    .from("users")
    .select("id")
    .in("role", ["organizer", "admin"])
    .limit(1);

  if (error) {
    console.error("❌ SEED CHECK ERROR:", error.message);
    return;
  }
  if (existing && existing.length > 0) {
    console.log("✅ Staff accounts already exist. Skipping seed.");
    return;
  }

  console.log("🌱 Seeding organizer & admin accounts...");
  const orgPass = await bcrypt.hash("pass123", 10);
  const adminPass = await bcrypt.hash("admin123", 10);

  const { error: insertErr } = await supabase.from("users").insert([
    {
      full_name: "Mark Organizer",
      email: "org1@school.com",
      password: orgPass,
      role: "organizer",
    },
    {
      full_name: "Admin User",
      email: "admin@school.com",
      password: adminPass,
      role: "admin",
    },
  ]);

  if (insertErr) {
    console.error("❌ SEED INSERT ERROR:", insertErr.message);
  } else {
    console.log("✅ Staff accounts ready.");
  }
}

// ===== HELPERS =====
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function getRegisteredCount(eventId) {
  const { count } = await supabase
    .from("registrations")
    .select("*", { count: "exact", head: true })
    .eq("event_id", eventId)
    .eq("status", "registered");
  return count || 0;
}

// Map a DB event row (snake_case) → API shape (camelCase) expected by frontend
function mapEvent(e, registeredCount) {
  return {
    eventId: e.id,
    eventName: e.event_name,
    description: e.description,
    eventDate: e.event_date,
    location: e.location,
    capacity: e.capacity,
    organizerId: e.organizer_id,
    organizerName: e.organizer_name,
    status: e.status,
    registeredCount,
  };
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
    return res
      .status(400)
      .json({
        success: false,
        message: "Student ID must be in format 2401010063 (10 digits)",
      });
  }

  const { data: dupId } = await supabase
    .from("users")
    .select("id")
    .eq("student_id", studentId)
    .limit(1);
  if (dupId && dupId.length > 0) {
    return res
      .status(400)
      .json({
        success: false,
        message: "This Student ID is already registered",
      });
  }

  if (!email || !isValidEmail(email)) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid email format" });
  }

  const { data: dupEmail } = await supabase
    .from("users")
    .select("id")
    .eq("email", email)
    .limit(1);
  if (dupEmail && dupEmail.length > 0) {
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
    return res
      .status(400)
      .json({
        success: false,
        message: "Password must be at least 6 characters",
      });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const { data, error } = await supabase
      .from("users")
      .insert([
        {
          full_name: fullName,
          student_id: studentId,
          email,
          program,
          password: hashedPassword,
          role: "student",
        },
      ])
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: "Account created successfully! You can now log in.",
      userId: data.id,
    });
  } catch (err) {
    res
      .status(500)
      .json({
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
    let { data: users } = await supabase
      .from("users")
      .select("*")
      .eq("student_id", loginId)
      .limit(1);
    if (!users || users.length === 0) {
      ({ data: users } = await supabase
        .from("users")
        .select("*")
        .eq("email", loginId)
        .limit(1));
    }

    if (!users || users.length === 0) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials" });
    }

    const user = users[0];
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials" });
    }

    res.json({
      success: true,
      user: {
        userId: user.id,
        fullName: user.full_name,
        role: user.role,
        email: user.email,
        studentId: user.student_id || null,
        program: user.program || null,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ===== 3. STUDENT: GET AVAILABLE EVENTS (simplified) =====
app.get("/api/student/:studentId/events", async (req, res) => {
  try {
    const { data: events, error } = await supabase
      .from("events")
      .select("*")
      .eq("status", "open");
    if (error) throw error;

    const result = await Promise.all(
      events.map(async (e) => {
        const registeredCount = await getRegisteredCount(e.id);
        const isFull = registeredCount >= e.capacity;
        return {
          eventId: e.id,
          eventName: e.event_name,
          description: e.description,
          eventDate: e.event_date,
          location: e.location,
          status: isFull ? "Full" : "Open",
        };
      }),
    );

    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ===== 4. STUDENT: GET MY REGISTRATIONS (simplified) =====
app.get("/api/student/:studentId/registrations", async (req, res) => {
  const { studentId } = req.params;

  try {
    const { data: regs, error } = await supabase
      .from("registrations")
      .select("*")
      .eq("student_id", studentId)
      .eq("status", "registered");

    if (error) throw error;

    const result = regs.map((r) => ({
      eventId: r.event_id,
      eventName: r.event_name,
      eventDate: r.event_date,
      location: r.location,
      status: "Registered",
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ===== 5. STUDENT: REGISTER FOR EVENT =====
app.post("/api/register", async (req, res) => {
  const { eventId, studentId, studentName } = req.body;

  try {
    const { data: event, error: eventErr } = await supabase
      .from("events")
      .select("*")
      .eq("id", eventId)
      .single();
    if (eventErr || !event) {
      return res
        .status(404)
        .json({ success: false, message: "Event not found" });
    }

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

    const { data: dup } = await supabase
      .from("registrations")
      .select("id")
      .eq("event_id", eventId)
      .eq("student_id", studentId)
      .eq("status", "registered")
      .limit(1);

    if (dup && dup.length > 0) {
      return res
        .status(400)
        .json({
          success: false,
          message: "You are already registered for this event",
        });
    }

    const { data: studentData } = await supabase
      .from("users")
      .select("student_id, program")
      .eq("id", studentId)
      .single();

    const { error: insertErr } = await supabase.from("registrations").insert([
      {
        student_id: studentId,
        event_id: eventId,
        student_name: studentName,
        student_id_number: studentData?.student_id || null,
        program: studentData?.program || null,
        event_name: event.event_name,
        event_date: event.event_date,
        location: event.location,
        registration_date: new Date().toISOString().split("T")[0],
        status: "registered",
      },
    ]);

    if (insertErr) throw insertErr;

    res.json({
      success: true,
      message: `You're registered for ${event.event_name}!`,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ===== 6. STUDENT: UNREGISTER =====
app.post("/api/unregister", async (req, res) => {
  const { eventId, studentId } = req.body;

  try {
    const { error } = await supabase
      .from("registrations")
      .delete()
      .eq("event_id", eventId)
      .eq("student_id", studentId)
      .eq("status", "registered");

    if (error) throw error;
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
    const { data, error } = await supabase
      .from("events")
      .insert([
        {
          event_name: eventName,
          description,
          event_date: eventDate,
          location,
          capacity: parseInt(capacity),
          organizer_id: organizerId,
          organizer_name: organizerName,
          status: "open",
        },
      ])
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, event: mapEvent(data, 0) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ===== 8. ORGANIZER: GET MY EVENTS (full detail) =====
app.get("/api/organizer/events/:organizerId", async (req, res) => {
  const { organizerId } = req.params;

  try {
    const { data: events, error } = await supabase
      .from("events")
      .select("*")
      .eq("organizer_id", organizerId);
    if (error) throw error;

    const result = await Promise.all(
      events.map(async (e) => {
        const registeredCount = await getRegisteredCount(e.id);
        return mapEvent(e, registeredCount);
      }),
    );

    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ===== 9. GET ALL EVENTS (full detail — Admin) =====
app.get("/api/events", async (req, res) => {
  try {
    const { data: events, error } = await supabase.from("events").select("*");
    if (error) throw error;

    const result = await Promise.all(
      events.map(async (e) => {
        const registeredCount = await getRegisteredCount(e.id);
        return mapEvent(e, registeredCount);
      }),
    );

    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ===== 10. GET PARTICIPANTS FOR EVENT =====
app.get("/api/events/:eventId/registrations", async (req, res) => {
  const { eventId } = req.params;

  try {
    const { data: regs, error } = await supabase
      .from("registrations")
      .select("*")
      .eq("event_id", eventId)
      .eq("status", "registered");

    if (error) throw error;

    const result = regs.map((r) => ({
      regId: r.id,
      studentId: r.student_id,
      studentName: r.student_name,
      studentIdNumber: r.student_id_number,
      program: r.program,
      registrationDate: r.registration_date,
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ===== 11. DELETE EVENT (cascades via FK ON DELETE CASCADE) =====
app.delete("/api/events/:eventId", async (req, res) => {
  const { eventId } = req.params;

  try {
    const { error } = await supabase.from("events").delete().eq("id", eventId);
    if (error) throw error;
    res.json({ success: true, message: "Event deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ===== 12. ADMIN: GET ALL USERS =====
app.get("/api/users", async (req, res) => {
  try {
    const { data: users, error } = await supabase.from("users").select("*");
    if (error) throw error;

    const result = users.map((u) => ({
      userId: u.id,
      fullName: u.full_name,
      studentId: u.student_id || null,
      email: u.email,
      program: u.program || null,
      role: u.role,
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ===== 13. ADMIN: DELETE USER (cascades via FK ON DELETE CASCADE) =====
app.delete("/api/users/:userId", async (req, res) => {
  const { userId } = req.params;

  try {
    const { data: user, error: getErr } = await supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .single();
    if (getErr || !user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    if (user.role === "admin") {
      const { count } = await supabase
        .from("users")
        .select("*", { count: "exact", head: true })
        .eq("role", "admin");
      if (count === 1) {
        return res
          .status(400)
          .json({
            success: false,
            message: "Cannot delete the only admin account",
          });
      }
    }

    const { error } = await supabase.from("users").delete().eq("id", userId);
    if (error) throw error;

    res.json({ success: true, message: "User deleted successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ===== 14. ADMIN: SYSTEM REPORT =====
app.get("/api/admin/report", async (req, res) => {
  try {
    const [
      { count: totalUsers },
      { count: totalStudents },
      { count: totalOrganizers },
      { count: totalEvents },
      { count: totalRegistrations },
    ] = await Promise.all([
      supabase.from("users").select("*", { count: "exact", head: true }),
      supabase
        .from("users")
        .select("*", { count: "exact", head: true })
        .eq("role", "student"),
      supabase
        .from("users")
        .select("*", { count: "exact", head: true })
        .eq("role", "organizer"),
      supabase.from("events").select("*", { count: "exact", head: true }),
      supabase
        .from("registrations")
        .select("*", { count: "exact", head: true })
        .eq("status", "registered"),
    ]);

    res.json({
      totalUsers,
      totalStudents,
      totalOrganizers,
      totalEvents,
      totalRegistrations,
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
  ║   ⚡ Supabase (Postgres)                    ║
  ║   Server running on http://localhost:3000  ║
  ╚════════════════════════════════════════════╝
  `);
  await seedStaff();
});
