# 🕐 Punch Tracker — Team Attendance System

A full-stack React + Node.js team punch-in/out tracking system with **CouchDB** storage and **AWS SNS** email notifications.

---

## 📁 Project Structure

```
punch-tracker/
├── backend/
│   └── src/
│       └── server.js          # Express API server
├── frontend/
│   ├── public/
│   │   └── index.html
│   └── src/
│       ├── components/
│       │   ├── Header.js / .css
│       │   ├── MemberSelector.js / .css
│       │   ├── PunchPanel.js / .css
│       │   ├── RecordsTable.js / .css
│       │   ├── StatsBar.js / .css
│       │   └── Toast.js / .css
│       ├── hooks/
│       │   └── useTime.js
│       ├── utils/
│       │   └── api.js
│       ├── App.js / .css
│       └── index.js / .css
├── .env.example
├── .gitignore
├── package.json               # Root — runs backend
├── render.yaml
└── README.md
```

---

## 🚀 Features

- ✅ Team member selection with coloured avatars
- ✅ **Punch In / Break / Punch Out** actions
- ✅ **Auto entry** — captures browser local time
- ✅ **Manual entry** — user types custom time & date
- ✅ Welcome message with selected member's name
- ✅ Live clock in header
- ✅ Today's stats bar (check-ins, breaks, check-outs, active members)
- ✅ Records table with search, filter by action, and pagination
- ✅ **CouchDB** persistent storage
- ✅ **AWS SNS email** notification to team lead on every action
- ✅ Toast notifications for user feedback
- ✅ Auto-refresh records every 30 seconds

---

## ⚙️ Local Development Setup

### Prerequisites
- Node.js ≥ 18
- CouchDB running locally (or a hosted instance)
- AWS account with SNS configured

### Step 1 — Clone & Install

```bash
git clone https://github.com/YOUR_USERNAME/punch-tracker.git
cd punch-tracker
npm run install:all
```

### Step 2 — Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
PORT=5000
NODE_ENV=development
COUCHDB_URL=http://admin:yourpassword@localhost:5984
COUCHDB_DB=punch_tracker
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
SNS_TOPIC_ARN=arn:aws:sns:us-east-1:123456789012:TeamAttendanceAlerts
TEAM_MEMBERS=Alice Smith,Bob Jones,Carol White,Dave Kumar
```

### Step 3 — Run Locally

**Terminal 1 — Backend:**
```bash
npm run dev:backend
# Server starts at http://localhost:5000
```

**Terminal 2 — Frontend:**
```bash
npm run dev:frontend
# React app starts at http://localhost:3000
```

---

## ☁️ AWS SNS Setup (Email Notifications)

Follow these steps to set up email alerts to your team lead:

### 1. Create an SNS Topic

1. Go to **AWS Console → SNS → Topics**
2. Click **Create topic**
3. Type: **Standard**
4. Name: `TeamAttendanceAlerts`
5. Click **Create topic**
6. Copy the **Topic ARN** — you'll need it for `SNS_TOPIC_ARN`

### 2. Subscribe Team Lead's Email

1. Open your topic → **Create subscription**
2. Protocol: **Email**
3. Endpoint: `teamlead@yourcompany.com`
4. Click **Create subscription**
5. ✉️ **The team lead must confirm** the subscription via the email AWS sends

### 3. Create IAM User for API Access

1. Go to **IAM → Users → Create user**
2. Name: `punch-tracker-bot`
3. Attach policy: **AmazonSNSFullAccess** (or a custom policy with `sns:Publish` only)
4. Create **Access Key** → save `Access Key ID` and `Secret Access Key`

### 4. Add to Environment

```env
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=YOUR_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY=YOUR_SECRET_KEY
SNS_TOPIC_ARN=arn:aws:sns:us-east-1:XXXXXXXXXXXX:TeamAttendanceAlerts
```

The notification message sent looks like:
```
📋 Attendance Update

Team Member: Rahul Sharma
Action: Punched In
Time: 09:32:14
Date: 2024-01-15
Entry Type: Auto

– Punch Tracker System
```

---

## 🐋 CouchDB Setup

### Option A — Local (for development)

Install and start CouchDB from https://couchdb.apache.org/

```bash
# Default admin setup URL:
http://localhost:5984/_utils
```

Create admin user, then set in `.env`:
```env
COUCHDB_URL=http://admin:yourpassword@localhost:5984
```

### Option B — Hosted (for production)

Use **IBM Cloudant** (free tier) or **Fly.io CouchDB**:
- Sign up at https://www.ibm.com/cloud/cloudant
- Create a database instance
- Get connection URL from credentials page
- Format: `https://username:password@account.cloudant.com`

---

## 🌐 Deploy to Render.com

### Step 1 — Push to GitHub

```bash
cd punch-tracker
git init
git add .
git commit -m "Initial commit: Punch Tracker"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/punch-tracker.git
git push -u origin main
```

### Step 2 — Create Web Service on Render

1. Go to https://render.com → **New → Web Service**
2. Connect your GitHub repository
3. Configure:
   - **Name:** `punch-tracker`
   - **Environment:** `Node`
   - **Build Command:** `npm run build`
   - **Start Command:** `npm start`
   - **Plan:** Free

### Step 3 — Set Environment Variables on Render

In Render Dashboard → Your Service → **Environment**:

| Key | Value |
|-----|-------|
| `NODE_ENV` | `production` |
| `PORT` | `5000` |
| `COUCHDB_URL` | `https://user:pass@yourhost.cloudant.com` |
| `COUCHDB_DB` | `punch_tracker` |
| `AWS_REGION` | `us-east-1` |
| `AWS_ACCESS_KEY_ID` | your key |
| `AWS_SECRET_ACCESS_KEY` | your secret |
| `SNS_TOPIC_ARN` | your topic ARN |
| `TEAM_MEMBERS` | `Alice,Bob,Carol,Dave` |

### Step 4 — Deploy

Click **Manual Deploy → Deploy latest commit**

Render will:
1. Run `npm run build` (installs deps + builds React)
2. Run `npm start` (starts Express server)
3. Express serves React build as static files + handles `/api/*` routes

Your app will be live at: `https://punch-tracker.onrender.com`

---

## 🔗 API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/members` | List team members |
| POST | `/api/punch` | Create a punch record |
| GET | `/api/records` | Get all records |
| GET | `/api/records/:name` | Get records for one member |
| DELETE | `/api/records/:id` | Delete a record |

### POST /api/punch — Body

```json
{
  "name": "Alice Smith",
  "action": "punch-in",
  "time": "09:32:00",
  "date": "2024-01-15",
  "entryType": "auto"
}
```

`action` must be one of: `punch-in` | `break` | `punch-out`

---

## 🛠 Troubleshooting

| Issue | Fix |
|-------|-----|
| SNS not sending | Check IAM user has `sns:Publish` permission; confirm team lead clicked the subscription confirmation email |
| CouchDB connection error | Verify `COUCHDB_URL` format includes `http://user:pass@host:port` |
| Records not showing in table | Click Refresh button; check browser console for API errors |
| Build fails on Render | Check Node version is ≥ 18 in Render settings |
| CSS not loading | Ensure `NODE_ENV=production` is set and `npm run build` completes successfully |

---

## 📄 License

MIT
