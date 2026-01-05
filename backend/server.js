import "dotenv/config";
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import ExcelJS from "exceljs";
import { pool } from "./db.js";
import { authRequired } from "./auth.js";

console.log("🔥 server.js loaded (FINAL)");

const app = express();

/* ===================== MIDDLEWARE ===================== */
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

/* ===================== HELPERS ===================== */
function today() {
  return new Date().toISOString().slice(0, 10);
}
function calcDurationHrs(start, end) {
  if (!start || !end) return null;
  const ms = new Date(end) - new Date(start);
  return Math.round((ms / 36e5) * 100) / 100; // 2 decimals
}
function toMySQLDateTime(v) {
  if (!v) return null;
  return new Date(v).toISOString().slice(0, 19).replace("T", " ");
}

function calcDowntimeHours(start, end) {
  if (!start || !end) return null;
  const ms = new Date(end) - new Date(start);
  return Math.round((ms / 36e5) * 100) / 100;
}

function computeWindow() {
  const h = new Date().getHours();
  const start = h - (h % 2);
  const end = start + 2;
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(start)}:00-${pad(end)}:00`;
}

/* ===================== HEALTH ===================== */
app.get("/api/health", (req, res) => {
  res.json({ status: "OK" });
});

/* ===================== AUTH: LOGIN (REAL DB) ===================== */
app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username?.trim() || !password?.trim()) {
      return res.status(400).json({ message: "Username and password required" });
    }

    const [rows] = await pool.execute(
      "SELECT id, username, password_hash, role, is_active FROM users WHERE username=? LIMIT 1",
      [username.trim()]
    );

    const user = rows[0];
    if (!user || user.is_active !== 1) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "12h" }
    );

    res.json({ token });
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    res.status(500).json({ message: "Login failed" });
  }
});


app.post("/api/reports", authRequired, async (req, res) => {
  try {
    const b = req.body;

    const start = toMySQLDateTime(b.downtime_start);
    const end = toMySQLDateTime(b.downtime_end);

    const duration =
      b.atm_status === "DOWN"
        ? calcDowntimeHours(start, end)
        : null;

    await pool.execute(
      `INSERT INTO atm_reports (
        branch_name,
        atm_id,
        atm_status,
        downtime_start,
        downtime_end,
        downtime_duration_hours,
        reason_for_downtime,
        expected_restoration_time,
        report_date,
        reporting_window,
        created_by
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [
        b.branch_name,
        b.atm_id,
        b.atm_status,
        start,
        end,
        duration,
        b.reason_for_downtime || null,
        toMySQLDateTime(b.expected_restoration_time),
        today(),
        computeWindow(),
        req.user.id
      ]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error("SAVE ERROR FULL:", err.sqlMessage || err.message);
    res.status(500).json({
      message: err.sqlMessage || "Failed to save report"
    });
  }
});




/* ===================== REPORTS: READ ===================== */
app.get("/api/reports", authRequired, async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT
      branch_name,
      atm_id,
      atm_status,

      downtime_start,
      downtime_end,
      downtime_duration_hours,

      reason_for_downtime,
      expected_restoration_time,
      follow_up_status,
      performance_score,

      reporting_window
     FROM atm_reports
     ORDER BY report_date DESC, reporting_window DESC`
  );

  res.json(rows);
});




/* ===================== REPORTS: UPDATE ===================== */
app.put("/api/reports/:id", authRequired, async (req, res) => {
  try {
    const { id } = req.params;
    const b = req.body;

    await pool.execute(
      `UPDATE atm_reports SET
        branch_name=?,
        atm_id=?,
        atm_status=?,
        reason_for_downtime=?
       WHERE id=?`,
      [
        b.branch_name,
        b.atm_id,
        b.atm_status,
        b.reason_for_downtime || null,
        id
      ]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error("UPDATE ERROR:", err);
    res.status(500).json({ message: "Failed to update report" });
  }
});

/* ===================== REPORTS: DELETE ===================== */
app.delete("/api/reports/:id", authRequired, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.execute("DELETE FROM atm_reports WHERE id=?", [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE ERROR:", err);
    res.status(500).json({ message: "Failed to delete report" });
  }
});

/* ===================== EXPORT: CSV ===================== */
app.get("/api/reports/export/csv", authRequired, async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT
      branch_name,
      atm_id,
      atm_status,

      downtime_start,
      downtime_end,
      downtime_duration_hours,

      reason_for_downtime,
      expected_restoration_time,
      follow_up_status,
      performance_score

     FROM atm_reports
     ORDER BY report_date DESC, reporting_window DESC`
  );

  let csv =
    "Branch Name,ATM ID,ATM Status," +
    "Downtime Start,Downtime End,Downtime Duration (hrs)," +
    "Reason for Downtime,Expected Restoration Time,Follow-Up Status,Performance Score\n";

  rows.forEach(r => {
    csv += `"${r.branch_name}","${r.atm_id}","${r.atm_status}",` +
           `"${r.downtime_start || ""}","${r.downtime_end || ""}",` +
           `"${r.downtime_duration_hours || ""}",` +
           `"${r.reason_for_downtime || ""}","${r.expected_restoration_time || ""}",` +
           `"${r.follow_up_status || ""}","${r.performance_score || ""}"\n`;
  });

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=CBE_ATM_Report.csv");
  res.send(csv);
});




/* ===================== EXPORT: EXCEL ===================== */
app.get("/api/reports/export/xlsx", authRequired, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      "SELECT * FROM atm_reports ORDER BY created_at DESC"
    );

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("ATM Report");

    ws.columns = [
      { header: "Branch Name", key: "branch_name", width: 25 },
      { header: "ATM ID", key: "atm_id", width: 15 },
      { header: "ATM Status", key: "atm_status", width: 12 },
      { header: "Reason", key: "reason_for_downtime", width: 30 },
      { header: "Report Date", key: "report_date", width: 14 },
      { header: "Window", key: "reporting_window", width: 14 },
      { header: "Created At", key: "created_at", width: 20 }
    ];

    rows.forEach(r => ws.addRow(r));

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=CBE_ATM_Report.xlsx"
    );

    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("EXCEL EXPORT ERROR:", err);
    res.status(500).json({ message: "Excel export failed" });
  }
});

/* ===================== START ===================== */
const PORT = Number(process.env.PORT || 4000);

app.listen(PORT, "127.0.0.1", () => {
  console.log(`✅ Backend running on http://127.0.0.1:${PORT}`);
});
