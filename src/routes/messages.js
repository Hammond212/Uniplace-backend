const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");
const db = require("../db/database");
const { requireAuth } = require("../middleware/auth");

// ─── GET /api/messages/conversations ─────────────────────────────────────────
// Returns list of unique conversations for current user
router.get("/conversations", requireAuth, (req, res) => {
  const conversations = db.prepare(`
    SELECT
      CASE WHEN m.sender_id = ? THEN m.receiver_id ELSE m.sender_id END AS other_user_id,
      u.name AS other_user_name,
      u.avatar_url AS other_user_avatar,
      m.content AS last_message,
      m.created_at AS last_message_at,
      m.listing_id,
      l.title AS listing_title,
      SUM(CASE WHEN m.receiver_id = ? AND m.is_read = 0 THEN 1 ELSE 0 END) AS unread_count
    FROM messages m
    JOIN users u ON u.id = (CASE WHEN m.sender_id = ? THEN m.receiver_id ELSE m.sender_id END)
    LEFT JOIN listings l ON l.id = m.listing_id
    WHERE m.sender_id = ? OR m.receiver_id = ?
    GROUP BY other_user_id, m.listing_id
    ORDER BY last_message_at DESC
  `).all(req.user.id, req.user.id, req.user.id, req.user.id, req.user.id);

  res.json({ conversations });
});

// ─── GET /api/messages/:userId ────────────────────────────────────────────────
// Get message thread with a specific user (optionally scoped to a listing)
router.get("/:userId", requireAuth, (req, res) => {
  const { listing_id } = req.query;
  let query = `
    SELECT m.*, u.name AS sender_name, u.avatar_url AS sender_avatar
    FROM messages m
    JOIN users u ON u.id = m.sender_id
    WHERE ((m.sender_id = ? AND m.receiver_id = ?) OR (m.sender_id = ? AND m.receiver_id = ?))
  `;
  const params = [req.user.id, req.params.userId, req.params.userId, req.user.id];

  if (listing_id) {
    query += " AND m.listing_id = ?";
    params.push(listing_id);
  }

  query += " ORDER BY m.created_at ASC";

  const messages = db.prepare(query).all(...params);

  // Mark received messages as read
  db.prepare(`
    UPDATE messages SET is_read = 1
    WHERE sender_id = ? AND receiver_id = ? AND is_read = 0
  `).run(req.params.userId, req.user.id);

  res.json({ messages });
});

// ─── POST /api/messages ───────────────────────────────────────────────────────
router.post("/", requireAuth, (req, res) => {
  const { receiver_id, listing_id, content } = req.body;

  if (!receiver_id || !content) {
    return res.status(400).json({ error: "receiver_id and content are required." });
  }
  if (receiver_id === req.user.id) {
    return res.status(400).json({ error: "You cannot message yourself." });
  }

  const receiver = db.prepare("SELECT id FROM users WHERE id = ?").get(receiver_id);
  if (!receiver) return res.status(404).json({ error: "Recipient not found." });

  const id = uuidv4();
  db.prepare(`
    INSERT INTO messages (id, sender_id, receiver_id, listing_id, content)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, req.user.id, receiver_id, listing_id || null, content.trim());

  const message = db.prepare("SELECT * FROM messages WHERE id = ?").get(id);
  res.status(201).json({ message });
});

// ─── GET /api/messages/unread/count ──────────────────────────────────────────
router.get("/unread/count", requireAuth, (req, res) => {
  const { count } = db.prepare(
    "SELECT COUNT(*) as count FROM messages WHERE receiver_id = ? AND is_read = 0"
  ).get(req.user.id);

  res.json({ unread_count: count });
});

module.exports = router;
