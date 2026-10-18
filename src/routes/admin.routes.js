const express = require("express");
const bcrypt = require("bcryptjs");
const supabase = require("../config/supabase");
const asyncHandler = require("../utils/asyncHandler");
const HttpError = require("../utils/httpError");
const { unwrap } = require("../utils/db");
const { requireRole } = require("../middleware/auth");
const { recordAudit } = require("../services/auditService");
const { closeExpiredEvents } = require("../services/eventService");
const {
  ROLES,
  EVENT_STATUS,
  REGISTRATION_STATUS,
  ACTIVE_REGISTRATION_STATUSES,
} = require("../config/constants");
const {
  cleanName,
  cleanEmail,
  cleanPassword,
} = require("../utils/validators");

const router = express.Router();
router.use(...requireRole(ROLES.ADMIN));

const USERS_PAGE_SIZE = 20;
const AUDIT_PAGE_SIZE = 50;
const CHANGEABLE_ROLES = [ROLES.STUDENT, ROLES.ORGANIZER];

const parsePage = (value) => Math.max(1, parseInt(value, 10) || 1);
const pageRange = (page, size) => [(page - 1) * size, page * size - 1];

async function countRows(table, filter = (query) => query) {
  const { count, error } = await filter(
    supabase.from(table).select("*", { count: "exact", head: true }),
  );
  if (error) throw error;
  return count || 0;
}

async function findUser(userId) {
  const { data: user, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error || !user) throw new HttpError(404, "User not found");
  return user;
}

function mapAdminUser(u) {
  return {
    userId: u.id,
    fullName: u.full_name,
    studentId: u.student_id || null,
    email: u.email,
    program: u.program || null,
    section: u.section || null,
    role: u.role,
  };
}

router.get(
  "/report",
  asyncHandler(async (req, res) => {
    await closeExpiredEvents();
    const [
      totalUsers,
      totalStudents,
      totalOrganizers,
      totalEvents,
      openEvents,
      closedEvents,
      cancelledEvents,
      totalRegistrations,
      totalAttended,
    ] = await Promise.all([
      countRows("users"),
      countRows("users", (q) => q.eq("role", ROLES.STUDENT)),
      countRows("users", (q) => q.eq("role", ROLES.ORGANIZER)),
      countRows("events"),
      countRows("events", (q) => q.eq("status", EVENT_STATUS.OPEN)),
      countRows("events", (q) => q.eq("status", EVENT_STATUS.CLOSED)),
      countRows("events", (q) => q.eq("status", EVENT_STATUS.CANCELLED)),
      countRows("registrations", (q) => q.in("status", ACTIVE_REGISTRATION_STATUSES)),
      countRows("registrations", (q) => q.eq("status", REGISTRATION_STATUS.ATTENDED)),
    ]);

    res.json({
      totalUsers,
      totalStudents,
      totalOrganizers,
      totalEvents,
      openEvents,
      closedEvents,
      cancelledEvents,
      totalRegistrations,
      totalAttended,
    });
  }),
);

router.get(
  "/users",
  asyncHandler(async (req, res) => {
    const page = parsePage(req.query.page);
    const role = Object.values(ROLES).includes(req.query.role) ? req.query.role : null;
    // Strip characters that have special meaning inside a PostgREST filter.
    const search = String(req.query.search ?? "").replace(/[,()%*\\]/g, " ").trim();

    let query = supabase.from("users").select("*", { count: "exact" });
    if (role) query = query.eq("role", role);
    if (search) {
      query = query.or(
        `full_name.ilike.%${search}%,email.ilike.%${search}%,student_id.ilike.%${search}%`,
      );
    }

    const [from, to] = pageRange(page, USERS_PAGE_SIZE);
    const { data, count, error } = await query
      .order("full_name", { ascending: true })
      .range(from, to);
    if (error) throw error;

    res.json({
      users: data.map(mapAdminUser),
      total: count || 0,
      page,
      pageSize: USERS_PAGE_SIZE,
    });
  }),
);

router.post(
  "/organizers",
  asyncHandler(async (req, res) => {
    const fullName = cleanName(req.body.fullName, "Full name", { max: 100 });
    const email = cleanEmail(req.body.email);
    const password = cleanPassword(req.body.password, "Temporary password");

    const taken = unwrap(
      await supabase.from("users").select("id").eq("email", email).limit(1),
    );
    if (taken.length > 0) throw new HttpError(400, "Email is already registered");

    unwrap(
      await supabase.from("users").insert([
        {
          full_name: fullName,
          email,
          password: await bcrypt.hash(password, 10),
          role: ROLES.ORGANIZER,
          must_change_password: true,
        },
      ]),
    );

    await recordAudit(req.user, "user.created", `Created organizer account for ${fullName} (${email})`);
    res.json({ success: true, message: "Organizer account created" });
  }),
);

router.patch(
  "/users/:userId/role",
  asyncHandler(async (req, res) => {
    const { role } = req.body;
    if (!CHANGEABLE_ROLES.includes(role)) {
      throw new HttpError(400, "Role must be student or organizer");
    }

    const user = await findUser(req.params.userId);
    if (String(user.id) === String(req.user.id)) {
      throw new HttpError(400, "You can't change your own role");
    }
    if (user.role === ROLES.ADMIN) {
      throw new HttpError(400, "Admin accounts can't be changed here");
    }
    if (user.role === role) throw new HttpError(400, `User is already a ${role}`);
    if (role === ROLES.STUDENT && !user.student_id) {
      throw new HttpError(400, "This account has no student record, so it can't become a student");
    }

    unwrap(await supabase.from("users").update({ role }).eq("id", user.id));

    await recordAudit(req.user, "user.role_changed", `Changed ${user.full_name} from ${user.role} to ${role}`);
    res.json({ success: true, message: `${user.full_name} is now ${role === ROLES.ORGANIZER ? "an organizer" : "a student"}` });
  }),
);

router.delete(
  "/users/:userId",
  asyncHandler(async (req, res) => {
    const user = await findUser(req.params.userId);

    if (String(user.id) === String(req.user.id)) {
      throw new HttpError(400, "You can't delete your own account");
    }
    if (user.role === ROLES.ADMIN) {
      const admins = await countRows("users", (q) => q.eq("role", ROLES.ADMIN));
      if (admins <= 1) {
        throw new HttpError(400, "Cannot delete the only admin account");
      }
    }

    // Their events and registrations are removed by ON DELETE CASCADE.
    unwrap(await supabase.from("users").delete().eq("id", user.id));

    await recordAudit(req.user, "user.deleted", `Deleted ${user.role} account of ${user.full_name} (${user.email})`);
    res.json({ success: true, message: "User deleted successfully" });
  }),
);

router.get(
  "/audit-logs",
  asyncHandler(async (req, res) => {
    const page = parsePage(req.query.page);
    const [from, to] = pageRange(page, AUDIT_PAGE_SIZE);

    const { data, count, error } = await supabase
      .from("audit_logs")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);
    if (error) throw error;

    res.json({
      logs: data.map((l) => ({
        logId: l.id,
        actorName: l.actor_name,
        actorRole: l.actor_role,
        action: l.action,
        description: l.description,
        createdAt: l.created_at,
      })),
      total: count || 0,
      page,
      pageSize: AUDIT_PAGE_SIZE,
    });
  }),
);

module.exports = router;
