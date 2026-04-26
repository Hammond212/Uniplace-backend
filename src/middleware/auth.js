const jwt = require("jsonwebtoken");
const db = require("../db/database");

// Require a valid token
const requireAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided. Please log in." });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = db
      .prepare("SELECT id, name, email, role, university FROM users WHERE id = ?")
      .get(decoded.id);

    if (!user) {
      return res.status(401).json({ error: "User no longer exists." });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Token expired. Please log in again." });
    }
    return res.status(401).json({ error: "Invalid token." });
  }
};

// Optionally attach user if token present (does not block unauthenticated)
const optionalAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next();
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = db
      .prepare("SELECT id, name, email, role, university FROM users WHERE id = ?")
      .get(decoded.id);
    req.user = user || null;
  } catch {
    req.user = null;
  }

  next();
};

// Require admin role
const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ error: "Admin access only." });
  }
  next();
};

module.exports = { requireAuth, optionalAuth, requireAdmin };
