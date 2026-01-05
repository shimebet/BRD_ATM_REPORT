import React, { useEffect, useState } from "react";
import {
  Container,
  Typography,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Paper,
  Button,
  Stack
} from "@mui/material";
import api from "../api";

export default function DailyReport() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  /* =====================================================
     LOAD REPORTS
  ===================================================== */
  useEffect(() => {
    loadReports();
  }, []);

  async function loadReports() {
    try {
      setLoading(true);
      const res = await api.get("/reports");
      setRows(res.data || []);
    } catch (err) {
      console.error("LOAD REPORTS ERROR:", err);
      alert("Failed to load reports");
    } finally {
      setLoading(false);
    }
  }

  /* =====================================================
     EXPORT CSV (JWT SAFE)
  ===================================================== */
  async function handleExportCSV() {
    try {
      setExporting(true);

      const response = await api.get("/reports/export/csv", {
        responseType: "blob"
      });

      const blob = new Blob([response.data], {
        type: "text/csv;charset=utf-8;"
      });

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = "CBE_ATM_Report.csv";
      document.body.appendChild(link);
      link.click();

      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("CSV EXPORT ERROR:", err);
      alert("Failed to download CSV");
    } finally {
      setExporting(false);
    }
  }

  /* =====================================================
     UI
  ===================================================== */
  return (
    <Container sx={{ mt: 4 }}>
      <Typography variant="h6" fontWeight={800} sx={{ mb: 2 }}>
        Daily ATM Report
      </Typography>

      {/* ACTION BUTTONS */}
      <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
        <Button
          variant="outlined"
          onClick={handleExportCSV}
          disabled={exporting}
        >
          {exporting ? "Exporting..." : "Export CSV"}
        </Button>

        <Button
          variant="contained"
          onClick={loadReports}
          disabled={loading}
        >
          Refresh
        </Button>
      </Stack>

      {/* REPORT TABLE */}
      <Paper>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell><b>Branch</b></TableCell>
              <TableCell><b>ATM ID</b></TableCell>
              <TableCell><b>Status</b></TableCell>
              <TableCell><b>Downtime Start</b></TableCell>
              <TableCell><b>Downtime End</b></TableCell>
              <TableCell><b>Duration (hrs)</b></TableCell>
              <TableCell><b>Reason</b></TableCell>
              <TableCell><b>Window</b></TableCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={8} align="center">
                  Loading...
                </TableCell>
              </TableRow>
            )}

            {!loading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} align="center">
                  No records found
                </TableCell>
              </TableRow>
            )}

            {!loading &&
              rows.map((row, i) => (
                <TableRow key={i}>
                  <TableCell>{row.branch_name}</TableCell>
                  <TableCell>{row.atm_id}</TableCell>
                  <TableCell>{row.atm_status}</TableCell>
                  <TableCell>{row.downtime_start}</TableCell>
                  <TableCell>{row.downtime_end}</TableCell>

                  {/* ✅ CORRECT COLUMN NAME */}
                  <TableCell>{row.downtime_duration_hours}</TableCell>

                  <TableCell>{row.reason_for_downtime}</TableCell>
                  <TableCell>{row.reporting_window}</TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </Paper>
    </Container>
  );
}
