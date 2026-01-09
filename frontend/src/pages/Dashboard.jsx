import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Container,
  Typography,
  Grid,
  Paper,
  Button,
  Stack,
  Box,
  Divider,
  Alert,
  Chip,
  Tooltip as MuiTooltip
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import api from "../api";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer
} from "recharts";

import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/* =========================
   CONFIG
========================= */
const REFRESH_INTERVAL_MINUTES = 5;
const REFRESH_MS = REFRESH_INTERVAL_MINUTES * 60 * 1000;

const PIE_COLORS = ["#2e7d32", "#d32f2f", "#f9a825"];
const STATUS_COLORS = {
  UP: "#2e7d32",
  PARKED: "#f9a825"
};

const FAULT_COLORS = {
  LOST_COMM: "#d32f2f",
  CASH_OUT: "#f57c00",
  HARD_FAULT: "#6a1b9a",
  IN_REPLENISHMENT: "#0288d1",
  APP_OUT_OF_SERVICE: "#455a64",
  SWITCH_LOST_COMM: "#c2185b"
};

/* =========================
   UTILS
========================= */
const safeNum = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// const trendArrow = (current, previous) => {
//   if (previous === undefined || previous === null) return "→";
//   if (current > previous) return "↑";
//   if (current < previous) return "↓";
//   return "→";
// };

const titleFromKey = (k) =>
  String(k || "")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (m) => m.toUpperCase());

const formatDateTime = (iso) => {
  if (!iso) return "-";
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
};

/**
 * Heat score per branch:
 * - More SLA breaches and DOWN increases score heavily
 * - Faults also contribute
 */
const heatScore = (b) => {
  const down = safeNum(b.down);
  const breaches = safeNum(b.slaBreaches);
  const faults = safeNum(b.faults);
  return breaches * 5 + down * 3 + faults * 1;
};

const heatColor = (score) => {
  // Simple 5-level scale
  if (score >= 20) return "#b71c1c"; // very hot
  if (score >= 12) return "#d32f2f";
  if (score >= 6) return "#f57c00";
  if (score >= 2) return "#f9a825";
  return "#2e7d32"; // cool
};

/* =========================
   COMPONENTS
========================= */
function StatusCard({ title, value, trend, color, subtitle }) {
  return (
    <Paper
      sx={{
        p: 2,
        textAlign: "center",
        borderTop: `5px solid ${color}`,
        height: "100%"
      }}
    >
      <Typography fontSize={14}>{title}</Typography>
      <Typography variant="h5" fontWeight={800} sx={{ lineHeight: 1.2 }}>
        {value} <span style={{ fontSize: 18 }}>{trend}</span>
      </Typography>
      {subtitle ? (
        <Typography fontSize={12} sx={{ mt: 0.5, opacity: 0.8 }}>
          {subtitle}
        </Typography>
      ) : null}
    </Paper>
  );
}

function Section({ title, right }) {
  return (
    <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
      <Typography variant="h6" fontWeight={800}>
        {title}
      </Typography>
      {right || null}
    </Stack>
  );
}

/* =========================
   DASHBOARD
========================= */
export default function Dashboard() {
  const navigate = useNavigate();
  const prevData = useRef(null);

  const [faults, setFaults] = useState({
    LOST_COMM: 0,
    CASH_OUT: 0,
    HARD_FAULT: 0,
    IN_REPLENISHMENT: 0,
    APP_OUT_OF_SERVICE: 0,
    SWITCH_LOST_COMM: 0
  });

  const [atmStatus, setAtmStatus] = useState({ UP: 0, DOWN: 0, PARKED: 0 });
  const [branches, setBranches] = useState([]); // [{branch, up, down, parked, faults, slaBreaches}]
  const [sla, setSla] = useState({ thresholdMinutes: 30, breaches: [] });

  const [trends, setTrends] = useState({});
  const [lastUpdated, setLastUpdated] = useState(null);

  /* =========================
     LOAD DATA
  ========================= */
  const loadDashboard = async () => {
    const res = await api.get("/dashboard/summary");
    const data = res.data || {};

    const nextFaults = data.faults || {};
    const nextAtm = data.atmStatus || {};
    const nextBranches = Array.isArray(data.branches) ? data.branches : [];
    const nextSla = data.sla || { thresholdMinutes: 30, breaches: [] };

    if (prevData.current) {
      const prev = prevData.current;

      // trends for faults
      const nextTrends = {};
      Object.keys(nextFaults).forEach((k) => {
        nextTrends[k] = trendArrow(safeNum(nextFaults[k]), safeNum(prev.faults?.[k]));
      });

      // trends for atm status
      ["UP", "DOWN", "PARKED"].forEach((k) => {
        nextTrends[k] = trendArrow(safeNum(nextAtm[k]), safeNum(prev.atmStatus?.[k]));
      });

      setTrends(nextTrends);
    }

    setFaults({
      LOST_COMM: safeNum(nextFaults.LOST_COMM),
      CASH_OUT: safeNum(nextFaults.CASH_OUT),
      HARD_FAULT: safeNum(nextFaults.HARD_FAULT),
      IN_REPLENISHMENT: safeNum(nextFaults.IN_REPLENISHMENT),
      APP_OUT_OF_SERVICE: safeNum(nextFaults.APP_OUT_OF_SERVICE),
      SWITCH_LOST_COMM: safeNum(nextFaults.SWITCH_LOST_COMM)
    });

    setAtmStatus({
      UP: safeNum(nextAtm.UP),
      DOWN: safeNum(nextAtm.DOWN),
      PARKED: safeNum(nextAtm.PARKED)
    });

    setBranches(nextBranches.map((b) => ({
      branch: b.branch || b.name || "Unknown Branch",
      up: safeNum(b.up),
      down: safeNum(b.down),
      parked: safeNum(b.parked),
      faults: safeNum(b.faults),
      slaBreaches: safeNum(b.slaBreaches)
    })));

    setSla({
      thresholdMinutes: safeNum(nextSla.thresholdMinutes) || 30,
      breaches: Array.isArray(nextSla.breaches) ? nextSla.breaches : []
    });

    prevData.current = data;
    setLastUpdated(new Date());
  };

  /* =========================
     AUTO REFRESH
  ========================= */
  useEffect(() => {
    loadDashboard();
    const timer = setInterval(loadDashboard, REFRESH_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* =========================
     CHART DATA
  ========================= */
const pieData = useMemo(() => {
  const data = [];

  // 🟢 UP
  if (safeNum(atmStatus.UP) > 0) {
    data.push({
      name: "UP",
      value: safeNum(atmStatus.UP),
      color: STATUS_COLORS.UP
    });
  }

  // 🟡 PARKED
  if (safeNum(atmStatus.PARKED) > 0) {
    data.push({
      name: "PARKED",
      value: safeNum(atmStatus.PARKED),
      color: STATUS_COLORS.PARKED
    });
  }

  // 🔴 DOWN → split into faults
  if (faults) {
    Object.entries(faults).forEach(([fault, count]) => {
      const v = safeNum(count);
      if (v > 0) {
        data.push({
          name: fault.replace(/_/g, " "),
          value: v,
          color: FAULT_COLORS[fault] || "#9e9e9e"
        });
      }
    });
  }

  return data;
}, [atmStatus, faults]);


  const barData = useMemo(() => {
    const keys = Object.keys(faults || {});
    return keys.map((k) => ({
      name: titleFromKey(k),
      value: safeNum(faults[k])
    }));
  }, [faults]);

  /* =========================
     SLA SUMMARY
  ========================= */
  const slaCounts = useMemo(() => {
    const breaches = sla.breaches || [];
    const counts = { HIGH: 0, MEDIUM: 0, LOW: 0, UNKNOWN: 0 };
    breaches.forEach((b) => {
      const sev = (b.severity || "UNKNOWN").toUpperCase();
      if (counts[sev] === undefined) counts.UNKNOWN += 1;
      else counts[sev] += 1;
    });
    return counts;
  }, [sla]);

  const hasSlaBreaches = (sla.breaches || []).length > 0;

  /* =========================
     EXPORT: EXCEL
  ========================= */
  const exportExcel = () => {
    const wb = XLSX.utils.book_new();

    // Sheet 1: Summary
    const summaryRows = [
      ["Metric", "Value"],
      ["UP", safeNum(atmStatus.UP)],
      ["DOWN", safeNum(atmStatus.DOWN)],
      ["PARKED", safeNum(atmStatus.PARKED)],
      ["Last Updated", lastUpdated ? lastUpdated.toLocaleString() : "-"]
    ];
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
    XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

    // Sheet 2: Faults
    const faultRows = [
      ["Fault Type", "Count"],
      ...Object.keys(faults).map((k) => [titleFromKey(k), safeNum(faults[k])])
    ];
    const wsFaults = XLSX.utils.aoa_to_sheet(faultRows);
    XLSX.utils.book_append_sheet(wb, wsFaults, "Faults");

    // Sheet 3: SLA Breaches
    const breachRows = [
      ["ATM ID", "Branch", "Issue", "Down Minutes", "Since", "Severity"],
      ...(sla.breaches || []).map((b) => [
        b.atmId || "-",
        b.branch || "-",
        titleFromKey(b.issue || "-"),
        safeNum(b.downMinutes),
        formatDateTime(b.since),
        (b.severity || "UNKNOWN").toUpperCase()
      ])
    ];
    const wsBreaches = XLSX.utils.aoa_to_sheet(breachRows);
    XLSX.utils.book_append_sheet(wb, wsBreaches, "SLA Breaches");

    // Sheet 4: Branch Heatmap data
    const branchRows = [
      ["Branch", "UP", "DOWN", "PARKED", "Faults", "SLA Breaches", "Heat Score"],
      ...branches.map((b) => [
        b.branch,
        safeNum(b.up),
        safeNum(b.down),
        safeNum(b.parked),
        safeNum(b.faults),
        safeNum(b.slaBreaches),
        heatScore(b)
      ])
    ];
    const wsBranches = XLSX.utils.aoa_to_sheet(branchRows);
    XLSX.utils.book_append_sheet(wb, wsBranches, "Branches");

    const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([out], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });

    const name = `ATM_Dashboard_${new Date().toISOString().slice(0, 10)}.xlsx`;
    saveAs(blob, name);
  };

  /* =========================
     EXPORT: PDF
  ========================= */
  const exportPDF = () => {
    const doc = new jsPDF();
    const title = "ATM Status Dashboard Report";

    doc.setFontSize(14);
    doc.text(title, 14, 16);

    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 22);
    doc.text(
      `Refresh Interval: ${REFRESH_INTERVAL_MINUTES} minute(s)`,
      14,
      27
    );

    autoTable(doc, {
      startY: 32,
      head: [["Summary", "Value"]],
      body: [
        ["UP", String(safeNum(atmStatus.UP))],
        ["DOWN", String(safeNum(atmStatus.DOWN))],
        ["PARKED", String(safeNum(atmStatus.PARKED))],
        ["SLA Threshold (minutes)", String(safeNum(sla.thresholdMinutes) || 30)],
        ["SLA Breaches", String((sla.breaches || []).length)]
      ]
    });

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 6,
      head: [["Fault Type", "Count"]],
      body: Object.keys(faults).map((k) => [titleFromKey(k), String(safeNum(faults[k]))])
    });

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 6,
      head: [["Branch", "UP", "DOWN", "PARKED", "Faults", "SLA Breaches", "Heat"]],
      body: branches.map((b) => [
        b.branch,
        String(safeNum(b.up)),
        String(safeNum(b.down)),
        String(safeNum(b.parked)),
        String(safeNum(b.faults)),
        String(safeNum(b.slaBreaches)),
        String(heatScore(b))
      ])
    });

    if ((sla.breaches || []).length) {
      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 6,
        head: [["ATM ID", "Branch", "Issue", "Down(min)", "Since", "Severity"]],
        body: (sla.breaches || []).slice(0, 50).map((b) => [
          b.atmId || "-",
          b.branch || "-",
          titleFromKey(b.issue || "-"),
          String(safeNum(b.downMinutes)),
          formatDateTime(b.since),
          (b.severity || "UNKNOWN").toUpperCase()
        ])
      });
    }

    const name = `ATM_Dashboard_${new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(name);
  };

  return (
    <Container sx={{ mt: 4 }}>
      <Stack
        direction={{ xs: "column", md: "row" }}
        alignItems={{ xs: "flex-start", md: "center" }}
        justifyContent="space-between"
        spacing={1}
        sx={{ mb: 2 }}
      >
        <Typography variant="h6" fontWeight={900}>
          ATM Status Dashboard
        </Typography>

        <Stack direction="row" spacing={1} alignItems="center">
          <Chip
            size="small"
            label={
              lastUpdated ? `Updated: ${lastUpdated.toLocaleTimeString()}` : "Updating..."
            }
          />
          <Button size="small" variant="outlined" onClick={loadDashboard}>
            Refresh Now
          </Button>
          <Button size="small" variant="outlined" onClick={exportPDF}>
            Export PDF
          </Button>
          <Button size="small" variant="outlined" onClick={exportExcel}>
            Export Excel
          </Button>
        </Stack>
      </Stack>

      {/* =========================
         SLA BREACH ALERTS
      ========================= */}
      <Section
        title="SLA Breach Alerts"
        right={
          <Stack direction="row" spacing={1}>
            <Chip size="small" label={`Threshold: ${safeNum(sla.thresholdMinutes) || 30} min`} />
            <Chip size="small" label={`High: ${slaCounts.HIGH}`} />
            <Chip size="small" label={`Med: ${slaCounts.MEDIUM}`} />
            <Chip size="small" label={`Low: ${slaCounts.LOW}`} />
          </Stack>
        }
      />

      {hasSlaBreaches ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {sla.breaches.length} SLA breach(es) detected. Prioritize HIGH severity first.
        </Alert>
      ) : (
        <Alert severity="success" sx={{ mb: 2 }}>
          No SLA breaches currently.
        </Alert>
      )}

      {/* Quick list of top breaches */}
      {hasSlaBreaches ? (
        <Paper sx={{ p: 2, mb: 4 }}>
          <Typography fontWeight={800} sx={{ mb: 1 }}>
            Top Breaches (latest)
          </Typography>
          <Divider sx={{ mb: 2 }} />

          <Grid container spacing={2}>
            {(sla.breaches || []).slice(0, 6).map((b, idx) => (
              <Grid item xs={12} md={6} key={idx}>
                <Paper sx={{ p: 1.5, borderLeft: "6px solid #d32f2f" }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography fontWeight={800}>
                      {b.atmId || "ATM"} — {(b.severity || "UNKNOWN").toUpperCase()}
                    </Typography>
                    <Chip size="small" label={`${safeNum(b.downMinutes)} min`} />
                  </Stack>

                  <Typography fontSize={13} sx={{ mt: 0.5 }}>
                    Branch: {b.branch || "-"}
                  </Typography>
                  <Typography fontSize={13}>
                    Issue: {titleFromKey(b.issue || "-")}
                  </Typography>
                  <Typography fontSize={12} sx={{ opacity: 0.8 }}>
                    Since: {formatDateTime(b.since)}
                  </Typography>
                </Paper>
              </Grid>
            ))}
          </Grid>
        </Paper>
      ) : null}

      {/* =========================
         FAULT / ISSUE STATUS
      ========================= */}
      <Section title="ATM Fault & Issue Status" />
      <Grid container spacing={2}>
        {Object.entries(faults).map(([key, val]) => (
          <Grid item xs={12} md={4} key={key}>
            <StatusCard
              title={titleFromKey(key)}
              value={safeNum(val)}
              trend={trends[key]}
              color="#d32f2f"
              subtitle=""
            />
          </Grid>
        ))}
      </Grid>

      {/* =========================
         ATM STATUS SUMMARY
      ========================= */}
      <Box sx={{ mt: 5 }}>
        <Section title="ATM Status Summary" />
        <Grid container spacing={2}>
          <Grid item xs={12} md={4}>
            <StatusCard
              title="🟢 UP"
              value={safeNum(atmStatus.UP)}
              trend={trends.UP}
              color="#2e7d32"
            />
          </Grid>
          <Grid item xs={12} md={4}>
            <StatusCard
              title="🔴 DOWN"
              value={safeNum(atmStatus.DOWN)}
              trend={trends.DOWN}
              color="#d32f2f"
            />
          </Grid>
          <Grid item xs={12} md={4}>
            <StatusCard
              title="🟡 PARKED"
              value={safeNum(atmStatus.PARKED)}
              trend={trends.PARKED}
              color="#f9a825"
            />
          </Grid>
        </Grid>
      </Box>

      {/* =========================
         CHARTS
      ========================= */}
      <Box sx={{ mt: 6 }}>
        <Section title="Visual Analytics" />
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 2, height: 320 }}>
              <Typography fontWeight={800} sx={{ mb: 1 }}>
                ATM Status Distribution (Pie)
              </Typography>
              <ResponsiveContainer>
                <PieChart>
<Pie data={pieData} dataKey="value" nameKey="name" label>
  {pieData.map((entry, i) => (
    <Cell key={i} fill={entry.color} />
  ))}
</Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </Paper>
          </Grid>

          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 2, height: 320 }}>
              <Typography fontWeight={800} sx={{ mb: 1 }}>
                Fault Distribution (Bar)
              </Typography>
              <ResponsiveContainer>
                <BarChart data={barData}>
                  <XAxis dataKey="name" interval={0} angle={-15} height={60} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="value" fill="#1976d2" />
                </BarChart>
              </ResponsiveContainer>
            </Paper>
          </Grid>
        </Grid>
      </Box>

      {/* =========================
         HEAT-MAP BY BRANCH
      ========================= */}
      <Box sx={{ mt: 6 }}>
        <Section
          title="Heat-Map by Branch"
          right={<Chip size="small" label="Heat = SLA breaches + DOWN + faults" />}
        />

        {branches.length === 0 ? (
          <Alert severity="info">No branch data found. Add `branches[]` in the API response.</Alert>
        ) : (
          <Grid container spacing={2}>
            {branches
              .slice()
              .sort((a, b) => heatScore(b) - heatScore(a))
              .map((b) => {
                const score = heatScore(b);
                const bg = heatColor(score);
                return (
                  <Grid item xs={12} sm={6} md={4} lg={3} key={b.branch}>
                    <MuiTooltip
                      title={
                        <Box>
                          <div>UP: {b.up}</div>
                          <div>DOWN: {b.down}</div>
                          <div>PARKED: {b.parked}</div>
                          <div>Faults: {b.faults}</div>
                          <div>SLA Breaches: {b.slaBreaches}</div>
                          <div>Heat Score: {score}</div>
                        </Box>
                      }
                      arrow
                    >
                      <Paper
                        sx={{
                          p: 2,
                          color: "#fff",
                          background: bg,
                          cursor: "pointer"
                        }}
                        onClick={() => navigate(`/daily-report?branch=${encodeURIComponent(b.branch)}`)}
                      >
                        <Typography fontWeight={900} fontSize={14}>
                          {b.branch}
                        </Typography>
                        <Divider sx={{ my: 1, borderColor: "rgba(255,255,255,0.4)" }} />
                        <Stack direction="row" spacing={1} flexWrap="wrap">
                          <Chip size="small" sx={{ color: "#fff" }} label={`UP: ${b.up}`} />
                          <Chip size="small" sx={{ color: "#fff" }} label={`DOWN: ${b.down}`} />
                          <Chip size="small" sx={{ color: "#fff" }} label={`Faults: ${b.faults}`} />
                          <Chip size="small" sx={{ color: "#fff" }} label={`SLA: ${b.slaBreaches}`} />
                          <Chip size="small" sx={{ color: "#fff" }} label={`Heat: ${score}`} />
                        </Stack>
                      </Paper>
                    </MuiTooltip>
                  </Grid>
                );
              })}
          </Grid>
        )}
      </Box>

      {/* =========================
         ACTIONS
      ========================= */}
      <Stack direction="row" spacing={2} sx={{ mt: 5 }}>
        <Button variant="contained" onClick={() => navigate("/report-entry")}>
          + New Report
        </Button>
        <Button variant="outlined" onClick={() => navigate("/daily-report")}>
          Daily Report
        </Button>
      </Stack>

      <Typography fontSize={12} sx={{ mt: 2, opacity: 0.75 }}>
        Auto refresh every {REFRESH_INTERVAL_MINUTES} minute(s).
      </Typography>
    </Container>
  );
}
