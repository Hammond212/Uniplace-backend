# Uni Marketplace Botswana — Backend API

A full REST API backend for the Uni Marketplace platform, built with **Node.js + Express + SQLite**.

---

## 🚀 Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Set up environment variables
```bash
cp .env.example .env
# Edit .env and change JWT_SECRET to a long random string!
```

### 3. Start the server
```bash
# Development (auto-restart on changes)
npm run dev

# Production
npm start
```

The server runs on **http://localhost:5000** by default.

---

## 📁 Project Structure

```
uniplace-backend/
├── src/
│   ├── server.js          # Entry point
│   ├── db/
│   │   └── database.js    # SQLite setup & schema
│   ├── middleware/
│   │   ├── auth.js        # JWT authentication
│   │   └── upload.js      # File upload (Multer)
│   └── routes/
│       ├── auth.js        # Register, login, profile
│       ├── listings.js    # CRUD listings + images
│       ├── messages.js    # User messaging
│       ├── reviews.js     # Ratings & reviews
│       ├── users.js       # User profiles, saved
│       └── categories.js  # Listing categories
├── uploads/               # Uploaded images (auto-created)
├── data/                  # SQLite database (auto-created)
├── .env.example
└── package.json
```

---

## 🔐 Authentication

All protected routes require a `Bearer` token in the `Authorization` header:

```
Authorization: Bearer <your_jwt_token>
```

You get a token when you **register** or **login**.

---

## 📡 API Reference

### Auth

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/register` | ❌ | Create account |
| POST | `/api/auth/login` | ❌ | Login |
| GET | `/api/auth/me` | ✅ | Get my profile |
| PATCH | `/api/auth/me` | ✅ | Update profile |
| POST | `/api/auth/me/avatar` | ✅ | Upload avatar image |
| POST | `/api/auth/change-password` | ✅ | Change password |

**Register body:**
```json
{
  "name": "Thabo Mokoena",
  "email": "thabo@ub.bw",
  "password": "securepass123",
  "university": "University of Botswana",
  "phone": "+267 71234567"
}
```

---

### Listings

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/listings` | ❌ | Get all listings (with filters) |
| GET | `/api/listings/:id` | ❌ | Get single listing |
| POST | `/api/listings` | ✅ | Create listing |
| POST | `/api/listings/:id/images` | ✅ | Upload images to listing |
| PATCH | `/api/listings/:id` | ✅ | Update listing |
| DELETE | `/api/listings/:id` | ✅ | Delete listing |
| POST | `/api/listings/:id/save` | ✅ | Save/unsave listing |

**Query params for GET /api/listings:**
- `search` — keyword search
- `category` — filter by category name
- `listing_type` — `service` | `product` | `business`
- `university` — filter by university
- `min_price` / `max_price` — price range
- `sort` — `newest` | `oldest` | `price_asc` | `price_desc` | `popular`
- `page` / `limit` — pagination (default: page=1, limit=12)

**Create listing body:**
```json
{
  "title": "Python Tutoring",
  "description": "I offer Python tutoring sessions for beginners.",
  "category_id": 1,
  "price": 50,
  "price_type": "per_hour",
  "listing_type": "service",
  "location": "Main Campus",
  "university": "University of Botswana",
  "contact_phone": "+267 71234567"
}
```

**price_type options:** `fixed` | `negotiable` | `free` | `per_hour`

---

### Categories

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/categories` | ❌ | List all categories |
| POST | `/api/categories` | 🔑 Admin | Create category |

**Default categories included:**
Tutoring, Food & Snacks, Clothing & Fashion, Technology, Beauty & Hair, Transport & Rides, Art & Design, Photography, Music & Entertainment, Printing & Stationery, Health & Fitness, Other

---

### Messages

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/messages/conversations` | ✅ | Get all conversations |
| GET | `/api/messages/:userId` | ✅ | Get thread with a user |
| POST | `/api/messages` | ✅ | Send a message |
| GET | `/api/messages/unread/count` | ✅ | Get unread count |

**Send message body:**
```json
{
  "receiver_id": "user-uuid",
  "listing_id": "listing-uuid",
  "content": "Hi, is this still available?"
}
```

---

### Reviews

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/reviews/user/:userId` | ❌ | Get reviews for a user |
| POST | `/api/reviews` | ✅ | Post a review |
| DELETE | `/api/reviews/:id` | ✅ | Delete a review |

**Post review body:**
```json
{
  "seller_id": "user-uuid",
  "listing_id": "listing-uuid",
  "rating": 5,
  "comment": "Very helpful tutor, highly recommend!"
}
```

---

### Users

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/users/:id/profile` | ❌ | Public user profile + listings |
| GET | `/api/users/me/saved` | ✅ | My saved listings |
| GET | `/api/users/me/listings` | ✅ | My listings |

---

## 🌐 Connecting Your Frontend

Update your frontend to point API calls to this server. Example:

```javascript
const API_BASE = "http://localhost:5000/api"; // development
// const API_BASE = "https://your-server.com/api"; // production

// Login example
const response = await fetch(`${API_BASE}/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password }),
});
const { token, user } = await response.json();
localStorage.setItem("token", token);

// Authenticated request example
const listings = await fetch(`${API_BASE}/listings`, {
  headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
}).then(r => r.json());
```

---

## 🚢 Deployment Options

### Option A: Railway (easiest)
1. Push to GitHub
2. Connect repo to [Railway](https://railway.app)
3. Add environment variables in Railway dashboard
4. Done — Railway gives you a public URL

### Option B: Render
1. Push to GitHub  
2. Create a new **Web Service** on [Render](https://render.com)
3. Set build command: `npm install`
4. Set start command: `npm start`
5. Add env vars

### Option C: VPS (DigitalOcean / Hetzner)
```bash
git clone your-repo
cd uniplace-backend
npm install
cp .env.example .env  # Edit with production values
npm install -g pm2
pm2 start src/server.js --name uniplace-api
pm2 save
```

---

## ⚙️ Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `5000` |
| `JWT_SECRET` | Secret for signing tokens | **CHANGE THIS!** |
| `JWT_EXPIRES_IN` | Token expiry | `7d` |
| `MAX_FILE_SIZE` | Max upload size in bytes | `5242880` (5MB) |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins | localhost + GitHub Pages |
