const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const db = require("../db/database");
const { requireAuth } = require("../middleware/auth");
const { upload, setSubDir } = require("../middleware/upload");

// ─── Helper: generate JWT ────────────────────────────────────────────────────
const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });

// ─── POST /api/auth/register ─────────────────────────────────────────────────
router.post("/register", (req, res) => {
  const { name, email, password, university, phone } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: "Name, email and password are required." });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters." });
  }

  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email.toLowerCase());
  if (existing) {
    return res.status(409).json({ error: "Email already in use." });
  }

  const hashedPassword = bcrypt.hashSync(password, 12);
  const id = uuidv4();

  db.prepare(`
    INSERT INTO users (id, name, email, password, university, phone)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, name.trim(), email.toLowerCase().trim(), hashedPassword, university || null, phone || null);

  const token = signToken(id);

  res.status(201).json({
    message: "Account created successfully!",
    token,
    user: { id, name: name.trim(), email: email.toLowerCase(), university },
  });
});

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
router.post("/login", (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email.toLowerCase().trim());

  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: "Incorrect email or password." });
  }

  const token = signToken(user.id);

  res.json({
    message: "Logged in successfully!",
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      university: user.university,
      avatar_url: user.avatar_url,
      role: user.role,
    },
  });
});

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────
router.get("/me", requireAuth, (req, res) => {
  const user = db.prepare(`
    SELECT id, name, email, university, avatar_url, bio, phone, role, created_at
    FROM users WHERE id = ?
  `).get(req.user.id);

  res.json({ user });
});

// ─── PATCH /api/auth/me ───────────────────────────────────────────────────────
router.patch("/me", requireAuth, (req, res) => {
  const { name, university, bio, phone } = req.body;

  db.prepare(`
    UPDATE users SET
      name       = COALESCE(?, name),
      university = COALESCE(?, university),
      bio        = COALESCE(?, bio),
      phone      = COALESCE(?, phone),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(name || null, university || null, bio || null, phone || null, req.user.id);

  const updated = db.prepare("SELECT id, name, email, university, bio, phone, avatar_url FROM users WHERE id = ?").get(req.user.id);
  res.json({ message: "Profile updated.", user: updated });
});

// ─── POST /api/auth/me/avatar ─────────────────────────────────────────────────
router.post(
  "/me/avatar",
  requireAuth,
  setSubDir("avatars"),
  upload.single("avatar"),
  (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });

    const avatarUrl = `/uploads/avatars/${req.file.filename}`;
    db.prepare("UPDATE users SET avatar_url = ?, updated_at = datetime('now') WHERE id = ?")
      .run(avatarUrl, req.user.id);

    res.json({ message: "Avatar updated.", avatar_url: avatarUrl });
  }
);

// ─── POST /api/auth/change-password ──────────────────────────────────────────
router.post("/change-password", requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "Both current and new password are required." });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: "New password must be at least 6 characters." });
  }

  const user = db.prepare("SELECT password FROM users WHERE id = ?").get(req.user.id);

  if (!bcrypt.compareSync(currentPassword, user.password)) {
    return res.status(401).json({ error: "Current password is incorrect." });
  }

  const hashed = bcrypt.hashSync(newPassword, 12);
  db.prepare("UPDATE users SET password = ?, updated_at = datetime('now') WHERE id = ?")
    .run(hashed, req.user.id);

  res.json({ message: "Password changed successfully." });
});

module.exports = router;
