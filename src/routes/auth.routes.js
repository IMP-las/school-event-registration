const express = require("express");
const bcrypt = require("bcryptjs");
const supabase = require("../config/supabase");
const asyncHandler = require("../utils/asyncHandler");
const HttpError = require("../utils/httpError");
const { unwrap } = require("../utils/db");
const { mapUser } = require("../utils/mappers");
const { ROLES } = require("../config/constants");
const {
  cleanStudentName,
  composeFullName,
  cleanEmail,
  cleanStudentId,
  cleanProgram,
  cleanSection,
  cleanPassword,
} = require("../utils/validators");

const router = express.Router();

async function ensureUnique(column, value, message) {
  const rows = unwrap(
    await supabase.from("users").select("id").eq(column, value).limit(1),
  );
  if (rows.length > 0) throw new HttpError(400, message);
}

router.post(
  "/signup",
  asyncHandler(async (req, res) => {
    const names = cleanStudentName(req.body);
    const studentId = cleanStudentId(req.body.studentId);
    await ensureUnique("student_id", studentId, "This Student ID is already registered");

    const email = cleanEmail(req.body.email);
    await ensureUnique("email", email, "Email is already registered");

    const program = cleanProgram(req.body.program);
    const section = cleanSection(req.body.section);
    const password = cleanPassword(req.body.password);

    const created = unwrap(
      await supabase
        .from("users")
        .insert([
          {
            full_name: composeFullName(names),
            first_name: names.firstName,
            middle_name: names.middleName || null,
            last_name: names.lastName,
            student_id: studentId,
            email,
            program,
            section,
            password: await bcrypt.hash(password, 10),
            role: ROLES.STUDENT,
          },
        ])
        .select("id")
        .single(),
    );

    res.json({
      success: true,
      message: "Account created successfully! You can now log in.",
      userId: created.id,
    });
  }),
);

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const loginId = String(req.body.loginId ?? "").trim();
    const { password } = req.body;
    if (!loginId || !password) throw new HttpError(400, "All fields are required");

    let [user] = unwrap(
      await supabase.from("users").select("*").eq("student_id", loginId).limit(1),
    );
    if (!user) {
      [user] = unwrap(
        await supabase
          .from("users")
          .select("*")
          .eq("email", loginId.toLowerCase())
          .limit(1),
      );
    }

    const matches = user && (await bcrypt.compare(password, user.password));
    if (!matches) throw new HttpError(401, "Invalid credentials");

    res.json({ success: true, user: mapUser(user) });
  }),
);

module.exports = router;
