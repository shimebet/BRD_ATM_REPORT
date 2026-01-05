import React, { useEffect, useState } from "react";
import {
  Container,
  Typography,
  Grid,
  Paper,
  Button,
  Stack
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import api from "../api";

function SummaryCard({ title, value }) {
  return (
    <Paper sx={{ p: 2, textAlign: "center" }}>
      <Typography>{title}</Typography>
      <Typography variant="h5" fontWeight={800}>
        {value}
      </Typography>
    </Paper>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState({ UP: 0, DOWN: 0, PARKED: 0 });

  useEffect(() => {
    api.get("/dashboard/summary").then((res) => {
      setSummary(res.data.counts || res.data);
    });
  }, []);

  return (
    <Container sx={{ mt: 4 }}>
      <Typography variant="h6" fontWeight={800} sx={{ mb: 3 }}>
        ATM Status Dashboard
      </Typography>

      {/* SUMMARY CARDS */}
      <Grid container spacing={2}>
        <Grid item xs={12} md={4}>
          <SummaryCard title="🟢 UP" value={summary.UP} />
        </Grid>
        <Grid item xs={12} md={4}>
          <SummaryCard title="🔴 DOWN" value={summary.DOWN} />
        </Grid>
        <Grid item xs={12} md={4}>
          <SummaryCard title="🟡 PARKED" value={summary.PARKED} />
        </Grid>
      </Grid>

      {/* ACTION BUTTONS */}
      <Stack direction="row" spacing={2} sx={{ mt: 4 }}>
        <Button
          variant="contained"
          onClick={() => navigate("/report-entry")}
        >
          + New Report
        </Button>

        <Button
          variant="outlined"
          onClick={() => navigate("/daily-report")}
        >
          Daily Report
        </Button>
      </Stack>
    </Container>
  );
}
