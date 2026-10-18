require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

const apiRoutes = require("./src/routes");
const { notFound, errorHandler } = require("./src/middleware/errorHandler");
const { seedStaff } = require("./src/seed/seedStaff");
const { startEventScheduler } = require("./src/jobs/eventScheduler");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(PUBLIC_DIR));

app.use("/api", apiRoutes);
app.use("/api", notFound);
app.use(errorHandler);

app.get("/", (req, res) => res.sendFile(path.join(PUBLIC_DIR, "index.html")));

seedStaff().catch((err) => console.error("❌ SEED ERROR:", err.message));

// Run as a normal server (`npm start`); when imported (e.g. by Vercel) just export the app.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`
  ╔════════════════════════════════════════════╗
  ║   School Event Registration System         ║
  ║   Supabase (Postgres)                      ║
  ║   Server running on http://localhost:${PORT}  ║
  ╚════════════════════════════════════════════╝
  `);
    startEventScheduler();
  });
}

module.exports = app;
