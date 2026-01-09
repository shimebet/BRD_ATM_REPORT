import React, { useEffect, useMemo, useState } from "react";
import {
  Container,
  Typography,
  Grid,
  TextField,
  MenuItem,
  Button,
  Paper,
  Alert
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import api from "../api";

/* ===================== CONFIG ===================== */
const SLA_THRESHOLD_MINUTES = 30;

const ATM_STATUSES = ["UP", "DOWN", "PARKED"];

const DOWNTIME_REASONS = [
  { value: "LOST_COMM", label: "Lost Communication" },
  { value: "CASH_OUT", label: "Cash Out" },
  { value: "HARD_FAULT", label: "Hardware / Hard Fault" },
  { value: "IN_REPLENISHMENT", label: "In Replenishment" },
  { value: "APP_OUT_OF_SERVICE", label: "Application Out of Service" },
  { value: "SWITCH_LOST_COMM", label: "Switch / Host Lost Communication" }
];

/* ===================== COMPONENT ===================== */
export default function ReportEntry() {
  const navigate = useNavigate();

  /* ===================== FORM STATE ===================== */
  const [branchName, setBranchName] = useState("");
  const [atmId, setAtmId] = useState("");
  const [atmStatus, setAtmStatus] = useState("UP");

  const [downtimeStart, setDowntimeStart] = useState("");
  const [downtimeEnd, setDowntimeEnd] = useState("");
  const [reason, setReason] = useState("");
  const [expectedRestorationTime, setExpectedRestorationTime] = useState("");

  /* ===================== UI STATE ===================== */
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });

  /* ===================== RESET WHEN NOT DOWN ===================== */
  useEffect(() => {
    if (atmStatus !== "DOWN") {
      setDowntimeStart("");
      setDowntimeEnd("");
      setReason("");
      setExpectedRestorationTime("");
    }
  }, [atmStatus]);

  /* ===================== SLA CALC ===================== */
  const slaMinutes = useMemo(() => {
    if (!downtimeStart || !downtimeEnd) return null;
    const ms = new Date(downtimeEnd) - new Date(downtimeStart);
    return Math.round(ms / 60000);
  }, [downtimeStart, downtimeEnd]);

  const slaExceeded =
    atmStatus === "DOWN" &&
    slaMinutes !== null &&
    slaMinutes > SLA_THRESHOLD_MINUTES;

  /* ===================== VALIDATION ===================== */
  function validate() {
    if (!branchName.trim() || !atmId.trim()) {
      return "Branch Name and ATM ID are required.";
    }

    if (atmStatus === "DOWN") {
      if (!downtimeStart || !downtimeEnd) {
        return "Downtime Start and End are required.";
      }

      if (new Date(downtimeEnd) <= new Date(downtimeStart)) {
        return "Downtime End must be after Downtime Start.";
      }
    }

    return null;
  }

  /* ===================== SAVE ===================== */
  async function handleSave() {
    setMessage({ type: "", text: "" });

    const error = validate();
    if (error) {
      setMessage({ type: "error", text: error });
      return;
    }

    try {
      setLoading(true);

      await api.post("/reports", {
        branch_name: branchName.trim(),
        atm_id: atmId.trim(),
        atm_status: atmStatus,

        downtime_start: atmStatus === "DOWN" ? downtimeStart : null,
        downtime_end: atmStatus === "DOWN" ? downtimeEnd : null,

        // 🧠 allow backend to auto-derive if empty
        reason_for_downtime:
          atmStatus === "DOWN" && reason ? reason : null,

        expected_restoration_time:
          atmStatus === "DOWN" && expectedRestorationTime
            ? expectedRestorationTime
            : null
      });

      setMessage({
        type: "success",
        text: "ATM report saved successfully. Redirecting to dashboard..."
      });

      // ⏳ short delay for UX → dashboard
      setTimeout(() => {
        navigate("/dashboard");
      }, 1200);
    } catch (err) {
      if (err?.response?.status === 409) {
        setMessage({
          type: "warning",
          text: err.response.data.message
        });
      } else {
        setMessage({
          type: "error",
          text:
            err?.response?.data?.message ||
            "Failed to save report."
        });
      }
    } finally {
      setLoading(false);
    }
  }

  /* ===================== UI ===================== */
  return (
    <Container sx={{ mt: 4 }}>
      <Typography variant="h6" fontWeight={800} sx={{ mb: 2 }}>
        ATM Status Entry
      </Typography>

      <Paper sx={{ p: 3 }}>
        {message.text && (
          <Alert severity={message.type} sx={{ mb: 2 }}>
            {message.text}
          </Alert>
        )}

        {/* ⚠ SLA WARNING */}
        {slaExceeded && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            SLA threshold exceeded ({slaMinutes} minutes).
            This report will be marked as an SLA breach.
          </Alert>
        )}

        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Branch Name"
              value={branchName}
              onChange={(e) => setBranchName(e.target.value)}
            />
          </Grid>

          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="ATM ID"
              value={atmId}
              onChange={(e) => setAtmId(e.target.value)}
            />
          </Grid>

          <Grid item xs={12} md={6}>
            <TextField
              select
              fullWidth
              label="ATM Status"
              value={atmStatus}
              onChange={(e) => setAtmStatus(e.target.value)}
            >
              {ATM_STATUSES.map((s) => (
                <MenuItem key={s} value={s}>
                  {s}
                </MenuItem>
              ))}
            </TextField>
          </Grid>

          <Grid item xs={12} md={6}>
            <TextField
              type="datetime-local"
              label="Downtime Start"
              value={downtimeStart}
              onChange={(e) => setDowntimeStart(e.target.value)}
              disabled={atmStatus !== "DOWN"}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
          </Grid>

          <Grid item xs={12} md={6}>
            <TextField
              type="datetime-local"
              label="Downtime End"
              value={downtimeEnd}
              onChange={(e) => setDowntimeEnd(e.target.value)}
              disabled={atmStatus !== "DOWN"}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
          </Grid>

          <Grid item xs={12} md={6}>
            <TextField
              select
              fullWidth
              label="Reason for Downtime (optional)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={atmStatus !== "DOWN"}
              helperText="If left empty, system may auto-detect from monitoring feed"
            >
              <MenuItem value="">
                <em>Auto-detect</em>
              </MenuItem>
              {DOWNTIME_REASONS.map((r) => (
                <MenuItem key={r.value} value={r.value}>
                  {r.label}
                </MenuItem>
              ))}
            </TextField>
          </Grid>

          <Grid item xs={12} md={6}>
            <TextField
              type="datetime-local"
              label="Expected Restoration Time"
              value={expectedRestorationTime}
              onChange={(e) => setExpectedRestorationTime(e.target.value)}
              disabled={atmStatus !== "DOWN"}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
          </Grid>

          <Grid item xs={12}>
            <Button
              variant="contained"
              size="large"
              onClick={handleSave}
              disabled={loading}
            >
              {loading ? "Saving..." : "Save Report"}
            </Button>
          </Grid>
        </Grid>
      </Paper>
    </Container>
  );
}
