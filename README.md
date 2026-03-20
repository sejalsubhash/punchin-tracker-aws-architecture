<div align="center">

# 🕐 Punch Tracker
### Cloud-Based Team Attendance Management System

[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://reactjs.org)
[![Couchbase](https://img.shields.io/badge/Couchbase-Capella-EA2328?style=for-the-badge&logo=couchbase&logoColor=white)](https://cloud.couchbase.com)
[![AWS](https://img.shields.io/badge/AWS-SNS%20%2B%20S3%20%2B%20EC2%20%2B%20VPC-FF9900?style=for-the-badge&logo=amazonaws&logoColor=white)](https://aws.amazon.com)
[![Render](https://img.shields.io/badge/Hosted%20on-Render-46E3B7?style=for-the-badge&logo=render&logoColor=white)](https://render.com)

**A production-ready punch-in/out tracking system with webcam photo capture, cloud storage, real-time email alerts, automated daily backups, and secure AWS infrastructure.**

🌐 **[View Live App](https://secure-punch-in-tracker.onrender.com)**

---

</div>

## 📌 Table of Contents

- [Aim](#-aim)
- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Architecture](#-architecture)
- [Project Structure](#-project-structure)
- [AWS Infrastructure Setup](#-aws-infrastructure-setup)
  - [VPC & Networking](#step-1--create-vpc--networking)
  - [Security Groups](#step-2--create-security-groups)
  - [EC2 Instances](#step-3--launch-ec2-instances)
  - [S3 Buckets](#step-4--create-s3-buckets)
  - [IAM User & Permissions](#step-5--create-iam-user--permissions)
  - [SNS Email Alerts](#step-6--create-sns-topic-for-email-alerts)
  - [Application Load Balancer](#step-7--create-application-load-balancer)
- [Couchbase Setup](#-couchbase-setup)
- [Photo API — Private EC2](#-photo-api--private-ec2-setup)
- [Environment Variables](#-environment-variables)
- [Local Development](#-local-development)
- [Deploy to Render](#-deploy-to-rendercom)
- [API Reference](#-api-reference)
- [S3 Storage Structure](#-s3-storage-structure)
- [Troubleshooting](#-troubleshooting)

---

## 🎯 Aim

To develop a cloud-based team attendance tracking system that enables employees to digitally record their daily work hours through a web interface with webcam photo capture on punch-in, provides real-time email notifications to the team lead using AWS SNS, ensures secure data storage in Couchbase with automated daily CSV backups to AWS S3, and follows secure AWS infrastructure best practices using VPC, public/private subnets, Bastion Host, NAT Gateway, and Application Load Balancer.

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 👥 Team Member Selection | Coloured avatar grid — click to select member |
| 👋 Welcome with Photo | Header shows member photo + "Welcome, [Name]!" |
| ⏰ Live Clock | Real-time clock displayed in header |
| 📷 Webcam Capture | Auto-captures photo on Punch In |
| 🟢 Punch In | Records start of workday + captures photo |
| 🟡 Break | Records break time |
| 🔴 Punch Out | Records end of workday |
| ⚡ Auto Entry | Captures local browser time automatically |
| ✏️ Manual Entry | User enters custom time and date |
| 📊 Stats Bar | Today's totals — check-ins, breaks, check-outs, active |
| 📋 Records Table | Searchable, filterable, paginated attendance table |
| 🖼️ Photo Thumbnails | Punch-in photos shown in table, click to enlarge |
| 🗑️ Delete Own Entry | Members can delete only their own records |
| 🗄️ Couchbase Storage | Persistent cloud database |
| 📧 AWS SNS Alerts | Email to team lead on every action |
| 🪣 S3 Photo Storage | Punch-in photos stored securely in private S3 bucket |
| 🗂️ S3 JSON Backup | Every record instantly backed up as JSON to S3 |
| 📅 Daily CSV Backup | Full day's records backed up as CSV at midnight UTC |
| 🔐 Secure AWS Infra | VPC, private subnet, Bastion Host, NAT Gateway, ALB |
| 🎨 Light Theme | Professional white/blue UI with JetBrains Mono font |

---

## 🏗️ Tech Stack

```
┌─────────────────────────────────────────────────────────────┐
│                       FRONTEND                              │
│         React 18  +  Axios  +  Plus Jakarta Sans            │
├─────────────────────────────────────────────────────────────┤
│                  RENDER BACKEND (Public)                    │
│              Node.js  +  Express.js                         │
├──────────────┬──────────────┬──────────────────────────────┤
│  Couchbase   │   AWS SNS    │     AWS S3 (Backup)          │
│   Capella    │   (Email)    │   Daily CSV + JSON records   │
├──────────────┴──────────────┴──────────────────────────────┤
│              PRIVATE EC2 (Photo API)                        │
│         Node.js + Express — Port 3001                       │
│         Receives photo → Uploads to S3 → Pre-signed URL     │
├─────────────────────────────────────────────────────────────┤
│                  AWS INFRASTRUCTURE                         │
│  VPC → Public Subnet (Bastion + ALB + NAT GW)               │
│       → Private Subnet (EC2 API Server)                     │
├─────────────────────────────────────────────────────────────┤
│                       HOSTING                               │
│           Render.com  +  GitHub CI/CD                       │
└─────────────────────────────────────────────────────────────┘
```

---

## 🏛️ Architecture

```
User (Browser HTTPS)
       │
       ▼
Render.com — React Frontend + Main Backend
       │
       ├──► Couchbase Capella (all records)
       ├──► AWS SNS (email alerts to team lead)
       ├──► AWS S3 punch-records-backup (daily CSV + JSON)
       └──► /api/upload-photo proxy
                    │
                    ▼
          Application Load Balancer (HTTP:80)
          [Public Subnet — internet-facing]
                    │
                    ▼
          Private EC2 — Photo API (port 3001)
          [Private Subnet — no public IP]
                    │
                    ├──► AWS S3 punchin-screenshots (photos)
                    └──► Couchbase (punch record + photoUrl)

Internet access for Private EC2:
Private EC2 → NAT Gateway → Internet Gateway → Internet

SSH access:
Developer → Bastion Host (Public EC2) → Private EC2
```

---

## 📁 Project Structure

```
punch-tracker/                          ← GitHub repo root
│
├── 📁 backend/
│   └── 📁 src/
│       └── 📄 server.js               ← Main Express API
│
├── 📁 frontend/
│   ├── 📁 public/
│   │   └── 📄 index.html
│   └── 📁 src/
│       ├── 📁 components/
│       │   ├── Header.js / .css
│       │   ├── MemberSelector.js / .css
│       │   ├── PunchPanel.js / .css
│       │   ├── RecordsTable.js / .css
│       │   ├── StatsBar.js / .css
│       │   └── Toast.js / .css
│       ├── 📁 hooks/
│       │   └── useTime.js
│       ├── 📁 utils/
│       │   └── api.js
│       ├── App.js / .css
│       └── index.js / .css
│
├── 📁 photo-api/                       ← Private EC2 ONLY (not GitHub)
│   ├── server.js
│   ├── package.json
│   └── .env
│
├── 📄 package.json
├── 📄 render.yaml
├── 📄 .env.example
├── 📄 .gitignore
└── 📄 README.md
```

> ⚠️ The `photo-api/` folder runs **only on Private EC2**. Never push it to GitHub.

---

## ☁️ AWS Infrastructure Setup

### Step 1 — Create VPC & Networking

**Create VPC:**
1. AWS Console → VPC → **Create VPC**
2. Name: `punch-tracker-vpc`
3. IPv4 CIDR: `10.0.0.0/16`
4. Click **Create VPC**

**Create Public Subnet:**
1. VPC → Subnets → **Create subnet**
2. VPC: `punch-tracker-vpc`
3. Name: `punch-public-subnet`
4. Availability Zone: `us-east-2a`
5. CIDR: `10.0.1.0/24`

**Create Private Subnet:**
1. Create another subnet
2. Name: `punch-private-subnet`
3. CIDR: `10.0.2.0/24`

**Create Internet Gateway:**
1. VPC → Internet Gateways → **Create**
2. Name: `punch-igw`
3. Attach to `punch-tracker-vpc`

**Create NAT Gateway:**
1. VPC → NAT Gateways → **Create**
2. Subnet: `punch-public-subnet`
3. Allocate new Elastic IP
4. Click **Create**

**Create Route Tables:**

Public route table:
1. Create route table → Name: `punch-public-rt` → VPC: your VPC
2. Edit routes → Add: `0.0.0.0/0` → Target: Internet Gateway
3. Associate with `punch-public-subnet`

Private route table:
1. Create route table → Name: `punch-private-rt`
2. Edit routes → Add: `0.0.0.0/0` → Target: NAT Gateway
3. Associate with `punch-private-subnet`

---

### Step 2 — Create Security Groups

**Bastion Host SG:**
| Type | Protocol | Port | Source |
|------|----------|------|--------|
| SSH | TCP | 22 | Your IP `x.x.x.x/32` |

**Private EC2 SG:**
| Type | Protocol | Port | Source |
|------|----------|------|--------|
| SSH | TCP | 22 | Bastion SG |
| Custom TCP | TCP | 3001 | ALB SG |

**ALB SG:**
| Type | Protocol | Port | Source |
|------|----------|------|--------|
| HTTP | TCP | 80 | `0.0.0.0/0` |

---

### Step 3 — Launch EC2 Instances

**Bastion Host (Public Subnet):**
1. EC2 → **Launch Instance**
2. AMI: Ubuntu Server 22.04 LTS
3. Instance type: `t2.micro`
4. Network: `punch-tracker-vpc` → Subnet: `punch-public-subnet`
5. Auto-assign public IP: **Enable**
6. Security group: Bastion SG
7. Create key pair → download `.pem` file

**Private EC2 (Private Subnet):**
1. Launch another instance
2. Same AMI and instance type
3. Subnet: `punch-private-subnet`
4. Auto-assign public IP: **Disable**
5. Security group: Private EC2 SG
6. Same key pair

**SSH Access:**
```bash
# From your local machine → Bastion
ssh -i "your-key.pem" ubuntu@<BASTION_PUBLIC_IP>

# From Bastion → Private EC2
ssh -i "your-key.pem" ubuntu@<PRIVATE_EC2_PRIVATE_IP>
# Private EC2 IP is 10.0.2.x (visible in EC2 console)
```

---

### Step 4 — Create S3 Buckets

**Bucket 1 — Daily CSV backup:**
1. S3 → **Create bucket**
2. Name: `punch-records-backup-<your-account-id>`
3. Region: `us-east-2`
4. Block all public access: **ON**

**Bucket 2 — Punch-in photos:**
1. Create another bucket
2. Name: `punchin-screenshots-bucket-<your-account-id>`
3. Region: `us-east-2`
4. Block all public access: **ON**

---

### Step 5 — Create IAM User & Permissions

**Create IAM Role for Private EC2:**
1. IAM → Roles → **Create role**
2. Trusted entity: EC2
3. Attach policy: `AmazonS3FullAccess`
4. Name: `punch-ec2-s3-role`
5. Attach to Private EC2: EC2 → Instance → Actions → Security → Modify IAM role

**Create IAM User for Render:**
1. IAM → Users → **Create user**
2. Name: `punch-tracker-bot`
3. Attach policies: `AmazonSNSFullAccess` + `AmazonS3FullAccess`
4. Create access key → save `Access Key ID` and `Secret Access Key`

---

### Step 6 — Create SNS Topic for Email Alerts

1. SNS → Topics → **Create topic**
2. Type: **Standard**
3. Name: `TeamAttendanceAlerts`
4. Copy the **Topic ARN**

**Subscribe team lead email:**
1. Open topic → **Create subscription**
2. Protocol: **Email**
3. Endpoint: `teamlead@yourcompany.com`
4. Team lead must **confirm** the subscription email from AWS

---

### Step 7 — Create Application Load Balancer

**Create Target Group:**
1. EC2 → Target Groups → **Create target group**
2. Type: Instances
3. Name: `punch-photo-tg`
4. Protocol: HTTP, Port: `3001`
5. VPC: your VPC
6. Health check path: `/health`
7. Register: select Private EC2 → port `3001`

**Create ALB:**
1. EC2 → Load Balancers → **Create → Application Load Balancer**
2. Name: `punch-photo-alb`
3. Scheme: **Internet-facing**
4. Subnets: both public subnets (2 AZs required)
5. Security group: ALB SG
6. Listener: HTTP:80 → forward to `punch-photo-tg`
7. Copy the **DNS name**

---

## 🗄️ Couchbase Capella Setup

> All steps are on **[cloud.couchbase.com](https://cloud.couchbase.com)**

### Step 1 — Sign Up & Create Organization

1. Go to **https://cloud.couchbase.com** → click **Sign Up Free**
2. Enter your email, name and password → verify email
3. You will land on the **Capella dashboard**
4. An **Organization** is created automatically with your name

---

### Step 2 — Create a Project

1. From the dashboard → click **Create Project**
2. Name: `punch-tracker-project`
3. Click **Create Project**

---

### Step 3 — Create a Cluster

1. Inside your project → click **Create Cluster**
2. Select **Free tier** (no credit card required)
3. Cloud provider: **AWS**
4. Region: select same region as your EC2 (e.g. `us-east-2`)
5. Cluster name: `punch-tracker-cluster`
6. Click **Create Cluster**
7. ⏳ Wait 5–10 minutes for cluster to be ready (status shows **Healthy**)

---

### Step 4 — Create a Bucket

1. Click your cluster → go to **Data Tools** tab → click **Buckets**
2. Click **Create Bucket**
3. Bucket name: `employee-punch-records`
4. Memory quota: `100 MB` (free tier limit)
5. Leave all other settings as default
6. Click **Create Bucket**

---

### Step 5 — Create Database Access Credentials

1. Click your cluster → go to **Settings** tab
2. Click **Database Access** in left sidebar
3. Click **Create Database User**
4. Username: `punch-tracker-user`
5. Password: create a strong password (save it!)
6. Under **Bucket Access** → select `employee-punch-records` → set to **Read/Write**
7. Click **Create Database User**

> ⚠️ Save the username and password — these are `CB_USERNAME` and `CB_PASSWORD` in your `.env`

---

### Step 6 — Allow IP Access

1. Still in **Settings** → click **Allowed IP Addresses**
2. Click **Add Allowed IP**
3. For Render.com hosting → click **"Allow Access from Anywhere"**
   - This adds `0.0.0.0/0` which allows all IPs
4. Click **Add Allowed IP**

> 💡 For production security, add specific Render outbound IPs instead of `0.0.0.0/0`

---

### Step 7 — Get Connection String

1. Click your cluster → click **Connect** button (top right)
2. Select **Node.js** as SDK
3. Copy the **Connection String** — looks like:
```
couchbases://cb.mdkkm6ioipzmcd6z.cloud.couchbase.com
```
4. This is your `COUCHDB_URL` environment variable

---

### Step 8 — Verify Connection (optional)

Test from your local machine or Private EC2:
```bash
curl https://secure-punch-in-tracker.onrender.com/api/health
# Expected: {"status":"ok","timestamp":"..."}
```

If Couchbase is connected you will see in Render logs:
```
✅ Couchbase: Primary index ready
✅ Couchbase: Connected to bucket 'employee-punch-records'
```

---

### Couchbase Document Structure

Each punch record stored in Couchbase looks like:
```json
{
  "type": "punch_record",
  "name": "Priya Patel",
  "action": "punch-in",
  "time": "09:32:00",
  "date": "2026-03-18",
  "entryType": "auto",
  "photoUrl": "https://punchin-screenshots-bucket.s3.amazonaws.com/punch-photos/priya-patel-xxx.jpg?X-Amz-Algorithm=...",
  "s3Key": "punch-photos/priya-patel-2026-03-18-09-32-xxx.jpg",
  "timestamp": "2026-03-18T09:32:00.000Z",
  "createdAt": 1773814486555
}
```

---

## 📷 Photo API — Private EC2 Setup

SSH into Private EC2 via Bastion, then:

```bash
# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Create photo-api folder
mkdir ~/photo-api && cd ~/photo-api

# Create files
nano server.js      # paste photo-api/server.js content
nano package.json   # paste photo-api/package.json content
nano .env           # paste and fill your values

# Install dependencies
npm install

# Install PM2 and start
sudo npm install -g pm2
pm2 start server.js --name photo-api
pm2 save
pm2 startup
```

**photo-api/.env:**
```env
PORT=3001
AWS_REGION=us-east-2
S3_BUCKET_NAME=punchin-screenshots-bucket-<account-id>
COUCHDB_URL=couchbases://cb.xxx.cloud.couchbase.com
CB_USERNAME=your_username
CB_PASSWORD=your_password
COUCHDB_DB=employee-punch-records
CB_SCOPE=_default
CB_COLLECTION=_default
```

**Test API:**
```bash
curl http://localhost:3001/health
# Expected: {"status":"ok"}

curl http://<ALB-DNS>/health
# Expected: {"status":"ok"}
```

---

## ⚙️ Environment Variables

### Render Dashboard Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `NODE_ENV` | `production` | Yes |
| `COUCHDB_URL` | Couchbase connection string | Yes |
| `CB_USERNAME` | Couchbase username | Yes |
| `CB_PASSWORD` | Couchbase password | Yes |
| `COUCHDB_DB` | Bucket name | Yes |
| `CB_SCOPE` | `_default` | No |
| `CB_COLLECTION` | `_default` | No |
| `AWS_REGION` | e.g. `us-east-2` | Yes |
| `AWS_ACCESS_KEY_ID` | IAM user access key | Yes |
| `AWS_SECRET_ACCESS_KEY` | IAM user secret key | Yes |
| `SNS_TOPIC_ARN` | SNS topic ARN | Yes |
| `S3_BUCKET_NAME` | Backup bucket name | Yes |
| `PHOTO_API_URL` | ALB DNS e.g. `http://punch-alb-xxx.us-east-2.elb.amazonaws.com` | Yes |
| `TEAM_MEMBERS` | Comma-separated names | No |

---

## 💻 Local Development

```bash
# Clone repo
git clone https://github.com/sejalsubhash/punch-tracker-with-aws-integration.git
cd punch-tracker-with-aws-integration

# Install all dependencies
npm run install:all

# Configure environment
cp .env.example .env
# Edit .env with your values

# Run backend (Terminal 1)
npm run dev:backend
# → http://localhost:5000

# Run frontend (Terminal 2)
npm run dev:frontend
# → http://localhost:3000
```

---

## 🌐 Deploy to Render.com

```bash
# Push to GitHub
git add .
git commit -m "deploy: punch tracker"
git push origin main
```

1. Go to [render.com](https://render.com) → **New → Web Service**
2. Connect GitHub repo
3. Settings:

| Field | Value |
|-------|-------|
| Build Command | `npm run build` |
| Start Command | `npm start` |
| Node Version | 20 |

4. Add all environment variables from the table above
5. Click **Deploy**

---

## 🔗 API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/members` | List team members |
| POST | `/api/punch` | Save punch record + SNS + S3 JSON backup |
| GET | `/api/records` | All attendance records |
| GET | `/api/records/:name` | Records for one member |
| DELETE | `/api/records/:id` | Delete a record (stays in S3) |
| POST | `/api/upload-photo` | Proxy: photo → ALB → Private EC2 → S3 |
| POST | `/api/backup` | Manual S3 CSV backup trigger |
| GET | `/api/backup/status` | S3 backup config status |

**POST /api/punch body:**
```json
{
  "name": "Priya Patel",
  "action": "punch-in",
  "time": "09:32:00",
  "date": "2026-03-18",
  "entryType": "auto"
}
```

**POST /api/upload-photo body:**
```json
{
  "name": "Priya Patel",
  "time": "09:32:00",
  "date": "2026-03-18",
  "entryType": "auto",
  "photo": "data:image/jpeg;base64,/9j/4AAQ..."
}
```

---

## 📂 S3 Storage Structure

```
punch-records-backup-<account-id>/          ← Render backend
├── attendance-records/
│   ├── 2026-03-17.csv                      ← daily CSV (midnight UTC)
│   └── 2026-03-18.csv
└── records/
    └── 2026-03-18/
        ├── punch-in/
        │   └── priya-patel-1234567890.json ← instant JSON backup
        ├── break/
        │   └── sejal-subhash-xxx.json
        └── punch-out/
            └── rahul-sharma-xxx.json

punchin-screenshots-bucket-<account-id>/    ← Private EC2
└── punch-photos/
    ├── priya-patel-2026-03-18-09-32-xxx.jpg
    └── sejal-subhash-2026-03-18-10-05-xxx.jpg
```

---

## 🛠 Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| `http is not defined` | Missing imports in server.js | Add `const http = require("http"); const https = require("https");` at top |
| `Photo upload failed` | ALB not reachable | Check ALB SG allows port 80, target group shows healthy |
| `Failed to fetch` | HTTPS→HTTP mixed content | Use Render proxy `/api/upload-photo` not direct ALB URL |
| Image not showing | Direct S3 URL (private bucket) | Use pre-signed URLs — install `@aws-sdk/s3-request-presigner` on EC2 |
| `Bucket endpoint error` | Wrong AWS region in EC2 .env | Set `AWS_REGION=us-east-2` to match S3 bucket region |
| PM2 not found after reboot | PM2 startup not saved | Run `pm2 startup` then `pm2 save` on Private EC2 |
| Target group unhealthy | Wrong port or health check path | Set health check path to `/health` and port to `3001` |
| SNS emails not arriving | Subscription not confirmed | Team lead must click AWS confirmation email |
| App slow on first load | Render free plan sleep | Normal — first request after 15min takes ~30s |

---

## 📄 License

MIT © 2026 Sejal Subhash

---

<div align="center">

Built with React, Node.js, Couchbase, and AWS (VPC + EC2 + S3 + SNS + ALB)

⭐ Star this repo if it helped you!

</div>
