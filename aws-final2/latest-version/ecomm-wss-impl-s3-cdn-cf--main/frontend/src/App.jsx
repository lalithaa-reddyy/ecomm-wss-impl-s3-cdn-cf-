import { useState } from "react";
import "./index.css";

const API_ENDPOINT = import.meta.env.VITE_API_BASE_URL;

export default function App() {
  const [status, setStatus] = useState("stopped");
  const [toast, setToast] = useState(null);

  const showToast = (message, isError = false) => {
    setToast({ message, isError });

    setTimeout(() => {
      setToast(null);
    }, 3000);
  };

  const callAPI = async (endpoint, body = {}, method = "POST") => {
    try {
      const url = `${API_ENDPOINT}${endpoint}`;
      console.log(`[API] Calling ${method} ${url} with payload:`, body);

      const options = {
        method,
        headers: { "Content-Type": "application/json" }
      };
      if (method !== "GET") {
        options.body = JSON.stringify(body);
      }

      const res = await fetch(url, options);
      const data = await res.json();

      if (!res.ok) {
        console.error(`[API] Error: ${res.status} ${res.statusText}`, data);
        return { error: data, statusCode: res.status };
      }

      console.log(`[API] Response:`, data);
      return data;
    } catch (err) {
      console.error("[API] Network error:", err);
      return { error: err.message };
    }
  };

  const startStream = async () => {
    showToast("Starting stream...", false);
    const response = await callAPI("/generate", {
      action: "start",
      rate: 100000
    }, "POST");

    if (response.error) {
      showToast(`Error: ${response.error}`, true);
      setStatus("stopped");
    } else {
      setStatus("running");
      showToast("✅ Generator started successfully", false);
    }
  };

  const stopStream = async () => {
    showToast("Stopping stream...", false);
    const response = await callAPI("/generate", {
      action: "stop"
    }, "POST");

    if (response.error) {
      showToast(`Error: ${response.error}`, true);
      setStatus("running");
    } else {
      setStatus("stopped");
      showToast("✅ Generator stopped", false);
    }
  };

  return (
    <div style={styles.container}>
      {/* HEADER */}
      <div style={styles.header}>
        <h1 style={styles.title}> E-commerce Event Stream</h1>
        <p style={styles.subtitle}>Stream Control Dashboard</p>
      </div>

      {/* MAIN CONTROL CARD */}
      <div style={styles.centerWrapper}>
        <div style={styles.controlCard}>
          <div style={styles.statusSection}>
            <h2 style={styles.cardTitle}>Stream Status</h2>
            <div style={styles.statusIndicator}>
              <span style={styles.statusText}>{status === "running" ? "🟢 Running" : "🔴 Stopped"}</span>
            </div>
          </div>

          <div style={styles.buttonGroup}>
            <button 
              style={{...styles.primaryBtn, ...(status === "running" ? styles.primaryBtnHover : {})}}
              onClick={startStream}
              onMouseEnter={(e) => e.target.style.transform = "translateY(-2px)"}
              onMouseLeave={(e) => e.target.style.transform = "translateY(0)"}
            >
              ▶ Start Stream
            </button>

            <button 
              style={{...styles.dangerBtn, ...(status === "stopped" ? styles.dangerBtnHover : {})}}
              onClick={stopStream}
              onMouseEnter={(e) => e.target.style.transform = "translateY(-2px)"}
              onMouseLeave={(e) => e.target.style.transform = "translateY(0)"}
            >
              ⏹ Stop Stream
            </button>
          </div>
        </div>
      </div>

      {/* TOAST NOTIFICATION */}
      {toast && (
        <div style={{ ...styles.toast, ...(toast.isError ? styles.toastError : styles.toastSuccess) }}>
          {toast.message}
        </div>
      )}
    </div>
  );
}

/* 🎨 STYLES */

const styles = {
  container: {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    padding: "40px 20px",
    fontFamily: "'Segoe UI', 'Roboto', sans-serif",
    display: "flex",
    flexDirection: "column",
    alignItems: "center"
  },

  header: {
    textAlign: "center",
    marginBottom: "60px",
    animation: "fadeIn 0.8s ease-in"
  },

  title: {
    fontSize: "3.5rem",
    fontWeight: "800",
    color: "#ffffff",
    margin: "0 0 10px 0",
    textShadow: "0 4px 20px rgba(0, 0, 0, 0.1)",
    letterSpacing: "-0.5px"
  },

  subtitle: {
    fontSize: "1.2rem",
    color: "rgba(255, 255, 255, 0.8)",
    margin: "0",
    fontWeight: "300"
  },

  centerWrapper: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
    maxWidth: "600px"
  },

  controlCard: {
    background: "rgba(255, 255, 255, 0.95)",
    backdropFilter: "blur(10px)",
    padding: "48px 40px",
    borderRadius: "24px",
    boxShadow: "0 20px 60px rgba(0, 0, 0, 0.3), 0 0 1px rgba(255, 255, 255, 0.5) inset",
    border: "1px solid rgba(255, 255, 255, 0.8)",
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: "28px"
  },

  statusSection: {
    textAlign: "center"
  },

  cardTitle: {
    fontSize: "1.4rem",
    color: "#1f2937",
    margin: "0 0 16px 0",
    fontWeight: "600"
  },

  statusIndicator: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "12px"
  },

  statusDot: {
    width: "14px",
    height: "14px",
    borderRadius: "50%",
    animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite"
  },

  statusText: {
    fontSize: "1.3rem",
    fontWeight: "600",
    color: "#374151"
  },

  buttonGroup: {
    display: "flex",
    gap: "16px",
    justifyContent: "center",
    flexWrap: "wrap"
  },

  primaryBtn: {
    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    color: "#fff",
    padding: "14px 32px",
    border: "none",
    borderRadius: "12px",
    fontSize: "1rem",
    fontWeight: "600",
    cursor: "pointer",
    boxShadow: "0 10px 30px rgba(102, 126, 234, 0.4)",
    transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
    minWidth: "160px"
  },

  primaryBtnHover: {
    boxShadow: "0 15px 40px rgba(102, 126, 234, 0.5)",
    transform: "translateY(-2px)"
  },

  dangerBtn: {
    background: "linear-gradient(135deg, #f87171 0%, #dc2626 100%)",
    color: "#fff",
    padding: "14px 32px",
    border: "none",
    borderRadius: "12px",
    fontSize: "1rem",
    fontWeight: "600",
    cursor: "pointer",
    boxShadow: "0 10px 30px rgba(248, 113, 113, 0.35)",
    transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
    minWidth: "160px"
  },

  dangerBtnHover: {
    boxShadow: "0 15px 40px rgba(248, 113, 113, 0.5)",
    transform: "translateY(-2px)"
  },

  toast: {
    position: "fixed",
    bottom: "30px",
    right: "30px",
    padding: "16px 24px",
    borderRadius: "12px",
    fontWeight: "600",
    fontSize: "1rem",
    boxShadow: "0 15px 40px rgba(0, 0, 0, 0.2)",
    zIndex: 9999,
    animation: "slideIn 0.4s ease-out"
  },

  toastSuccess: {
    background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
    color: "#fff"
  },

  toastError: {
    background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
    color: "#fff"
  }
};