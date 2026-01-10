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
  Stack,
  Checkbox,
  TextField,
  Chip
} from "@mui/material";
import api from "../api";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/* =====================================================
   COMPONENT
===================================================== */
export default function DailyReport() {
  const [rows, setRows] = useState([]);
  const [selectedRows, setSelectedRows] = useState([]); // ARRAY (no collision)
  const [actions, setActions] = useState({});
  const [contacts, setContacts] = useState({});
  const [supervisor, setSupervisor] = useState("");
  const [supervisorComment, setSupervisorComment] = useState("");
  const [approved, setApproved] = useState(false);

  useEffect(() => {
    loadReports();
  }, []);

  async function loadReports() {
    const res = await api.get("/reports");
    setRows(res.data || []);
    setSelectedRows([]);
    setActions({});
    setContacts({});
    setApproved(false);
  }

  /* =====================================================
     SELECTION (SAFE – OBJECT BASED)
  ===================================================== */
  function toggleRow(row) {
    if (approved) return;

    setSelectedRows((prev) => {
      const exists = prev.includes(row);
      return exists
        ? prev.filter((r) => r !== row)
        : [...prev, row];
    });
  }

  function isSelected(row) {
    return selectedRows.includes(row);
  }

  /* =====================================================
     APPROVE SELECTED
  ===================================================== */
  function approveSelected() {
    if (!supervisor.trim()) {
      alert("Supervisor name is required");
      return;
    }
    if (!supervisorComment.trim()) {
      alert("Supervisor comment is required");
      return;
    }
    if (selectedRows.length === 0) {
      alert("Select at least one ATM incident");
      return;
    }

    setApproved(true);
    alert(`Approved ${selectedRows.length} incident(s)`);
  }

  /* =====================================================
     EXPORT ONE CONSOLIDATED PDF (ALL SELECTED)
  ===================================================== */
  function exportPDF() {
    if (!approved) {
      alert("Approve selected incidents first");
      return;
    }

    if (selectedRows.length === 0) {
      alert("No rows selected");
      return;
    }

    const doc = new jsPDF();
    const now = new Date().toLocaleString();

    // Header
    doc.setFontSize(14);
    doc.text("ATM DAILY INCIDENT REPORT", 14, 15);

    doc.setFontSize(10);
    doc.text(`Supervisor: ${supervisor}`, 14, 22);
    doc.text(`Date: ${now}`, 14, 27);
    doc.text(`Supervisor Comment: ${supervisorComment}`, 14, 32);

    autoTable(doc, {
      startY: 38,
      head: [[
        "S.N",
        "TID",
        "ATM Name",
        "Branch",
        "Contacted Person",
        "ATM Status",
        "Problem",
        "Action Taken"
      ]],
      body: selectedRows.map((r, i) => [
        i + 1,
        r.atm_id,
        r.atm_name || "-",
        r.branch_name,
        contacts[r.atm_id] || "-",
        r.atm_status,
        r.reason_for_downtime,
        actions[r.atm_id] || "-"
      ]),
      styles: { fontSize: 9 },
      theme: "grid"
    });

    doc.save("ATM_Daily_Incident_Report.pdf");
  }

  /* =====================================================
     UI
  ===================================================== */
  return (
    <Container sx={{ mt: 4 }}>
      <Typography variant="h6" fontWeight={800} sx={{ mb: 2 }}>
        Daily ATM Incident Report (Bank Standard)
      </Typography>

      {/* SUPERVISOR PANEL */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Stack spacing={2}>
          <TextField
            label="Supervisor Name"
            value={supervisor}
            onChange={(e) => setSupervisor(e.target.value)}
            disabled={approved}
          />

          <TextField
            label="Supervisor Comment"
            multiline
            minRows={2}
            value={supervisorComment}
            onChange={(e) => setSupervisorComment(e.target.value)}
            disabled={approved}
          />

          <Stack direction="row" spacing={2}>
            <Button
              variant="contained"
              onClick={approveSelected}
              disabled={approved}
            >
              Approve Selected
            </Button>

            <Button
              variant="outlined"
              onClick={exportPDF}
            >
              Export PDF
            </Button>

            {approved && (
              <Chip label="APPROVED" color="success" />
            )}
          </Stack>
        </Stack>
      </Paper>

      {/* INCIDENT TABLE */}
      <Paper>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell />
              <TableCell><b>S.N</b></TableCell>
              <TableCell><b>TID</b></TableCell>
              <TableCell><b>ATM Name</b></TableCell>
              <TableCell><b>Branch</b></TableCell>
              <TableCell><b>Contacted Person</b></TableCell>
              <TableCell><b>Status</b></TableCell>
              <TableCell><b>Problem</b></TableCell>
              <TableCell><b>Action Taken</b></TableCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={i}>
                <TableCell>
                  <Checkbox
                    checked={isSelected(r)}
                    onChange={() => toggleRow(r)}
                    disabled={approved}
                  />
                </TableCell>

                <TableCell>{i + 1}</TableCell>
                <TableCell>{r.atm_id}</TableCell>
                <TableCell>{r.atm_name || "-"}</TableCell>
                <TableCell>{r.branch_name}</TableCell>

                <TableCell>
                  <TextField
                    size="small"
                    placeholder="Name"
                    value={contacts[r.atm_id] || ""}
                    onChange={(e) =>
                      setContacts((p) => ({
                        ...p,
                        [r.atm_id]: e.target.value
                      }))
                    }
                    disabled={approved}
                  />
                </TableCell>

                <TableCell>{r.atm_status}</TableCell>
                <TableCell>{r.reason_for_downtime}</TableCell>

                <TableCell>
                  <TextField
                    size="small"
                    multiline
                    minRows={2}
                    placeholder="Describe action taken"
                    value={actions[r.atm_id] || ""}
                    onChange={(e) =>
                      setActions((p) => ({
                        ...p,
                        [r.atm_id]: e.target.value
                      }))
                    }
                    disabled={approved}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
    </Container>
  );
}
