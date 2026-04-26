const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");
const db = require("../db/database");
const { requireAuth } = require("../middleware/auth");

// ─── GET /api/reviews/user/:userId ────────────────────────────────────────────
router.get("/user/:userId", (req, res) => {
  const reviews = db.prepare(`
    SELECT r.*, u.name AS reviewer_name, u.avatar_url AS reviewer_avatar,
           l.title AS listing_title
    FROM reviews r
    JOIN users u ON u.id = r.reviewer_id
    LEFT JOIN listings l ON l.id = r.listing_id
    WHERE r.seller_id = ?
    ORDER BY r.created_at DESC
  `).all(req.params.userId);

  const stats = db.prepare(`
    SELECT AVG(rating) as avg_rating, COUNT(*) as review_count
    FROM reviews WHERE seller_id = ?
  `).get(req.params.userId);

  res.json({ reviews, ...stats });
});

// ─── POST /api/reviews ────────────────────────────────────────────────────────
router.post("/", requireAuth, (req, res) => {
  const { seller_id, listing_id, rating, comment } = req.body;

  if (!seller_id || !rating) {
    return res.status(400).json({ error: "seller_id and rating are required." });
  }
  if (seller_id === req.user.id) {
    return res.status(400).json({ error: "You cannot review yourself." });
  }
  if (![1, 2, 3, 4, 5].includes(parseInt(rating))) {
    return res.status(400).json({ error: "Rating must be between 1 and 5." });
  }

  const seller = db.prepare("SELECT id FROM users WHERE id = ?").get(seller_id);
  if (!seller) return res.status(404).json({ error: "Seller not found." });

  // Check for duplicate review on the same listing
  if (listing_id) {
    const duplicate = db.prepare(`
      SELECT id FROM reviews WHERE reviewer_id = ? AND seller_id = ? AND listing_id = ?
    `).get(req.user.id, seller_id, listing_id);
    if (duplicate) {
      return res.status(409).json({ error: "You have already reviewed this listing." });
    }
  }

  const id = uuidv4();
  db.prepare(`
    INSERT INTO reviews (id, reviewer_id, seller_id, listing_id, rating, comment)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, req.user.id, seller_id, listing_id || null, parseInt(rating), comment?.trim() || null);

  const review = db.prepare(`
    SELECT r.*, u.name AS reviewer_name, u.avatar_url AS reviewer_avatar
    FROM reviews r JOIN users u ON u.id = r.reviewer_id
    WHERE r.id = ?
  `).get(id);

  res.status(201).json({ message: "Review posted!", review });
});

// ─── DELETE /api/reviews/:id ──────────────────────────────────────────────────
router.delete("/:id", requireAuth, (req, res) => {
  const review = db.prepare("SELECT * FROM reviews WHERE id = ?").get(req.params.id);
  if (!review) return res.status(404).json({ error: "Review not found." });
  if (review.reviewer_id !== req.user.id && req.user.role !== "admin") {
    return res.status(403).json({ error: "Not authorized." });
  }

  db.prepare("DELETE FROM reviews WHERE id = ?").run(req.params.id);
  res.json({ message: "Review deleted." });
});

module.exports = router;
