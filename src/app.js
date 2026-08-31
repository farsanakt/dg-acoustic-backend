const express      = require("express");
const cors         = require("cors");
const helmet       = require("helmet");
const morgan       = require("morgan");
const cookieParser = require("cookie-parser");

const app = express();

// ── CORS ── allow all Vercel/localhost origins explicitly
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  "https://dg-acoustic-frontend.vercel.app",
  process.env.CLIENT_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, Postman, mobile apps)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    // Also allow any *.vercel.app preview deployments
    if (origin.endsWith(".vercel.app")) return callback(null, true);
    return callback(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
  methods:     ["GET","POST","PUT","PATCH","DELETE","OPTIONS"],
  allowedHeaders: ["Content-Type","Authorization"],
}));

// Handle preflight OPTIONS requests
app.options("*", cors());

app.use(helmet({ crossOriginResourcePolicy: false }));
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