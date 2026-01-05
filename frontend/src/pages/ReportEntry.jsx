import React, { useEffect, useState } from "react";
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
import api from "../api";

export default function ReportEntry() {
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

  /* ===================== SAVE ===================== */
  async function handleSave() {
    setMessage({ type: "", text: "" });

    if (!branchName || !atmId || !atmStatus) {
      setMessage({
        type: "error",
        text: "Branch Name, ATM ID and Status are required."
      });
      return;
    }

    if (atmStatus === "DOWN" && (!downtimeStart || !downtimeEnd)) {
      setMessage({
        type: "error",
        text: "Downtime Start and End are required when ATM is DOWN."
      });
      return;
    }

    try {
      setLoading(true);

      await api.post("/reports", {
        branch_name: branchName,
        atm_id: atmId,
        atm_status: atmStatus,

        downtime_start: atmStatus === "DOWN" ? downtimeStart : null,
        downtime_end: atmStatus === "DOWN" ? downtimeEnd : null,

        reason_for_downtime: atmStatus === "DOWN" ? reason : null,
        expected_restoration_time:
          atmStatus === "DOWN" && expectedRestorationTime
            ? expectedRestorationTime
            : null
      });

      setMessage({
        type: "success",
        text: "ATM report saved successfully."
      });

      /* reset for next window */
      setBranchName("");
      setAtmId("");
      setAtmStatus("UP");
    } catch (err) {
      setMessage({
        type: "error",
        text: err?.response?.data?.message || "Failed to save report"
      });
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
              <MenuItem value="UP">UP</MenuItem>
              <MenuItem value="DOWN">DOWN</MenuItem>
              <MenuItem value="PARKED">PARKED</MenuItem>
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
              label="Reason for Downtime"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={atmStatus !== "DOWN"}
            >
              <MenuItem value="Lost Communication">Lost Communication</MenuItem>
              <MenuItem value="Hardware Fault">Hardware Fault</MenuItem>
              <MenuItem value="Cash Out">Cash Out</MenuItem>
              <MenuItem value="Supervisor">Supervisor</MenuItem>
              <MenuItem value="Host Lost Communication">
                Host Lost Communication
              </MenuItem>
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
