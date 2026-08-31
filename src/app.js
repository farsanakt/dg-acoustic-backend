const express      = require("express");
const cors         = require("cors");
const helmet       = require("helmet");
const morgan       = require("morgan");
const cookieParser = require("cookie-parser");

const app = express();

app.use(helmet());
app.use(cors({
  origin:      process.env.CLIENT_URL,
  credentials: true,
  methods:     ["GET","POST","PUT","PATCH","DELETE"],
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
if (process.env.NODE_ENV === "development") app.use(morgan("dev"));

/* ── Routes ── */
app.get("/api/health", (_req, res) =>
  res.json({ ok: true, timestamp: new Date() })
);
app.use("/api/auth",     require("./routes/authRoutes"));
app.use("/api/projects", require("./routes/projectRoutes"));
app.use("/api/projects/:projectId/calculations", require("./routes/calculationRoutes"));

/* ── 404 ── */
app.use((req, res) =>
  res.status(404).json({ success: false, message: `${req.originalUrl} not found` })
);

/* ── Error handler ── */
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ success: false, message: err.message || "Server error" });
});

module.exports = app;