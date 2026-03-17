require("dotenv").config();
const express = require("express");
const cors = require("cors");
const couchbase = require("couchbase");
const { SNSClient, PublishCommand } = require("@aws-sdk/client-sns");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { v4: uuidv4 } = require("uuid");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 5000;

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: "15mb" }));

// ─── Couchbase Setup ───────────────────────────────────────────────────────────
const CB_URL        = process.env.COUCHDB_URL;
const CB_USER       = process.env.CB_USERNAME;
const CB_PASSWORD   = process.env.CB_PASSWORD;
const CB_BUCKET     = process.env.COUCHDB_DB     || "employee-punch-records";
const CB_SCOPE      = process.env.CB_SCOPE       || "_default";
const CB_COLLECTION = process.env.CB_COLLECTION  || "_default";

let cluster, bucket, scope, collection;

async function initCouchbase() {
  try {
    if (!CB_URL || !CB_USER || !CB_PASSWORD) {
      throw new Error(
        "Missing Couchbase credentials. Set COUCHDB_URL, CB_USERNAME, CB_PASSWORD env vars."
      );
    }

    cluster = await couchbase.connect(CB_URL, {
      username: CB_USER,
      password: CB_PASSWORD,
      timeouts: {
        connectTimeout: 10000,
        kvTimeout: 5000,
        queryTimeout: 10000,
      },
    });

    bucket     = cluster.bucket(CB_BUCKET);
    scope      = bucket.scope(CB_SCOPE);
    collection = scope.collection(CB_COLLECTION);

    // Create primary index for N1QL queries
    try {
      await cluster.query(
        `CREATE PRIMARY INDEX IF NOT EXISTS ON \`${CB_BUCKET}\`.\`${CB_SCOPE}\`.\`${CB_COLLECTION}\``
      );
      console.log("✅ Couchbase: Primary index ready");
    } catch (idxErr) {
      console.warn("⚠️  Index note:", idxErr.message);
    }

    console.log(`✅ Couchbase: Connected to bucket '${CB_BUCKET}'`);
  } catch (err) {
    console.error("❌ Couchbase init error:", err.message);
    process.exit(1);
  }
}

// ─── AWS SNS Setup ─────────────────────────────────────────────────────────────
const snsClient = new SNSClient({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

async function sendSNSNotification(message) {
  if (!process.env.SNS_TOPIC_ARN) {
    console.warn("⚠️  SNS_TOPIC_ARN not set. Skipping notification.");
    return;
  }
  try {
    const command = new PublishCommand({
      TopicArn: process.env.SNS_TOPIC_ARN,
      Subject:  "Team Attendance Update",
      Message:  message,
    });
    const result = await snsClient.send(command);
    console.log(`✅ SNS sent. MessageId: ${result.MessageId}`);
  } catch (err) {
    console.error("❌ SNS error:", err.message);
  }
}

// ─── AWS S3 Setup ──────────────────────────────────────────────────────────────
const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const S3_BUCKET = process.env.S3_BUCKET_NAME;

// Convert records array to CSV string
function recordsToCSV(records) {
  if (!records || records.length === 0) {
    return "Name,Action,Time,Date,Entry Type,Timestamp\n";
  }

  const headers = ["Name", "Action", "Time", "Date", "Entry Type", "Timestamp"];

  const actionLabels = {
    "punch-in":  "Punch In",
    "break":     "Break",
    "punch-out": "Punch Out",
  };

  const rows = records.map((r) => [
    `"${(r.name      || "").replace(/"/g, '""')}"`,
    `"${actionLabels[r.action] || r.action || ""}"`,
    `"${r.time       || ""}"`,
    `"${r.date       || ""}"`,
    `"${r.entryType  === "manual" ? "Manual" : "Auto"}"`,
    `"${r.timestamp  || ""}"`,
  ]);

  return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
}

// Upload daily CSV to S3
async function uploadDailyBackupToS3(dateStr) {
  if (!S3_BUCKET) {
    console.warn("⚠️  S3_BUCKET_NAME not set. Skipping S3 backup.");
    return;
  }

  try {
    // Fetch all records for the given date from Couchbase
    const query = `
      SELECT META().id AS id, doc.*
      FROM \`${CB_BUCKET}\`.\`${CB_SCOPE}\`.\`${CB_COLLECTION}\` AS doc
      WHERE doc.type = 'punch_record'
        AND doc.date = $1
      ORDER BY doc.createdAt ASC
    `;
    const result  = await cluster.query(query, { parameters: [dateStr] });
    const records = result.rows;

    const csvContent = recordsToCSV(records);
    const s3Key      = `attendance-records/${dateStr}.csv`;

    const command = new PutObjectCommand({
      Bucket:      S3_BUCKET,
      Key:         s3Key,
      Body:        csvContent,
      ContentType: "text/csv",
      Metadata: {
        "backup-date":    dateStr,
        "total-records":  String(records.length),
        "generated-at":   new Date().toISOString(),
      },
    });

    await s3Client.send(command);
    console.log(
      `✅ S3 backup uploaded: s3://${S3_BUCKET}/${s3Key} (${records.length} records)`
    );
    return { success: true, key: s3Key, recordCount: records.length };
  } catch (err) {
    console.error("❌ S3 upload error:", err.message);
    throw err;
  }
}

// ─── Daily Scheduler ───────────────────────────────────────────────────────────
// Runs once every 24 hours at midnight UTC
function scheduleDailyBackup() {
  const now       = new Date();
  const midnight  = new Date(now);
  midnight.setUTCHours(24, 0, 0, 0); // next midnight UTC

  const msUntilMidnight = midnight.getTime() - now.getTime();

  console.log(
    `⏰ Daily S3 backup scheduled — next run in ${Math.round(msUntilMidnight / 1000 / 60)} minutes`
  );

  setTimeout(async () => {
    // Run today's backup
    const today = new Date();
    today.setUTCDate(today.getUTCDate() - 0); // today
    const pad     = (n) => String(n).padStart(2, "0");
    const dateStr = `${today.getUTCFullYear()}-${pad(today.getUTCMonth() + 1)}-${pad(today.getUTCDate())}`;

    console.log(`🗄️  Running daily S3 backup for ${dateStr}...`);
    try {
      await uploadDailyBackupToS3(dateStr);
    } catch (err) {
      console.error("❌ Scheduled backup failed:", err.message);
    }

    // Schedule next run (every 24 hours)
    setInterval(async () => {
      const d       = new Date();
      const pad2    = (n) => String(n).padStart(2, "0");
      const ds      = `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
      console.log(`🗄️  Running daily S3 backup for ${ds}...`);
      try {
        await uploadDailyBackupToS3(ds);
      } catch (err) {
        console.error("❌ Scheduled backup failed:", err.message);
      }
    }, 24 * 60 * 60 * 1000);
  }, msUntilMidnight);
}

// ─── Team Members ──────────────────────────────────────────────────────────────
const TEAM_MEMBERS = (process.env.TEAM_MEMBERS || "")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

const DEFAULT_MEMBERS = [
  "Sejal Subhash",
  "Rahul Sharma",
  "Priya Patel",
  "Amit Kumar",
  "Neha Joshi",
  "Vikram Singh",
];

// ─── API Routes ────────────────────────────────────────────────────────────────

// GET /api/health
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// GET /api/members
app.get("/api/members", (req, res) => {
  const members = TEAM_MEMBERS.length > 0 ? TEAM_MEMBERS : DEFAULT_MEMBERS;
  res.json({ members });
});

// POST /api/punch
app.post("/api/punch", async (req, res) => {
  const { name, action, time, date, entryType } = req.body;

  if (!name || !action || !time || !date) {
    return res.status(400).json({
      error: "Missing required fields: name, action, time, date",
    });
  }

  const validActions = ["punch-in", "break", "punch-out"];
  if (!validActions.includes(action)) {
    return res.status(400).json({ error: "Invalid action" });
  }

  const docId = `punch::${uuidv4()}`;
  const record = {
    type:      "punch_record",
    name,
    action,
    time,
    date,
    entryType: entryType || "auto",
    timestamp: new Date().toISOString(),
    createdAt: Date.now(),
  };

  try {
    await collection.insert(docId, record);
    record.id = docId;

    const actionLabels = {
      "punch-in":  "Punched In",
      "break":     "Gone on Break",
      "punch-out": "Punched Out",
    };
    const label  = actionLabels[action] || action;
    const snsMsg =
      `📋 Attendance Update\n\n` +
      `Team Member: ${name}\n` +
      `Action: ${label}\n` +
      `Time: ${time}\n` +
      `Date: ${date}\n` +
      `Entry Type: ${entryType === "manual" ? "Manual" : "Auto"}\n\n` +
      `– Punch Tracker System`;

    await sendSNSNotification(snsMsg);
    res.status(201).json({ success: true, record });
  } catch (err) {
    console.error("❌ Couchbase insert error:", err);
    res.status(500).json({ error: "Failed to save record", details: err.message });
  }
});

// GET /api/records
app.get("/api/records", async (req, res) => {
  try {
    const query = `
      SELECT META().id AS id, doc.*
      FROM \`${CB_BUCKET}\`.\`${CB_SCOPE}\`.\`${CB_COLLECTION}\` AS doc
      WHERE doc.type = 'punch_record'
      ORDER BY doc.createdAt DESC
    `;
    const result  = await cluster.query(query);
    const records = result.rows;
    res.json({ records });
  } catch (err) {
    console.error("❌ Couchbase fetch error:", err);
    res.status(500).json({ error: "Failed to fetch records", details: err.message });
  }
});

// GET /api/records/:name
app.get("/api/records/:name", async (req, res) => {
  try {
    const query = `
      SELECT META().id AS id, doc.*
      FROM \`${CB_BUCKET}\`.\`${CB_SCOPE}\`.\`${CB_COLLECTION}\` AS doc
      WHERE doc.type = 'punch_record'
        AND LOWER(doc.name) = LOWER($1)
      ORDER BY doc.createdAt DESC
    `;
    const result  = await cluster.query(query, { parameters: [req.params.name] });
    const records = result.rows;
    res.json({ records });
  } catch (err) {
    console.error("❌ Couchbase fetch error:", err);
    res.status(500).json({ error: "Failed to fetch records", details: err.message });
  }
});

// DELETE /api/records/:id
app.delete("/api/records/:id", async (req, res) => {
  try {
    await collection.remove(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error("❌ Couchbase delete error:", err);
    res.status(500).json({ error: "Failed to delete record" });
  }
});

// POST /api/backup — manually trigger S3 backup for a specific date
app.post("/api/backup", async (req, res) => {
  const { date } = req.body;
  const pad      = (n) => String(n).padStart(2, "0");
  const today    = new Date();
  const dateStr  = date ||
    `${today.getUTCFullYear()}-${pad(today.getUTCMonth() + 1)}-${pad(today.getUTCDate())}`;

  try {
    const result = await uploadDailyBackupToS3(dateStr);
    res.json({
      success:     true,
      message:     `Backup uploaded to S3 for ${dateStr}`,
      key:         result.key,
      recordCount: result.recordCount,
    });
  } catch (err) {
    res.status(500).json({ error: "Backup failed", details: err.message });
  }
});

// GET /api/backup/status — check S3 config status
app.get("/api/backup/status", (req, res) => {
  res.json({
    s3Configured: !!S3_BUCKET,
    s3Bucket:     S3_BUCKET || "not configured",
    schedule:     "Daily at midnight UTC",
  });
});

// ─── POST /api/upload-photo — proxy to Private EC2 via ALB ───────────────────
// React calls this HTTPS Render endpoint → Render forwards to HTTP ALB
// This solves the mixed content (HTTPS→HTTP) browser blocking issue
app.post("/api/upload-photo", async (req, res) => {
  const PHOTO_API = process.env.PHOTO_API_URL;

  if (!PHOTO_API) {
    return res.status(503).json({ error: "PHOTO_API_URL not configured" });
  }

  try {
    // Increase limit for base64 image payload
    const payload = JSON.stringify(req.body);

    const albUrl  = new URL(`${PHOTO_API}/upload-photo`);
    const options = {
      hostname: albUrl.hostname,
      port:     albUrl.port || 80,
      path:     albUrl.pathname,
      method:   "POST",
      headers: {
        "Content-Type":   "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
    };

    const protocol = albUrl.protocol === "https:" ? https : http;

    const proxyReq = protocol.request(options, (proxyRes) => {
      let data = "";
      proxyRes.on("data", (chunk) => { data += chunk; });
      proxyRes.on("end", () => {
        res.status(proxyRes.statusCode).json(JSON.parse(data));
      });
    });

    proxyReq.on("error", (err) => {
      console.error("❌ Proxy error:", err.message);
      res.status(502).json({ error: "Failed to reach photo API", details: err.message });
    });

    proxyReq.write(payload);
    proxyReq.end();
  } catch (err) {
    console.error("❌ Upload proxy error:", err.message);
    res.status(500).json({ error: "Proxy failed", details: err.message });
  }
});

// ─── Serve React Build in Production ──────────────────────────────────────────
if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "../../frontend/build")));
  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "../../frontend/build", "index.html"));
  });
}

// ─── Start Server ──────────────────────────────────────────────────────────────
initCouchbase().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`);
  });

  // Start daily S3 backup scheduler
  if (S3_BUCKET) {
    scheduleDailyBackup();
  } else {
    console.warn("⚠️  S3_BUCKET_NAME not set — daily backup scheduler disabled");
  }
});