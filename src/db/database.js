const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const DB_PATH = path.join(__dirname, "../../data/uniplace.db");

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(DB_PATH);

// Enable WAL mode for better performance
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Create all tables
db.exec(`
  -- Users table
  CREATE TABLE IF NOT EXISTS users (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    email       TEXT UNIQUE NOT NULL,
    password    TEXT NOT NULL,
    university  TEXT,
    avatar_url  TEXT,
    bio         TEXT,
    phone       TEXT,
    role        TEXT NOT NULL DEFAULT 'student',  -- student | admin
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Categories table
  CREATE TABLE IF NOT EXISTS categories (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    name  TEXT UNIQUE NOT NULL,
    icon  TEXT
  );

  -- Listings table
  CREATE TABLE IF NOT EXISTS listings (
    id            TEXT PRIMARY KEY,
    user_id       TEXT NOT NULL,
    title         TEXT NOT NULL,
    description   TEXT NOT NULL,
    category_id   INTEGER,
    price         REAL,
    price_type    TEXT DEFAULT 'fixed',   -- fixed | negotiable | free | per_hour
    listing_type  TEXT NOT NULL DEFAULT 'service',  -- service | product | business
    status        TEXT NOT NULL DEFAULT 'active',   -- active | sold | paused | deleted
    location      TEXT,
    university    TEXT,
    contact_email TEXT,
    contact_phone TEXT,
    views         INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id)
  );

  -- Listing images table
  CREATE TABLE IF NOT EXISTS listing_images (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    listing_id  TEXT NOT NULL,
    url         TEXT NOT NULL,
    is_primary  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE
  );

  -- Saved/Bookmarked listings
  CREATE TABLE IF NOT EXISTS saved_listings (
    user_id     TEXT NOT NULL,
    listing_id  TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, listing_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE
  );

  -- Messages between users
  CREATE TABLE IF NOT EXISTS messages (
    id          TEXT PRIMARY KEY,
    sender_id   TEXT NOT NULL,
    receiver_id TEXT NOT NULL,
    listing_id  TEXT,
    content     TEXT NOT NULL,
    is_read     INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE SET NULL
  );

  -- Reviews / Ratings
  CREATE TABLE IF NOT EXISTS reviews (
    id          TEXT PRIMARY KEY,
    reviewer_id TEXT NOT NULL,
    seller_id   TEXT NOT NULL,
    listing_id  TEXT,
    rating      INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
    comment     TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE SET NULL
  );
`);

// Seed default categories
const insertCategory = db.prepare(
  "INSERT OR IGNORE INTO categories (name, icon) VALUES (?, ?)"
);

const defaultCategories = [
  ["Tutoring", "📚"],
  ["Food & Snacks", "🍔"],
  ["Clothing & Fashion", "👗"],
  ["Technology", "💻"],
  ["Beauty & Hair", "💄"],
  ["Transport & Rides", "🚗"],
  ["Art & Design", "🎨"],
  ["Photography", "📷"],
  ["Music & Entertainment", "🎵"],
  ["Printing & Stationery", "🖨️"],
  ["Health & Fitness", "💪"],
  ["Other", "📦"],
];

for (const [name, icon] of defaultCategories) {
  insertCategory.run(name, icon);
}

console.log("✅ Database initialized at", DB_PATH);

module.exports = db;
