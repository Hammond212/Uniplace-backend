const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");
const db = require("../db/database");
const { requireAuth, optionalAuth } = require("../middleware/auth");
const { upload, setSubDir } = require("../middleware/upload");

// ─── GET /api/listings ────────────────────────────────────────────────────────
// Supports: ?search=, ?category=, ?listing_type=, ?university=, ?min_price=,
//           ?max_price=, ?sort=newest|price_asc|price_desc, ?page=, ?limit=
router.get("/", optionalAuth, (req, res) => {
  const {
    search,
    category,
    listing_type,
    university,
    min_price,
    max_price,
    sort = "newest",
    page = 1,
    limit = 12,
  } = req.query;

  let whereClauses = ["l.status = 'active'"];
  const params = [];

  if (search) {
    whereClauses.push("(l.title LIKE ? OR l.description LIKE ?)");
    params.push(`%${search}%`, `%${search}%`);
  }
  if (category) {
    whereClauses.push("c.name = ?");
    params.push(category);
  }
  if (listing_type) {
    whereClauses.push("l.listing_type = ?");
    params.push(listing_type);
  }
  if (university) {
    whereClauses.push("l.university LIKE ?");
    params.push(`%${university}%`);
  }
  if (min_price) {
    whereClauses.push("l.price >= ?");
    params.push(parseFloat(min_price));
  }
  if (max_price) {
    whereClauses.push("l.price <= ?");
    params.push(parseFloat(max_price));
  }

  const orderMap = {
    newest: "l.created_at DESC",
    oldest: "l.created_at ASC",
    price_asc: "l.price ASC",
    price_desc: "l.price DESC",
    popular: "l.views DESC",
  };
  const orderBy = orderMap[sort] || "l.created_at DESC";
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const where = whereClauses.join(" AND ");

  const total = db.prepare(`
    SELECT COUNT(*) as count
    FROM listings l
    LEFT JOIN categories c ON l.category_id = c.id
    WHERE ${where}
  `).get(...params).count;

  const listings = db.prepare(`
    SELECT
      l.*,
      c.name  AS category_name,
      c.icon  AS category_icon,
      u.name  AS seller_name,
      u.avatar_url AS seller_avatar,
      u.university AS seller_university,
      (SELECT url FROM listing_images WHERE listing_id = l.id AND is_primary = 1 LIMIT 1) AS primary_image,
      (SELECT COUNT(*) FROM listing_images WHERE listing_id = l.id) AS image_count
    FROM listings l
    LEFT JOIN categories c ON l.category_id = c.id
    LEFT JOIN users u ON l.user_id = u.id
    WHERE ${where}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `).all(...params, parseInt(limit), offset);

  res.json({
    listings,
    pagination: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(total / parseInt(limit)),
    },
  });
});

// ─── GET /api/listings/:id ────────────────────────────────────────────────────
router.get("/:id", optionalAuth, (req, res) => {
  const listing = db.prepare(`
    SELECT
      l.*,
      c.name  AS category_name,
      c.icon  AS category_icon,
      u.id    AS seller_id,
      u.name  AS seller_name,
      u.avatar_url AS seller_avatar,
      u.university AS seller_university,
      u.bio   AS seller_bio,
      u.phone AS seller_phone
    FROM listings l
    LEFT JOIN categories c ON l.category_id = c.id
    LEFT JOIN users u ON l.user_id = u.id
    WHERE l.id = ? AND l.status != 'deleted'
  `).get(req.params.id);

  if (!listing) return res.status(404).json({ error: "Listing not found." });

  // Increment views (skip if own listing)
  if (!req.user || req.user.id !== listing.user_id) {
    db.prepare("UPDATE listings SET views = views + 1 WHERE id = ?").run(listing.id);
  }

  // Attach all images
  const images = db.prepare(
    "SELECT id, url, is_primary FROM listing_images WHERE listing_id = ? ORDER BY is_primary DESC"
  ).all(listing.id);

  // Attach seller avg rating
  const ratingRow = db.prepare(`
    SELECT AVG(rating) as avg_rating, COUNT(*) as review_count
    FROM reviews WHERE seller_id = ?
  `).get(listing.user_id);

  // Check if saved by current user
  let isSaved = false;
  if (req.user) {
    isSaved = !!db.prepare(
      "SELECT 1 FROM saved_listings WHERE user_id = ? AND listing_id = ?"
    ).get(req.user.id, listing.id);
  }

  res.json({ ...listing, images, ...ratingRow, is_saved: isSaved });
});

// ─── POST /api/listings ───────────────────────────────────────────────────────
router.post("/", requireAuth, (req, res) => {
  const {
    title,
    description,
    category_id,
    price,
    price_type,
    listing_type,
    location,
    university,
    contact_email,
    contact_phone,
  } = req.body;

  if (!title || !description) {
    return res.status(400).json({ error: "Title and description are required." });
  }

  const id = uuidv4();

  db.prepare(`
    INSERT INTO listings (
      id, user_id, title, description, category_id,
      price, price_type, listing_type, location,
      university, contact_email, contact_phone
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    req.user.id,
    title.trim(),
    description.trim(),
    category_id || null,
    price ? parseFloat(price) : null,
    price_type || "fixed",
    listing_type || "service",
    location || null,
    university || req.user.university || null,
    contact_email || req.user.email,
    contact_phone || null
  );

  const listing = db.prepare("SELECT * FROM listings WHERE id = ?").get(id);
  res.status(201).json({ message: "Listing created!", listing });
});

// ─── POST /api/listings/:id/images ───────────────────────────────────────────
router.post(
  "/:id/images",
  requireAuth,
  setSubDir("listings"),
  upload.array("images", 6),
  (req, res) => {
    const listing = db.prepare("SELECT * FROM listings WHERE id = ? AND status != 'deleted'").get(req.params.id);
    if (!listing) return res.status(404).json({ error: "Listing not found." });
    if (listing.user_id !== req.user.id && req.user.role !== "admin") {
      return res.status(403).json({ error: "Not authorized." });
    }
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "No images uploaded." });
    }

    const existingCount = db.prepare(
      "SELECT COUNT(*) as c FROM listing_images WHERE listing_id = ?"
    ).get(req.params.id).c;

    const insertImage = db.prepare(
      "INSERT INTO listing_images (listing_id, url, is_primary) VALUES (?, ?, ?)"
    );

    const images = [];
    for (let i = 0; i < req.files.length; i++) {
      const url = `/uploads/listings/${req.files[i].filename}`;
      const isPrimary = existingCount === 0 && i === 0 ? 1 : 0;
      insertImage.run(req.params.id, url, isPrimary);
      images.push({ url, is_primary: isPrimary });
    }

    res.status(201).json({ message: `${req.files.length} image(s) uploaded.`, images });
  }
);

// ─── PATCH /api/listings/:id ──────────────────────────────────────────────────
router.patch("/:id", requireAuth, (req, res) => {
  const listing = db.prepare("SELECT * FROM listings WHERE id = ? AND status != 'deleted'").get(req.params.id);
  if (!listing) return res.status(404).json({ error: "Listing not found." });
  if (listing.user_id !== req.user.id && req.user.role !== "admin") {
    return res.status(403).json({ error: "Not authorized." });
  }

  const fields = ["title", "description", "category_id", "price", "price_type", "listing_type", "status", "location", "university", "contact_email", "contact_phone"];
  const updates = [];
  const values = [];

  for (const field of fields) {
    if (req.body[field] !== undefined) {
      updates.push(`${field} = ?`);
      values.push(req.body[field]);
    }
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: "No fields to update." });
  }

  updates.push("updated_at = datetime('now')");
  values.push(req.params.id);

  db.prepare(`UPDATE listings SET ${updates.join(", ")} WHERE id = ?`).run(...values);

  const updated = db.prepare("SELECT * FROM listings WHERE id = ?").get(req.params.id);
  res.json({ message: "Listing updated.", listing: updated });
});

// ─── DELETE /api/listings/:id ─────────────────────────────────────────────────
router.delete("/:id", requireAuth, (req, res) => {
  const listing = db.prepare("SELECT * FROM listings WHERE id = ? AND status != 'deleted'").get(req.params.id);
  if (!listing) return res.status(404).json({ error: "Listing not found." });
  if (listing.user_id !== req.user.id && req.user.role !== "admin") {
    return res.status(403).json({ error: "Not authorized." });
  }

  // Soft delete
  db.prepare("UPDATE listings SET status = 'deleted', updated_at = datetime('now') WHERE id = ?").run(req.params.id);
  res.json({ message: "Listing deleted." });
});

// ─── POST /api/listings/:id/save ─────────────────────────────────────────────
router.post("/:id/save", requireAuth, (req, res) => {
  const listing = db.prepare("SELECT id FROM listings WHERE id = ? AND status = 'active'").get(req.params.id);
  if (!listing) return res.status(404).json({ error: "Listing not found." });

  const existing = db.prepare(
    "SELECT 1 FROM saved_listings WHERE user_id = ? AND listing_id = ?"
  ).get(req.user.id, req.params.id);

  if (existing) {
    db.prepare("DELETE FROM saved_listings WHERE user_id = ? AND listing_id = ?")
      .run(req.user.id, req.params.id);
    return res.json({ message: "Removed from saved.", saved: false });
  }

  db.prepare("INSERT INTO saved_listings (user_id, listing_id) VALUES (?, ?)")
    .run(req.user.id, req.params.id);
  res.json({ message: "Listing saved!", saved: true });
});

module.exports = router;
