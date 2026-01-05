import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import ReportEntry from "./pages/ReportEntry";
import DailyReport from "./pages/DailyReport";

/* =====================================================
   AUTH CHECK
===================================================== */
function isAuthenticated() {
  return Boolean(localStorage.getItem("cbe_token"));
}

/* =====================================================
   PROTECTED ROUTE WRAPPER
===================================================== */
function PrivateRoute({ children }) {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

/* =====================================================
   APP ROUTES
===================================================== */
export default function App() {
  return (
    <Routes>
      {/* DEFAULT */}
      <Route path="/" element={<Navigate to="/login" replace />} />

      {/* LOGIN */}
      <Route path="/login" element={<Login />} />

      {/* DASHBOARD */}
      <Route
        path="/dashboard"
        element={
          <PrivateRoute>
            <Dashboard />
          </PrivateRoute>
        }
      />

      {/* REPORT ENTRY */}
      <Route
        path="/report-entry"
        element={
          <PrivateRoute>
            <ReportEntry />
          </PrivateRoute>
        }
      />

      {/* DAILY REPORT */}
      <Route
        path="/daily-report"
        element={
          <PrivateRoute>
            <DailyReport />
          </PrivateRoute>
        }
      />

      {/* FALLBACK */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
