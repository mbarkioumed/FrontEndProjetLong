import React, { useState } from "react";

export default function CollapsiblePanel({ title, defaultOpen = false, children }) {
  const [open, setOpen] = React.useState(defaultOpen);

  return (
    <div style={{ width: "100%" }}>
      <div
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          cursor: "pointer",
          userSelect: "none",
          padding: "4px 6px",
          borderRadius: 8,
          background: "rgba(255,255,255,0.03)",
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)" }}>
          {title}
        </span>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {open ? "▼" : "▶"}
        </span>
      </div>

      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            marginTop: 6,
            width: "100%",
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}