import { useState } from "react";
import { getApiKey, setApiKey, clearApiKeyOverride } from "../lib/apiKey";

export default function TenantSwitcher() {
  const currentKey = getApiKey();
  const prefix = currentKey ? currentKey.substring(0, 16) + "..." : "none";
  const [input, setInput] = useState("");

  const handleSwitch = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    setApiKey(trimmed);
    window.location.reload();
  };

  const handleReset = () => {
    clearApiKeyOverride();
    window.location.reload();
  };

  return (
    <div style={{
      padding: "16px 24px",
      borderTop: "1px solid #374151",
    }}>
      <div style={{ fontSize: "11px", fontWeight: "600", color: "#9CA3AF", marginBottom: "6px" }}>
        TENANT API KEY
      </div>
      <div style={{
        fontSize: "11px",
        color: "#6B7280",
        marginBottom: "8px",
        fontFamily: "monospace",
        wordBreak: "break-all",
      }}>
        {prefix}
      </div>
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") handleSwitch(); }}
        placeholder="Paste API key..."
        style={{
          width: "100%",
          padding: "6px 8px",
          fontSize: "11px",
          backgroundColor: "#1F2937",
          border: "1px solid #374151",
          borderRadius: "6px",
          color: "#E5E7EB",
          fontFamily: "monospace",
          boxSizing: "border-box",
          outline: "none",
        }}
      />
      <div style={{ display: "flex", gap: "6px", marginTop: "6px" }}>
        <button
          onClick={handleSwitch}
          style={{
            flex: 1,
            padding: "5px 0",
            fontSize: "11px",
            fontWeight: "600",
            backgroundColor: "#2563EB",
            color: "white",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
          }}
        >
          Switch
        </button>
        <button
          onClick={handleReset}
          style={{
            padding: "5px 8px",
            fontSize: "11px",
            fontWeight: "500",
            backgroundColor: "transparent",
            color: "#6B7280",
            border: "1px solid #374151",
            borderRadius: "6px",
            cursor: "pointer",
          }}
        >
          Reset
        </button>
      </div>
      <div style={{ fontSize: "10px", color: "#4B5563", marginTop: "6px" }}>
        Switch tenants for demo
      </div>
    </div>
  );
}
