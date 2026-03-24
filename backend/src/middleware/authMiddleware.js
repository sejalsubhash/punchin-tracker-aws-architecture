const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "punch-tracker-secret-key-change-in-production";

function verifyToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token      = authHeader && authHeader.split(" ")[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: "Access denied. No token provided." });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user      = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: "Invalid or expired token. Please login again." });
  }
}

function verifyAdmin(req, res, next) {
  verifyToken(req, res, () => {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Access denied. Admin only." });
    }
    next();
  });
}

module.exports = { verifyToken, verifyAdmin };