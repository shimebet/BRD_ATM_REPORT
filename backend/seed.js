import "dotenv/config";
import bcrypt from "bcryptjs";
import { pool } from "./db.js";

const username = "admin";
const password = "admin123";
const role = "ADMIN";

const hash = await bcrypt.hash(password, 10);

// If username is UNIQUE, this will upsert
await pool.execute(
  `INSERT INTO users (username, password_hash, role, is_active)
   VALUES (?,?,?,1)
   ON DUPLICATE KEY UPDATE
     password_hash=VALUES(password_hash),
     role=VALUES(role),
     is_active=1`,
  [username, hash, role]
);

console.log(`✅ Seeded user: ${username} / ${password}`);
process.exit(0);
