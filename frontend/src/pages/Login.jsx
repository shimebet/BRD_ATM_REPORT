import React, { useState } from "react";
import {
  Container,
  Paper,
  Typography,
  TextField,
  Button,
  Stack,
  Alert
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import api from "../api";

export default function Login() {
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  /* =====================================================
     HANDLE LOGIN (REAL DB USERS)
  ===================================================== */
  async function handleLogin(e) {
    e.preventDefault();
    setError("");

    if (!username.trim() || !password.trim()) {
      setError("Username and password are required");
      return;
    }

    try {
      setLoading(true);

      const res = await api.post("/auth/login", {
        username: username.trim(),
        password: password.trim()
      });

      // ✅ Store JWT token (used by api.js interceptor)
      localStorage.setItem("cbe_token", res.data.token);

      // ✅ Redirect after successful login
      navigate("/dashboard", { replace: true });
    } catch (err) {
      console.error("LOGIN ERROR:", err);

      // Show backend message if available
      setError(
        err?.response?.data?.message ||
        "Invalid username or password"
      );
    } finally {
      setLoading(false);
    }
  }

  /* =====================================================
     UI
  ===================================================== */
  return (
    <Container maxWidth="sm" sx={{ mt: 12 }}>
      <Paper sx={{ p: 4 }}>
        <Typography variant="h6" fontWeight={800}>
          COMMERCIAL BANK OF ETHIOPIA
        </Typography>

        <Typography sx={{ mb: 2 }}>
          ATM Status & Performance System
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <form onSubmit={handleLogin} noValidate>
          <Stack spacing={2}>
            <TextField
              label="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              fullWidth
              required
            />

            <TextField
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              fullWidth
              required
            />

            <Button
              type="submit"
              variant="contained"
              size="large"
              disabled={loading}
            >
              {loading ? "Logging in..." : "Login"}
            </Button>
          </Stack>
        </form>
      </Paper>
    </Container>
  );
}
