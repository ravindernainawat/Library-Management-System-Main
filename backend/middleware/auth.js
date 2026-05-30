const jwt = require("jsonwebtoken");

function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, message: "Unauthorized. No token provided." });
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // Contains { id, name, email, role }
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: "Unauthorized. Invalid token." });
  }
}

function verifyAdmin(req, res, next) {
  if (req.user && (req.user.role === "admin" || req.user.role === "owner")) {
    next();
  } else {
    return res.status(403).json({ success: false, message: "Forbidden. Admin access required." });
  }
}

function verifyOwner(req, res, next) {
  if (req.user && req.user.role === "owner") {
    next();
  } else {
    return res.status(403).json({ success: false, message: "Forbidden. Owner access required." });
  }
}

module.exports = { verifyToken, verifyAdmin, verifyOwner };
