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

/* ===================== CONFIG ===================== */
const SLA_THRESHOLD_MINUTES = Number(process.env.SLA_THRESHOLD_MINUTES || 30);

/* ===================== MIDDLEWARE ===================== */
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

/* ===================== HELPERS ===================== */
function today() {
  return new Date().toISOString().slice(0, 10);
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

function minutesBetween(start, end) {
  if (!start) return null;
  const e = end ? new Date(end) : new Date(); // if no end, count until now
  return Math.round((e - new Date(start)) / 60000);
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

/* ===================== REPORTS: CREATE ===================== */
app.post("/api/reports", authRequired, async (req, res) => {
  try {
    const b = req.body;

    const start = toMySQLDateTime(b.downtime_start);
    const end = toMySQLDateTime(b.downtime_end);

    const duration = b.atm_status === "DOWN" ? calcDowntimeHours(start, end) : null;

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
    res.status(500).json({ message: err.sqlMessage || "Failed to save report" });
  }
});

/* ===================== REPORTS: READ ===================== */
app.get("/api/reports", authRequired, async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT
      id,
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

      report_date,
      reporting_window,
      created_at
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
      [b.branch_name, b.atm_id, b.atm_status, b.reason_for_downtime || null, id]
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

  rows.forEach((r) => {
    csv +=
      `"${r.branch_name}","${r.atm_id}","${r.atm_status}",` +
      `"${r.downtime_start || ""}","${r.downtime_end || ""}",` +
      `"${r.downtime_duration_hours || ""}",` +
      `"${r.reason_for_downtime || ""}","${r.expected_restoration_time || ""}",` +
      `"${r.follow_up_status || ""}","${r.performance_score || ""}"\n`;
  });

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=CBE_ATM_Report.csv");
  res.send(csv);
});

/* ===================== EXPORT: EXCEL (REPORTS) ===================== */
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

    rows.forEach((r) => ws.addRow(r));

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

/* ============================================================
   ✅ DASHBOARD ENDPOINTS (FOR YOUR NEW UI)
============================================================ */

/* ===================== DASHBOARD: SUMMARY ===================== */
app.get("/api/dashboard/summary", authRequired, async (req, res) => {
  try {
    // 1) ATM status counts (today)
    const [[atm]] = await pool.execute(`
      SELECT
        SUM(atm_status='UP') AS UP,
        SUM(atm_status='DOWN') AS DOWN,
        SUM(atm_status='PARKED') AS PARKED
      FROM atm_reports
      WHERE report_date = CURDATE()
    `);

    // 2) Fault counts (today DOWN grouped by reason)
    const [faultRows] = await pool.execute(`
      SELECT reason_for_downtime AS reason, COUNT(*) total
      FROM atm_reports
      WHERE atm_status='DOWN'
        AND report_date = CURDATE()
      GROUP BY reason_for_downtime
    `);

    // Map reasons to the dashboard keys
    const faults = {
      LOST_COMM: 0,
      CASH_OUT: 0,
      HARD_FAULT: 0,
      IN_REPLENISHMENT: 0,
      APP_OUT_OF_SERVICE: 0,
      SWITCH_LOST_COMM: 0
    };

    faultRows.forEach((r) => {
      const key = String(r.reason || "")
        .trim()
        .toUpperCase()
        .replace(/\s+/g, "_");

      if (faults[key] !== undefined) faults[key] = r.total;
    });

    // 3) SLA breaches (today DOWN records that exceed threshold)
    const [slaRows] = await pool.execute(`
      SELECT
        atm_id, branch_name, reason_for_downtime,
        downtime_start, downtime_end
      FROM atm_reports
      WHERE atm_status='DOWN'
        AND downtime_start IS NOT NULL
        AND report_date = CURDATE()
    `);

    const breaches = slaRows
      .map((r) => {
        const minutes = minutesBetween(r.downtime_start, r.downtime_end);
        if (!minutes || minutes <= SLA_THRESHOLD_MINUTES) return null;

        let severity = "LOW";
        if (minutes >= 120) severity = "HIGH";
        else if (minutes >= 60) severity = "MEDIUM";

        return {
          atmId: r.atm_id,
          branch: r.branch_name,
          issue: r.reason_for_downtime, // keep original text
          downMinutes: minutes,
          since: r.downtime_start,
          severity
        };
      })
      .filter(Boolean);

    // 4) Heat-map by branch (today)
    const [branchRows] = await pool.execute(`
      SELECT
        branch_name,
        SUM(atm_status='UP') AS up,
        SUM(atm_status='DOWN') AS down,
        SUM(atm_status='PARKED') AS parked,
        SUM(atm_status='DOWN') AS faults
      FROM atm_reports
      WHERE report_date = CURDATE()
      GROUP BY branch_name
    `);

    const branches = branchRows.map((b) => ({
      branch: b.branch_name,
      up: Number(b.up || 0),
      down: Number(b.down || 0),
      parked: Number(b.parked || 0),
      faults: Number(b.faults || 0),
      slaBreaches: breaches.filter((x) => x.branch === b.branch_name).length
    }));

    res.json({
      atmStatus: {
        UP: Number(atm?.UP || 0),
        DOWN: Number(atm?.DOWN || 0),
        PARKED: Number(atm?.PARKED || 0)
      },
      faults,
      sla: {
        thresholdMinutes: SLA_THRESHOLD_MINUTES,
        breaches
      },
      branches
    });
  } catch (err) {
    console.error("DASHBOARD ERROR:", err);
    res.status(500).json({ message: "Dashboard load failed" });
  }
});

/* ===================== DASHBOARD EXPORT: XLSX ===================== */
app.get("/api/dashboard/export/xlsx", authRequired, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT
        branch_name, atm_id, atm_status,
        downtime_start, downtime_end,
        downtime_duration_hours,
        reason_for_downtime,
        report_date, reporting_window
      FROM atm_reports
      ORDER BY report_date DESC, reporting_window DESC`
    );

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Dashboard Export");

    ws.columns = [
      { header: "Branch", key: "branch_name", width: 25 },
      { header: "ATM ID", key: "atm_id", width: 15 },
      { header: "Status", key: "atm_status", width: 12 },
      { header: "Downtime Start", key: "downtime_start", width: 20 },
      { header: "Downtime End", key: "downtime_end", width: 20 },
      { header: "Duration (hrs)", key: "downtime_duration_hours", width: 14 },
      { header: "Reason", key: "reason_for_downtime", width: 30 },
      { header: "Report Date", key: "report_date", width: 14 },
      { header: "Window", key: "reporting_window", width: 14 }
    ];

    rows.forEach((r) => ws.addRow(r));

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=ATM_Dashboard.xlsx"
    );

    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("DASHBOARD EXCEL EXPORT ERROR:", err);
    res.status(500).json({ message: "Dashboard Excel export failed" });
  }
});

/* ===================== START ===================== */
const PORT = Number(process.env.PORT || 4000);

app.listen(PORT, "127.0.0.1", () => {
  console.log(`✅ Backend running on http://127.0.0.1:${PORT}`);
});
