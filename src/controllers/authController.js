const jwt  = require("jsonwebtoken");
const User = require("../models/User");

/* ── helpers ── */
const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });

const sendToken = (user, statusCode, res) => {
  const token = signToken(user._id);
  const days  = Number(process.env.COOKIE_EXPIRE_DAYS) || 7;

  res
    .status(statusCode)
    .cookie("token", token, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === "production",
      sameSite: "strict",
      expires:  new Date(Date.now() + days * 24 * 60 * 60 * 1000),
    })
    .json({
      success: true,
      token,
      user: {
        _id:       user._id,
        name:      user.name,
        email:     user.email,
        role:      user.role,
        lastLogin: user.lastLogin,
      },
    });
};

/* ── POST /api/auth/login ── */
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ success: false, message: "Email and password are required." });

    const user = await User.findOne({ email }).select("+password");
    if (!user)
      return res.status(401).json({ success: false, message: "Invalid email or password." });

    if (!user.isActive)
      return res.status(403).json({ success: false, message: "Account deactivated. Contact admin." });

    const ok = await user.matchPassword(password);
    if (!ok)
      return res.status(401).json({ success: false, message: "Invalid email or password." });

    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    sendToken(user, 200, res);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error." });
  }
};

/* ── GET /api/auth/me ── */
exports.getMe = async (req, res) => {
  const user = await User.findById(req.user._id);
  res.json({
    success: true,
    user: { _id: user._id, name: user.name, email: user.email,
            role: user.role, lastLogin: user.lastLogin },
  });
};

/* ── POST /api/auth/logout ── */
exports.logout = (_req, res) => {
  res
    .cookie("token", "", { httpOnly: true, expires: new Date(0) })
    .json({ success: true, message: "Logged out." });
};

/* ── POST /api/auth/seed  (DEV ONLY — remove in production) ── */
exports.seed = async (req, res) => {
  try {
    const exists = await User.findOne({ email: "admin@aaplconsultants.com" });
    if (exists) return res.json({ success: true, message: "Seed users already exist." });

    // ⚠️  Must use .create() individually — insertMany() bypasses the
    //     pre('save') hook, so passwords would be stored as plain text.
    await User.create({ name: "Admin User",    email: "admin@aaplconsultants.com",    password: "Admin@123",    role: "admin"    });
    await User.create({ name: "Test Engineer", email: "engineer@aaplconsultants.com", password: "Engineer@123", role: "engineer" });
    await User.create({ name: "Test Client",   email: "client@aaplconsultants.com",   password: "Client@123",   role: "client"   });

    res.status(201).json({ success: true, message: "3 seed users created." });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};