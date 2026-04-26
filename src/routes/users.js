const express = require("express");
const router = express.Router();
const db = require("../db/database");
const { requireAuth, requireAdmin } = require("../middleware/auth");

// ─── GET /api/users/:id/profile ───────────────────────────────────────────────
router.get("/:id/profile", (req, res) => {
  const user = db.prepare(`
    SELECT id, name, university, avatar_url, bio, created_at
    FROM users WHERE id = ?
  `).get(req.params.id);

  if (!user) return res.status(404).json({ error: "User not found." });

  const listings = db.prepare(`
    SELECT l.*, c.name AS category_name, c.icon AS category_icon,
           (SELECT url FROM listing_images WHERE listing_id = l.id AND is_primary = 1 LIMIT 1) AS primary_image
    FROM listings l
    LEFT JOIN categories c ON l.category_id = c.id
    WHERE l.user_id = ? AND l.status = 'active'
    ORDER BY l.created_at DESC
  `).all(req.params.id);

  const stats = db.prepare(`
    SELECT AVG(rating) as avg_rating, COUNT(*) as review_count
    FROM reviews WHERE seller_id = ?
  `).get(req.params.id);

  res.json({ user, listings, ...stats });
});

// ─── GET /api/users/me/saved ──────────────────────────────────────────────────
router.get("/me/saved", requireAuth, (req, res) => {
  const saved = db.prepare(`
    SELECT l.*, c.name AS category_name, c.icon AS category_icon,
           u.name AS seller_name,
           (SELECT url FROM listing_images WHERE listing_id = l.id AND is_primary = 1 LIMIT 1) AS primary_image
    FROM saved_listings sl
    JOIN listings l ON l.id = sl.listing_id
    LEFT JOIN categories c ON l.category_id = c.id
    LEFT JOIN users u ON u.id = l.user_id
    WHERE sl.user_id = ? AND l.status = 'active'
    ORDER BY sl.created_at DESC
  `).all(req.user.id);

  res.json({ saved });
});

// ─── GET /api/users/me/listings ───────────────────────────────────────────────
router.get("/me/listings", requireAuth, (req, res) => {
  const listings = db.prepare(`
    SELECT l.*, c.name AS category_name, c.icon AS category_icon,
           (SELECT url FROM listing_images WHERE listing_id = l.id AND is_primary = 1 LIMIT 1) AS primary_image,
           (SELECT COUNT(*) FROM listing_images WHERE listing_id = l.id) AS image_count
    FROM listings l
    LEFT JOIN categories c ON l.category_id = c.id
    WHERE l.user_id = ? AND l.status != 'deleted'
    ORDER BY l.created_at DESC
  `).all(req.user.id);

  res.json({ listings });
});

// ─── ADMIN: GET /api/users ────────────────────────────────────────────────────
router.get("/", requireAuth, requireAdmin, (req, res) => {
  const users = db.prepare(`
    SELECT id, name, email, university, role, created_at FROM users ORDER BY created_at DESC
  `).all();
  res.json({ users });
});

module.exports = router;
