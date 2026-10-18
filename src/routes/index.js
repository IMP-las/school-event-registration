const express = require("express");

const router = express.Router();

router.use("/", require("./auth.routes"));
router.use("/profile", require("./profile.routes"));
router.use("/student", require("./student.routes"));
router.use("/events", require("./event.routes"));
router.use("/registrations", require("./registration.routes"));
router.use("/admin", require("./admin.routes"));

module.exports = router;
