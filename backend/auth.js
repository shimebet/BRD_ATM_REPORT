import "dotenv/config";
import jwt from "jsonwebtoken";

export function authRequired(req, res, next) {
  const header = req.headers.authorization;

  if (!header) {
    return res.status(401).json({ message: "No token" });
  }

  const [type, token] = header.split(" ");
  if (type !== "Bearer" || !token) {
    return res.status(401).json({ message: "Invalid token format" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    return next();
  } catch (err) {
    console.error("JWT VERIFY ERROR:", err.message);
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}
