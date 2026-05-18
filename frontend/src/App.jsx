import { useState } from "react";
import { CognitoIdentityProviderClient, InitiateAuthCommand } from "@aws-sdk/client-cognito-identity-provider";
import "./index.css";

const API_ENDPOINT = import.meta.env.VITE_API_ENDPOINT;
const COGNITO_CLIENT_ID = import.meta.env.VITE_COGNITO_CLIENT_ID;
const COGNITO_USER_POOL_ID = import.meta.env.VITE_COGNITO_USER_POOL_ID;

if (!COGNITO_CLIENT_ID) {
  throw new Error("VITE_COGNITO_CLIENT_ID is not configured in .env file");
}
if (!API_ENDPOINT) {
  throw new Error("VITE_API_ENDPOINT is not configured in .env file");
}
if (!COGNITO_USER_POOL_ID) {
  throw new Error("VITE_COGNITO_USER_POOL_ID is not configured in .env file");
}

const cognito = new CognitoIdentityProviderClient({ region: "us-east-1" });

function LoginForm({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const command = new InitiateAuthCommand({
        AuthFlow: "USER_PASSWORD_AUTH",
        ClientId: COGNITO_CLIENT_ID,
        AuthParameters: {
          USERNAME: username,
          PASSWORD: password,
        },
      });

      const response = await cognito.send(command);
      const token = response.AuthenticationResult?.IdToken;

      if (token) {
        localStorage.setItem("authToken", token);
        localStorage.setItem("username", username);
        onLogin();
      } else {
        setError("No token received from server");
        setLoading(false);
      }
    } catch (err) {
      console.error("[LOGIN ERROR]", err);
      setError(err.message || "Login failed");
      setLoading(false);
    }
  };

  return (
    <div style={styles.loginContainer}>
      <div style={styles.loginCard}>
        <h1 style={styles.loginTitle}>🔐 Login</h1>
        <form onSubmit={handleLogin}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={styles.input}
              disabled={loading}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={styles.input}
              disabled={loading}
            />
          </div>

          {error && <div style={styles.error}>{error}</div>}

          <button type="submit" style={styles.loginBtn} disabled={loading}>
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>
      </div>
    </div>
  );
}

function ControlPanel({ username, onLogout }) {
  const [status, setStatus] = useState(() => {
    return localStorage.getItem("streamStatus") || "stopped";
  });
  const [toast, setToast] = useState(null);

  // Save status to localStorage whenever it changes
  const updateStatus = (newStatus) => {
    setStatus(newStatus);
    localStorage.setItem("streamStatus", newStatus);
  };

  const showToast = (message, isError = false) => {
    setToast({ message, isError });
    setTimeout(() => {
      setToast(null);
    }, 3000);
  };

  const callAPI = async (endpoint, body = {}) => {
    try {
      const url = `${API_ENDPOINT}${endpoint}`;
      console.log(`[API] Calling ${url}`, body);

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      console.log(`[API] Response status: ${res.status}, ok: ${res.ok}`);
      const data = await res.json();
      console.log(`[API] Response data:`, data);

      if (!res.ok) {
        console.error(`[API] Error: ${res.status}`, data);
        return { error: data };
      }

      console.log(`[API] Success:`, data);
      return data;
    } catch (err) {
      console.error("[API] Error:", err);
      return { error: err.message };
    }
  };

  const startStream = async () => {
    updateStatus("running");
    showToast("Starting stream...", false);
    const response = await callAPI("/generate", { action: "start", rate: 120000, disableTemporal: true });

    if (response.error && !response.status) {
      showToast(`Error: ${response.error}`, true);
      updateStatus("stopped");
    } else {
      showToast(" ", false);
    }
  };

  const stopStream = async () => {
    showToast("Stopping stream...", false);
    const response = await callAPI("/generate", { action: "stop" });

    if (response.status) {
      updateStatus(response.status);
    }
    if (response.error) {
      showToast(`Error: ${response.error}`, true);
    } else {
      showToast(" ", false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.userBar}>
        <span style={styles.userText}>👤 {username}</span>
        <button onClick={onLogout} style={styles.signOutBtn}>
          Sign Out
        </button>
      </div>

      <div style={styles.header}>
        <h1 style={styles.title}>🚀 E-commerce Event Stream</h1>
        <p style={styles.subtitle}>Stream Control Dashboard</p>
      </div>

      <div style={styles.centerWrapper}>
        <div style={styles.controlCard}>
          <div style={styles.statusSection}>
          </div>

          <div style={styles.buttonGroup}>
            <button
              style={{ ...styles.primaryBtn }}
              onClick={startStream}
              onMouseEnter={(e) => (e.target.style.transform = "translateY(-2px)")}
              onMouseLeave={(e) => (e.target.style.transform = "translateY(0)")}
            >
              ▶ Start Stream
            </button>

            <button
              style={{ ...styles.dangerBtn }}
              onClick={stopStream}
              onMouseEnter={(e) => (e.target.style.transform = "translateY(-2px)")}
              onMouseLeave={(e) => (e.target.style.transform = "translateY(0)")}
            >
              ⏹ Stop Stream
            </button>
          </div>
        </div>
      </div>

      {toast && (
        <div style={{ ...styles.toast, ...(toast.isError ? styles.toastError : styles.toastSuccess) }}>
          {toast.message}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    return !!localStorage.getItem("authToken");
  });

  const username = localStorage.getItem("username") || "User";

  const handleLogin = () => {
    setIsLoggedIn(true);
  };

  const handleLogout = () => {
    // Clear all auth and session data
    localStorage.removeItem("authToken");
    localStorage.removeItem("username");
    localStorage.removeItem("streamStatus");
    sessionStorage.clear();
    setIsLoggedIn(false);
  };

  if (!isLoggedIn) {
    return <LoginForm onLogin={handleLogin} />;
  }

  return <ControlPanel username={username} onLogout={handleLogout} />;
}

/* STYLES */
const styles = {
  loginContainer: {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    padding: "20px",
  },

  loginCard: {
    background: "rgba(255, 255, 255, 0.95)",
    borderRadius: "16px",
    padding: "40px",
    maxWidth: "400px",
    width: "100%",
    boxShadow: "0 20px 60px rgba(0, 0, 0, 0.3)",
  },

  loginTitle: {
    fontSize: "28px",
    fontWeight: "700",
    color: "#1f2937",
    margin: "0 0 30px 0",
    textAlign: "center",
  },

  formGroup: {
    marginBottom: "20px",
  },

  label: {
    display: "block",
    fontSize: "14px",
    fontWeight: "600",
    color: "#374151",
    marginBottom: "8px",
  },

  input: {
    width: "100%",
    padding: "12px",
    border: "1px solid #d1d5db",
    borderRadius: "8px",
    fontSize: "16px",
    boxSizing: "border-box",
    fontFamily: "inherit",
  },

  loginBtn: {
    width: "100%",
    padding: "12px",
    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    color: "white",
    border: "none",
    borderRadius: "8px",
    fontSize: "16px",
    fontWeight: "600",
    cursor: "pointer",
    marginTop: "20px",
  },

  error: {
    color: "#dc2626",
    fontSize: "14px",
    padding: "10px",
    background: "#fee2e2",
    borderRadius: "6px",
    marginBottom: "15px",
  },

  hint: {
    marginTop: "20px",
    padding: "15px",
    background: "#f3f4f6",
    borderRadius: "8px",
  },

  container: {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    padding: "40px 20px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },

  userBar: {
    position: "absolute",
    top: "20px",
    right: "20px",
    display: "flex",
    alignItems: "center",
    gap: "15px",
    background: "rgba(255, 255, 255, 0.9)",
    padding: "12px 20px",
    borderRadius: "12px",
  },

  userText: {
    fontSize: "14px",
    fontWeight: "600",
    color: "#374151",
  },

  signOutBtn: {
    background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
    color: "white",
    padding: "8px 16px",
    border: "none",
    borderRadius: "8px",
    fontSize: "14px",
    fontWeight: "600",
    cursor: "pointer",
  },

  header: {
    textAlign: "center",
    marginBottom: "60px",
    marginTop: "60px",
  },

  title: {
    fontSize: "3.5rem",
    fontWeight: "800",
    color: "white",
    margin: "0 0 10px 0",
    textShadow: "0 4px 20px rgba(0, 0, 0, 0.1)",
  },

  subtitle: {
    fontSize: "1.2rem",
    color: "rgba(255, 255, 255, 0.8)",
    margin: "0",
  },

  centerWrapper: {
    display: "flex",
    justifyContent: "center",
    width: "100%",
    maxWidth: "600px",
  },

  controlCard: {
    background: "rgba(255, 255, 255, 0.95)",
    padding: "48px 40px",
    borderRadius: "24px",
    boxShadow: "0 20px 60px rgba(0, 0, 0, 0.3)",
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: "28px",
  },

  statusSection: {
    textAlign: "center",
  },

  cardTitle: {
    fontSize: "1.4rem",
    color: "#1f2937",
    margin: "0 0 16px 0",
    fontWeight: "600",
  },

  statusIndicator: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },

  statusText: {
    fontSize: "1.3rem",
    fontWeight: "600",
    color: "#374151",
  },

  buttonGroup: {
    display: "flex",
    gap: "16px",
    justifyContent: "center",
    flexWrap: "wrap",
  },

  primaryBtn: {
    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    color: "white",
    padding: "14px 32px",
    border: "none",
    borderRadius: "12px",
    fontSize: "1rem",
    fontWeight: "600",
    cursor: "pointer",
    boxShadow: "0 10px 30px rgba(102, 126, 234, 0.4)",
    transition: "all 0.3s ease",
    minWidth: "160px",
  },

  dangerBtn: {
    background: "linear-gradient(135deg, #f87171 0%, #dc2626 100%)",
    color: "white",
    padding: "14px 32px",
    border: "none",
    borderRadius: "12px",
    fontSize: "1rem",
    fontWeight: "600",
    cursor: "pointer",
    boxShadow: "0 10px 30px rgba(248, 113, 113, 0.35)",
    transition: "all 0.3s ease",
    minWidth: "160px",
  },

  toast: {
    position: "fixed",
    bottom: "30px",
    right: "30px",
    padding: "16px 24px",
    borderRadius: "12px",
    fontWeight: "600",
    boxShadow: "0 15px 40px rgba(0, 0, 0, 0.2)",
    zIndex: 9999,
  },

  toastSuccess: {
    background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
    color: "white",
  },

  toastError: {
    background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
    color: "white",
  },
};
