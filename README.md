# Complete Implementation Steps Guide
## Punch Tracker — Cloud-Based Attendance System

> This document covers every step performed to build and deploy the complete system from scratch.

---

## 📋 Table of Contents

1. [Application Overview](#1-application-overview)
2. [GitHub Repository Setup](#2-github-repository-setup)
3. [Couchbase Capella Setup](#3-couchbase-capella-setup)
4. [AWS VPC and Network Infrastructure](#4-aws-vpc-and-network-infrastructure)
5. [AWS Security Groups](#5-aws-security-groups)
6. [AWS EC2 Instances](#6-aws-ec2-instances)
7. [AWS S3 Buckets](#7-aws-s3-buckets)
8. [AWS IAM User and Permissions](#8-aws-iam-user-and-permissions)
9. [AWS SNS Email Notifications](#9-aws-sns-email-notifications)
10. [Application Load Balancer](#10-application-load-balancer)
11. [Private EC2 Photo API Deployment](#11-private-ec2-photo-api-deployment)
12. [S3 Daily CSV Backup](#12-s3-daily-csv-backup)
13. [S3 Instant JSON Record Backup](#13-s3-instant-json-record-backup)
14. [Live Punch-In Photo Storage to S3](#14-live-punch-in-photo-storage-to-s3)
15. [AWS Lambda — Serverless Photo Upload](#15-aws-lambda--serverless-photo-upload)
16. [AWS Rekognition — Face Verification](#16-aws-rekognition--face-verification)
17. [Render.com Deployment](#17-rendercom-deployment)
18. [Environment Variables Reference](#18-environment-variables-reference)
19. [Final Architecture Summary](#19-final-architecture-summary)

---

## 1. Application Overview

**Title:** Secure Cloud-Based Team Attendance Tracking System with Webcam Verification, AWS VPC Infrastructure, and Automated S3 Backup

**Live URL:** https://secure-punch-in-tracker.onrender.com
**GitHub:** https://github.com/sejalsubhash/punch-tracker-with-aws-integration

**Tech Stack:**
- Frontend: React 18
- Backend: Node.js + Express
- Database: Couchbase Capella
- Cloud: AWS (VPC, EC2, S3, SNS, ALB, Lambda, Rekognition)
- Hosting: Render.com

---

## 2. GitHub Repository Setup

### Repository Structure
```
punch-tracker/
├── backend/src/server.js      ← Main Express API
├── frontend/src/              ← React application
├── package.json               ← Root dependencies
├── render.yaml                ← Render config
└── README.md
```

### Push code to GitHub
```bash
git init
git add .
git commit -m "initial commit"
git remote add origin https://github.com/sejalsubhash/punch-tracker-with-aws-integration.git
git push -u origin main
```

---

## 3. Couchbase Capella Setup

### Step 3.1 — Create Account
1. Go to **https://cloud.couchbase.com**
2. Sign up for free account
3. Verify email

### Step 3.2 — Create Project
1. Dashboard → click **Create Project**
2. Name: `punch-tracker-project`
3. Click **Create Project**

### Step 3.3 — Create Free Tier Cluster
1. Inside project → click **Create Cluster**
2. Select **Free tier**
3. Cloud provider: **AWS**
4. Region: `us-east-2`
5. Cluster name: `punch-tracker-cluster`
6. Click **Create Cluster**
7. Wait 5-10 minutes for status: **Healthy**

### Step 3.4 — Create Bucket
1. Click cluster → **Data Tools → Buckets**
2. Click **Create Bucket**
3. Bucket name: `employee-punch-records`
4. Memory quota: `100 MB`
5. Click **Create Bucket**

### Step 3.5 — Create Database User
1. Cluster → **Settings → Database Access**
2. Click **Create Database User**
3. Username: `punch-tracker-user`
4. Password: your strong password
5. Bucket access: `employee-punch-records` → **Read/Write**
6. Click **Create Database User**
7. Save username and password as `CB_USERNAME` and `CB_PASSWORD`

### Step 3.6 — Allow IP Access
1. **Settings → Allowed IP Addresses**
2. Click **Add Allowed IP**
3. Click **Allow Access from Anywhere** (0.0.0.0/0)
4. Click **Add Allowed IP**

### Step 3.7 — Get Connection String
1. Click cluster → **Connect**
2. Select **Node.js**
3. Copy connection string:
   `couchbases://cb.xxxxxxxx.cloud.couchbase.com`
4. Save as `COUCHDB_URL`

---

## 4. AWS VPC and Network Infrastructure

### Step 4.1 — Create VPC
1. AWS Console → search **VPC** → click **VPC**
2. Left sidebar → **Your VPCs**
3. Click **Create VPC**
4. Settings:
   - Resources to create: **VPC only**
   - Name tag: `punch-tracker-vpc`
   - IPv4 CIDR: `10.0.0.0/16`
   - Tenancy: Default
5. Click **Create VPC**

### Step 4.2 — Create Public Subnet
1. Left sidebar → **Subnets → Create subnet**
2. VPC ID: `punch-tracker-vpc`
3. Subnet name: `punch-public-subnet`
4. Availability Zone: `us-east-2a`
5. IPv4 CIDR: `10.0.1.0/24`
6. Click **Create subnet**
7. Select subnet → **Actions → Edit subnet settings**
8. Check **Enable auto-assign public IPv4 address**
9. Click **Save**

### Step 4.3 — Create Private Subnet
1. Click **Create subnet**
2. VPC ID: `punch-tracker-vpc`
3. Subnet name: `punch-private-subnet`
4. Availability Zone: `us-east-2b`
5. IPv4 CIDR: `10.0.2.0/24`
6. Click **Create subnet**
7. Do NOT enable auto-assign public IP

### Step 4.4 — Create Internet Gateway
1. Left sidebar → **Internet Gateways → Create internet gateway**
2. Name tag: `punch-igw`
3. Click **Create internet gateway**
4. Click yellow banner **Attach to a VPC**
5. Select `punch-tracker-vpc`
6. Click **Attach internet gateway**

### Step 4.5 — Allocate Elastic IP
1. Left sidebar → **Elastic IPs**
2. Click **Allocate Elastic IP address**
3. Network border group: `us-east-2`
4. Click **Allocate**
5. Note the allocated IP address

### Step 4.6 — Create NAT Gateway
1. Left sidebar → **NAT Gateways → Create NAT gateway**
2. Name: `punch-nat-gw`
3. Subnet: `punch-public-subnet`
4. Connectivity type: **Public**
5. Elastic IP: select the IP from Step 4.5
6. Click **Create NAT gateway**
7. Wait until status: **Available**

### Step 4.7 — Create Public Route Table
1. Left sidebar → **Route Tables → Create route table**
2. Name: `punch-public-rt`
3. VPC: `punch-tracker-vpc`
4. Click **Create route table**
5. Click **Routes tab → Edit routes → Add route**
   - Destination: `0.0.0.0/0`
   - Target: Internet Gateway → `punch-igw`
6. Click **Save changes**
7. Click **Subnet associations → Edit subnet associations**
8. Check `punch-public-subnet`
9. Click **Save associations**

### Step 4.8 — Create Private Route Table
1. Click **Create route table**
2. Name: `punch-private-rt`
3. VPC: `punch-tracker-vpc`
4. Click **Create route table**
5. Click **Routes tab → Edit routes → Add route**
   - Destination: `0.0.0.0/0`
   - Target: NAT Gateway → `punch-nat-gw`
6. Click **Save changes**
7. Click **Subnet associations → Edit subnet associations**
8. Check `punch-private-subnet`
9. Click **Save associations**

---

## 5. AWS Security Groups

### Step 5.1 — Bastion Host Security Group
1. EC2 Console → **Security Groups → Create security group**
2. Name: `punch-bastion-sg`
3. Description: `Bastion Host SSH access`
4. VPC: `punch-tracker-vpc`
5. Inbound rules → Add rule:
   - Type: SSH | Port: 22 | Source: My IP
6. Click **Create security group**

### Step 5.2 — Private EC2 Security Group
1. Click **Create security group**
2. Name: `punch-private-ec2-sg`
3. Description: `Private EC2 SSH and API`
4. VPC: `punch-tracker-vpc`
5. Inbound rules → Add 2 rules:
   - Rule 1: SSH | Port: 22 | Source: `punch-bastion-sg`
   - Rule 2: Custom TCP | Port: 3001 | Source: `punch-alb-sg`
6. Click **Create security group**

### Step 5.3 — ALB Security Group
1. Click **Create security group**
2. Name: `punch-alb-sg`
3. Description: `ALB HTTP access`
4. VPC: `punch-tracker-vpc`
5. Inbound rules → Add rule:
   - Type: HTTP | Port: 80 | Source: `0.0.0.0/0`
6. Click **Create security group**

---

## 6. AWS EC2 Instances

### Step 6.1 — Launch Bastion Host
1. EC2 Console → **Instances → Launch instances**
2. Name: `punch-bastion-host`
3. AMI: **Ubuntu Server 22.04 LTS**
4. Instance type: `t2.micro`
5. Key pair: **Create new key pair**
   - Name: `punch-tracker-key`
   - Type: RSA | Format: `.pem`
   - Click **Create key pair** → save `.pem` file
6. Network settings → Edit:
   - VPC: `punch-tracker-vpc`
   - Subnet: `punch-public-subnet`
   - Auto-assign public IP: **Enable**
   - Security group: `punch-bastion-sg`
7. Click **Launch instance**
8. Note the **Public IPv4 address**

### Step 6.2 — Launch Private EC2
1. Click **Launch instances**
2. Name: `punch-private-ec2`
3. AMI: **Ubuntu Server 22.04 LTS**
4. Instance type: `t2.micro`
5. Key pair: `punch-tracker-key` (same key)
6. Network settings → Edit:
   - VPC: `punch-tracker-vpc`
   - Subnet: `punch-private-subnet`
   - Auto-assign public IP: **Disable**
   - Security group: `punch-private-ec2-sg`
7. Click **Launch instance**
8. Note the **Private IPv4 address** (10.0.2.x)

### Step 6.3 — SSH into Private EC2 via Bastion
```bash
# On local machine — copy key to Bastion
chmod 400 punch-tracker-key.pem
scp -i "punch-tracker-key.pem" punch-tracker-key.pem ubuntu@<BASTION_PUBLIC_IP>:~/.ssh/

# SSH into Bastion
ssh -i "punch-tracker-key.pem" ubuntu@<BASTION_PUBLIC_IP>

# From Bastion — SSH into Private EC2
chmod 400 ~/.ssh/punch-tracker-key.pem
ssh -i "~/.ssh/punch-tracker-key.pem" ubuntu@<PRIVATE_EC2_PRIVATE_IP>
```

### Step 6.4 — Install Node.js on Private EC2
```bash
# Update packages
sudo apt-get update

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify
node -v    # v20.x.x
npm -v     # 10.x.x

# Install PM2
sudo npm install -g pm2
```

---

## 7. AWS S3 Buckets

### Step 7.1 — Create Screenshots Bucket
1. Go to **https://s3.console.aws.amazon.com**
2. Click **Create bucket**
3. Bucket name: `punchin-screenshots-bucket-141095608859`
4. AWS Region: `us-east-2`
5. Block all public access: **ON** (all 4 checked)
6. Click **Create bucket**

### Step 7.2 — Create Backup Bucket
1. Click **Create bucket**
2. Bucket name: `punch-records-backup-141095608859`
3. AWS Region: `us-east-2`
4. Block all public access: **ON**
5. Click **Create bucket**

### Step 7.3 — Verify Block Public Access
1. Click each bucket → **Permissions tab**
2. Confirm **Block public access** shows all **On**
3. If any off → Edit → check all 4 → Save → type `confirm`

---

## 8. AWS IAM User and Permissions

### Step 8.1 — Create IAM User for Render
1. AWS Console → **IAM → Users → Create user**
2. Username: `punch-tracker-bot`
3. Click **Next**
4. Select **Attach policies directly**
5. Search and attach these policies:
   - `AmazonSNSFullAccess`
   - `AmazonS3FullAccess`
   - `AmazonRekognitionFullAccess` (added later)
6. Click **Next → Create user**
7. Open user → **Security credentials → Create access key**
8. Use case: **Application running outside AWS**
9. Click **Create access key**
10. Save `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`

### Step 8.2 — Create IAM Role for Private EC2
1. IAM → **Roles → Create role**
2. Trusted entity: **AWS service**
3. Use case: **EC2**
4. Click **Next**
5. Attach policy: `AmazonS3FullAccess`
6. Click **Next**
7. Role name: `punch-ec2-s3-role`
8. Click **Create role**

### Step 8.3 — Attach Role to Private EC2
1. EC2 → **Instances → punch-private-ec2**
2. Select instance → **Actions → Security → Modify IAM role**
3. Select `punch-ec2-s3-role`
4. Click **Update IAM role**

---

## 9. AWS SNS Email Notifications

### Step 9.1 — Create SNS Topic
1. AWS Console → **SNS → Topics → Create topic**
2. Type: **Standard**
3. Name: `TeamAttendanceAlerts`
4. Click **Create topic**
5. Copy the **Topic ARN** — save as `SNS_TOPIC_ARN`

### Step 9.2 — Subscribe Team Lead Email
1. Open topic → click **Create subscription**
2. Protocol: **Email**
3. Endpoint: `teamlead@yourcompany.com`
4. Click **Create subscription**
5. Team lead clicks **Confirm subscription** in the AWS email

### Step 9.3 — How Notifications Work
Every punch action triggers this message:
```
Subject: Team Attendance Update

📋 Attendance Update

Team Member: Priya Patel
Action: Punched In
Time: 09:32:00
Date: 2026-03-20
Entry Type: Auto

– Punch Tracker System
```

Face verification failure triggers:
```
Subject: Team Attendance Update

⚠️ Face Verification Failed

Team Member: Priya Patel
Status: Face did not match registered photo
Time: 2026-03-20T09:32:00.000Z
Action: Punch-in was blocked

– Punch Tracker Security Alert
```

---

## 10. Application Load Balancer

### Step 10.1 — Create Target Group
1. EC2 Console → **Target Groups → Create target group**
2. Target type: **Instances**
3. Name: `punch-photo-tg`
4. Protocol: **HTTP** | Port: `3001`
5. VPC: `punch-tracker-vpc`
6. Health check path: `/health`
7. Click **Next**
8. Select `punch-private-ec2`
9. Port: `3001`
10. Click **Include as pending → Register pending targets**

### Step 10.2 — Create Application Load Balancer
1. EC2 → **Load Balancers → Create load balancer**
2. Select **Application Load Balancer**
3. Name: `punch-photo-alb`
4. Scheme: **Internet-facing**
5. VPC: `punch-tracker-vpc`
6. Subnets: select both public subnets (2 AZs required)
7. Security group: `punch-alb-sg`
8. Listener: HTTP:80 → forward to `punch-photo-tg`
9. Click **Create load balancer**
10. Copy the **DNS name**

### Step 10.3 — Verify Target Health
1. EC2 → **Target Groups → punch-photo-tg**
2. Click **Targets tab**
3. Wait until status shows: **healthy**

### Step 10.4 — Test ALB
```bash
# From Bastion Host
curl http://<ALB-DNS-NAME>/health
# Expected: {"status":"ok"}
```

---

## 11. Private EC2 Photo API Deployment

### Step 11.1 — Create photo-api folder on Private EC2
```bash
# SSH into Private EC2 via Bastion
mkdir ~/photo-api
cd ~/photo-api
```

### Step 11.2 — Create server.js
```bash
nano server.js
# Paste complete photo-api/server.js content
# Ctrl+X → Y → Enter
```

### Step 11.3 — Create package.json
```bash
nano package.json
# Paste complete photo-api/package.json content
# Ctrl+X → Y → Enter
```

### Step 11.4 — Create .env
```bash
nano .env
```
Fill with your values:
```env
PORT=3001
AWS_REGION=us-east-2
S3_BUCKET_NAME=punchin-screenshots-bucket-141095608859
COUCHDB_URL=couchbases://cb.kz9usb38fboiiq1j.cloud.couchbase.com
CB_USERNAME=punchuser
CB_PASSWORD=your_password
COUCHDB_DB=punch-in-application-bucket
CB_SCOPE=_default
CB_COLLECTION=_default
```

### Step 11.5 — Install and start
```bash
# Install dependencies
npm install
npm install @aws-sdk/s3-request-presigner

# Start with PM2
pm2 start server.js --name photo-api
pm2 save
pm2 startup

# Verify
pm2 status
curl http://localhost:3001/health
```

Expected logs:
```
✅ Couchbase connected
🚀 Photo API running on port 3001
```

---

## 12. S3 Daily CSV Backup

### How it works
- Runs automatically every day at **midnight UTC** (5:30 AM IST)
- Fetches all records for that date from Couchbase
- Saves as CSV to S3: `attendance-records/2026-03-20.csv`

### CSV Format
```csv
Name,Action,Time,Date,Entry Type,Timestamp
Priya Patel,Punch In,09:32:00,2026-03-20,Auto,2026-03-20T09:32:00.000Z
```

### Manual trigger via API
```bash
curl -X POST https://secure-punch-in-tracker.onrender.com/api/backup \
  -H "Content-Type: application/json" \
  -d '{"date":"2026-03-20"}'
```

### Check status
```bash
curl https://secure-punch-in-tracker.onrender.com/api/backup/status
```

---

## 13. S3 Instant JSON Record Backup

### How it works
Every punch action (punch-in / break / punch-out) instantly saves a JSON file to S3:

**S3 path:** `records/2026-03-20/punch-in/priya-patel-1234567890.json`

**JSON content:**
```json
{
  "type": "punch_record",
  "name": "Priya Patel",
  "action": "punch-in",
  "time": "09:32:00",
  "date": "2026-03-20",
  "entryType": "auto",
  "timestamp": "2026-03-20T09:32:00.000Z",
  "createdAt": 1773814486555
}
```

Record deleted from Couchbase via delete button → **stays in S3 permanently**

---

## 14. Live Punch-In Photo Storage to S3

### How it works
```
User clicks Punch In
  → Webcam opens (getUserMedia API)
  → User takes photo
  → Photo converted to base64
  → React sends to /api/upload-photo (Render)
  → Render proxies to API Gateway (HTTPS)
  → API Gateway triggers Lambda
  → Lambda uploads JPEG to S3
  → Lambda generates pre-signed URL (7 days)
  → URL saved in Couchbase with punch record
  → Photo shown in records table + header
```

### Pre-signed URL
- Photos stored in private S3 bucket
- Accessible via pre-signed URLs (valid 7 days)
- URL format: `https://punchin-screenshots-bucket...amazonaws.com/punch-photos/xxx.jpg?X-Amz-Algorithm=AWS4...`

### Why proxy through Render backend
- React app runs on **HTTPS** (Render)
- Direct call to HTTP ALB blocked by browser (mixed content)
- Solution: React → Render backend (HTTPS) → API Gateway (HTTPS) → Lambda

---

## 15. AWS Lambda — Serverless Photo Upload

### Why Lambda instead of Private EC2
| Private EC2 | Lambda |
|-------------|--------|
| Always running — costs money | Pay per request |
| Needs SSH, PM2, updates | Zero management |
| Fixed capacity | Auto-scales |
| Server maintenance required | Fully managed by AWS |

### Step 15.1 — Create Lambda Function
1. AWS Console → **Lambda → Create function**
2. Select **Author from scratch**
3. Function name: `punch-photo-upload`
4. Runtime: **Node.js 20.x**
5. Architecture: `x86_64`
6. Permissions: **Create new role with basic Lambda permissions**
7. Click **Create function**

### Step 15.2 — Add S3 Permission to Lambda Role
1. Lambda → **Configuration → Permissions**
2. Click the **Role name** (opens IAM)
3. **Add permissions → Attach policies**
4. Search `AmazonS3FullAccess` → attach
5. Click **Add permissions**

### Step 15.3 — Add Environment Variables
1. Lambda → **Configuration → Environment variables → Edit**
2. Add all variables:

| Key | Value |
|-----|-------|
| `AWS_REGION_NAME` | `us-east-2` |
| `S3_BUCKET_NAME` | `punchin-screenshots-bucket-141095608859` |
| `COUCHDB_URL` | `couchbases://cb.kz9usb38fboiiq1j.cloud.couchbase.com` |
| `CB_USERNAME` | `punchuser` |
| `CB_PASSWORD` | your password |
| `COUCHDB_DB` | `punch-in-application-bucket` |

3. Click **Save**

### Step 15.4 — Upload Function Code
1. Click **Code tab**
2. Select all in editor → delete
3. Paste complete `lambda-index.mjs` content
4. Click **Deploy**

### Step 15.5 — Add Dependencies Layer
```bash
# On local machine or EC2
mkdir lambda-layer && cd lambda-layer
mkdir nodejs && cd nodejs
npm init -y
npm install couchbase uuid @aws-sdk/s3-request-presigner
cd ..
zip -r layer.zip nodejs/
```

1. Lambda → left sidebar → **Layers → Create layer**
2. Name: `punch-dependencies`
3. Upload `layer.zip`
4. Compatible runtime: `Node.js 20.x`
5. Click **Create**
6. Go back to function → **Layers → Add a layer**
7. Custom layers → `punch-dependencies`
8. Click **Add**

### Step 15.6 — Set Timeout and Memory
1. **Configuration → General configuration → Edit**
2. Timeout: **30 seconds**
3. Memory: **256 MB**
4. Click **Save**

### Step 15.7 — Create API Gateway
1. AWS Console → **API Gateway → Create API**
2. Select **REST API → Build**
3. API name: `punch-photo-api`
4. Endpoint type: **Regional**
5. Click **Create API**

**Create /upload-photo resource:**
1. Click **Create resource**
2. Resource name: `upload-photo`
3. Check **Enable API Gateway CORS**
4. Click **Create resource**
5. Select `/upload-photo` → **Create method**
6. Method type: **POST**
7. Integration type: **Lambda function**
8. Check **Lambda proxy integration** ✅
9. Lambda function: `punch-photo-upload`
10. Click **Create method**

**Create /health resource:**
1. Click **Create resource**
2. Resource name: `health`
3. Select `/health` → **Create method**
4. Method type: **GET**
5. Lambda proxy integration ✅
6. Lambda function: `punch-photo-upload`
7. Click **Create method**

**Deploy:**
1. Click **Deploy API**
2. New stage: `prod`
3. Click **Deploy**
4. Copy **Invoke URL**:
   `https://rzx0a7mf78.execute-api.us-east-2.amazonaws.com/prod`

### Step 15.8 — Test Lambda
```bash
# Health check
curl https://rzx0a7mf78.execute-api.us-east-2.amazonaws.com/prod/health
# Expected: {"status":"ok","timestamp":"...","service":"punch-photo-lambda"}

# Photo upload test
curl -X POST https://rzx0a7mf78.execute-api.us-east-2.amazonaws.com/prod/upload-photo \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","time":"10:00","date":"2026-03-20","entryType":"auto","photo":"data:image/jpeg;base64,/9j/4AAQ"}'
# Expected: {"success":true,"photoUrl":"https://...?X-Amz-Algorithm=..."}
```

### Step 15.9 — Update Render Environment Variable
Add `PHOTO_API_URL` on Render:
```
PHOTO_API_URL = https://rzx0a7mf78.execute-api.us-east-2.amazonaws.com/prod
```

---

## 16. AWS Rekognition — Face Verification

### Why Rekognition
- Verifies correct person is punching in
- Prevents proxy attendance
- Alerts team lead if face doesn't match
- Free tier: 5,000 comparisons/month free

### Cost for 6 members
```
6 members × 2 actions/day × 30 days = 360 comparisons/month
360 × $0.001 = $0.36/month (within free tier = FREE)
```

### Step 16.1 — Add IAM Permission
1. AWS Console → **IAM → Users → punch-tracker-bot**
2. **Add permissions → Attach policies directly**
3. Search `AmazonRekognitionFullAccess` → check it
4. Click **Next → Add permissions**

### Step 16.2 — Add Render Environment Variables
1. Render → **Environment → Edit**
2. Add:

| Key | Value |
|-----|-------|
| `REKOGNITION_COLLECTION` | `punch-tracker-faces` |
| `FACE_MATCH_THRESHOLD` | `80` |

3. Click **Save, rebuild and deploy**

### Step 16.3 — Collection Auto-Created
After Render deploys, check logs:
```
✅ Rekognition: Collection 'punch-tracker-faces' created
```

### Step 16.4 — Register Face (one time per member)
1. Open app → member card shows **!** (amber badge)
2. Click **Register** button on your name
3. Camera opens with face oval guide
4. Position face inside oval
5. Click capture button
6. Click **Confirm Registration**
7. Badge changes to **✓** (green)

### Step 16.5 — Face Verification on Punch In
1. Select name → click **Punch In**
2. Camera opens → take photo
3. Toast shows **"Verifying..."**
4. If match (>80%):
   - Toast: **"Identity Verified ✓ — 95% match"**
   - Punch-in proceeds normally
5. If no match (<80%):
   - Toast: **"Face Verification Failed"**
   - Punch-in blocked
   - SNS email alert sent to team lead

### Step 16.6 — Verify via API
```bash
# Check registration status
curl https://secure-punch-in-tracker.onrender.com/api/face-status/Priya%20Patel
# Expected: {"registered":true,"registeredAt":"..."}

# List all registered members
curl https://secure-punch-in-tracker.onrender.com/api/face-registrations
```

### Face Verification Thresholds
| Score | Result |
|-------|--------|
| > 80% | ✅ Verified — punch-in allowed |
| < 80% | ❌ Blocked + SNS alert sent |
| Not registered | ⚠️ Warning — punch-in allowed with caution |
| No face in photo | ❌ Error — retake photo |

---

## 17. Render.com Deployment

### Step 17.1 — Create Web Service
1. Go to **https://render.com → New → Web Service**
2. Connect GitHub repository
3. Configure:

| Setting | Value |
|---------|-------|
| Build Command | `npm run build` |
| Start Command | `npm start` |
| Node Version | 20 |
| Plan | Free |

### Step 17.2 — Set All Environment Variables
Add all variables from Section 18 below.

### Step 17.3 — Deploy
Click **Manual Deploy → Deploy latest commit**

### Step 17.4 — Verify deployment
Check Render logs for:
```
✅ Couchbase: Primary index ready
✅ Couchbase: Connected to bucket 'punch-in-application-bucket'
✅ Rekognition: Collection 'punch-tracker-faces' created/exists
⏰ Daily S3 backup scheduled
🚀 Server running on port 10000
```

---

## 18. Environment Variables Reference

### Render Dashboard — All Variables

| Variable | Value | Purpose |
|----------|-------|---------|
| `NODE_ENV` | `production` | Server mode |
| `COUCHDB_URL` | `couchbases://cb.kz9usb38fboiiq1j.cloud.couchbase.com` | Database connection |
| `CB_USERNAME` | `punchuser` | DB username |
| `CB_PASSWORD` | your password | DB password |
| `COUCHDB_DB` | `punch-in-application-bucket` | Bucket name |
| `CB_SCOPE` | `_default` | Scope |
| `CB_COLLECTION` | `_default` | Collection |
| `AWS_REGION` | `us-east-2` | AWS region |
| `AWS_ACCESS_KEY_ID` | your key | IAM access key |
| `AWS_SECRET_ACCESS_KEY` | your secret | IAM secret key |
| `SNS_TOPIC_ARN` | `arn:aws:sns:us-east-2:xxx:TeamAttendanceAlerts` | SNS topic |
| `S3_BUCKET_NAME` | `punch-records-backup-141095608859` | Backup bucket |
| `PHOTO_API_URL` | `https://rzx0a7mf78.execute-api.us-east-2.amazonaws.com/prod` | Lambda API Gateway |
| `REKOGNITION_COLLECTION` | `punch-tracker-faces` | Rekognition collection |
| `FACE_MATCH_THRESHOLD` | `80` | Face match % threshold |
| `TEAM_MEMBERS` | `Name1,Name2,Name3...` | Team member names |

### Lambda Environment Variables

| Variable | Value |
|----------|-------|
| `AWS_REGION_NAME` | `us-east-2` |
| `S3_BUCKET_NAME` | `punchin-screenshots-bucket-141095608859` |
| `COUCHDB_URL` | `couchbases://cb.kz9usb38fboiiq1j.cloud.couchbase.com` |
| `CB_USERNAME` | `punchuser` |
| `CB_PASSWORD` | your password |
| `COUCHDB_DB` | `punch-in-application-bucket` |

### Private EC2 .env (photo-api)

| Variable | Value |
|----------|-------|
| `PORT` | `3001` |
| `AWS_REGION` | `us-east-2` |
| `S3_BUCKET_NAME` | `punchin-screenshots-bucket-141095608859` |
| `COUCHDB_URL` | `couchbases://cb.kz9usb38fboiiq1j.cloud.couchbase.com` |
| `CB_USERNAME` | `punchuser` |
| `CB_PASSWORD` | your password |
| `COUCHDB_DB` | `punch-in-application-bucket` |

---

## 19. Final Architecture Summary

```
┌─────────────────────────────────────────────────────────────┐
│                    USER (Browser)                           │
│              https://secure-punch-in-tracker.onrender.com   │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTPS
┌───────────────────────────▼─────────────────────────────────┐
│                 RENDER.COM                                  │
│          React Frontend + Express Backend                   │
│                                                             │
│  ┌─────────────┐ ┌──────────────┐ ┌────────────────────┐  │
│  │  Couchbase  │ │   AWS SNS    │ │   AWS S3 Backup    │  │
│  │   Capella   │ │ Email alerts │ │ CSV + JSON records  │  │
│  └─────────────┘ └──────────────┘ └────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │           AWS Rekognition                            │  │
│  │  Register face + Verify face on every punch-in       │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  /api/upload-photo proxy                                    │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTPS
┌───────────────────────────▼─────────────────────────────────┐
│              AWS API GATEWAY                                │
│    https://rzx0a7mf78.execute-api.us-east-2.amazonaws.com   │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│              AWS LAMBDA                                     │
│           punch-photo-upload (Node.js 20)                   │
│                                                             │
│  Receives photo → Uploads to S3 → Pre-signed URL            │
│  Saves punch record + photoUrl to Couchbase                 │
└──────────────┬──────────────────────────────────────────────┘
               │
    ┌──────────▼──────────┐
    │    AWS S3 Bucket    │
    │  punchin-screenshots│
    │  punch-photos/*.jpg │
    └─────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│              AWS VPC (10.0.0.0/16)                          │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │  Public Subnet (10.0.1.0/24)                          │ │
│  │  ┌─────────────┐  ┌─────────┐  ┌──────────────────┐  │ │
│  │  │Bastion Host │  │   ALB   │  │   NAT Gateway    │  │ │
│  │  │  t2.micro   │  │HTTP:80  │  │  + Elastic IP    │  │ │
│  │  │  Public IP  │  │         │  │                  │  │ │
│  │  └─────────────┘  └────┬────┘  └──────────────────┘  │ │
│  └───────────────────────┼───────────────────────────────┘ │
│                           │                                 │
│  ┌────────────────────────▼──────────────────────────────┐ │
│  │  Private Subnet (10.0.2.0/24)                         │ │
│  │  ┌──────────────────────────────────────────────────┐ │ │
│  │  │  Private EC2 — punch-private-ec2                 │ │ │
│  │  │  No Public IP | Port 3001                        │ │ │
│  │  │  photo-api (Node.js + PM2)                       │ │ │
│  │  │  [Now replaced by Lambda — kept for reference]   │ │ │
│  │  └──────────────────────────────────────────────────┘ │ │
│  └───────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘

Internet Gateway ← → NAT Gateway ← → Private EC2 (outbound only)
```

### Complete Feature Summary

| Feature | AWS Service Used | Status |
|---------|-----------------|--------|
| Attendance records | Couchbase Capella | ✅ |
| Email notifications | AWS SNS | ✅ |
| Daily CSV backup | AWS S3 (backup bucket) | ✅ |
| Instant JSON backup | AWS S3 (backup bucket) | ✅ |
| Punch-in photo storage | AWS S3 (screenshots bucket) | ✅ |
| Secure photo access | S3 Pre-signed URLs | ✅ |
| Serverless photo upload | AWS Lambda + API Gateway | ✅ |
| Face verification | AWS Rekognition | ✅ |
| Face mismatch alert | AWS SNS | ✅ |
| Secure network | AWS VPC + Private Subnet | ✅ |
| SSH jump server | Bastion Host EC2 | ✅ |
| Outbound internet for private EC2 | NAT Gateway | ✅ |
| CI/CD deployment | GitHub + Render | ✅ |
