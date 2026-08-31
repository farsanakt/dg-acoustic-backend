const jwt  = require("jsonwebtoken");
const User = require("../models/User");

exports.protect = async (req, res, next) => {
  // Accept token from httpOnly cookie OR Authorization header
  const token =
    req.cookies?.token ||
    (req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.split(" ")[1]
      : null);

  if (!token)
    return res.status(401).json({ success: false, message: "Not authenticated. Please log in." });

  try {
    const { id } = jwt.verify(token, process.env.JWT_SECRET);
    const user   = await User.findById(id);

    if (!user || !user.isActive)
      return res.status(401).json({ success: false, message: "User not found or deactivated." });

    req.user = user;
    next();
  } catch {
    res.status(401).json({ success: false, message: "Token invalid or expired." });
  }
};

exports.authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role))
    return res.status(403).json({ success: false, message: "Access denied." });
  next();
};
