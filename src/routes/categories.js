const express = require("express");
const router = express.Router();
const db = require("../db/database");
const { requireAuth, requireAdmin } = require("../middleware/auth");

// GET /api/categories
router.get("/", (req, res) => {
  const categories = db.prepare(`
    SELECT c.*, COUNT(l.id) as listing_count
    FROM categories c
    LEFT JOIN listings l ON l.category_id = c.id AND l.status = 'active'
    GROUP BY c.id
    ORDER BY listing_count DESC
  `).all();

  res.json({ categories });
});

// POST /api/categories (admin only)
router.post("/", requireAuth, requireAdmin, (req, res) => {
  const { name, icon } = req.body;
  if (!name) return res.status(400).json({ error: "Category name is required." });

  const existing = db.prepare("SELECT id FROM categories WHERE name = ?").get(name);
  if (existing) return res.status(409).json({ error: "Category already exists." });

  const { lastInsertRowid } = db.prepare(
    "INSERT INTO categories (name, icon) VALUES (?, ?)"
  ).run(name.trim(), icon || "📦");

  res.status(201).json({ message: "Category created.", id: lastInsertRowid, name, icon });
});

module.exports = router;
