import React, { useMemo, useState } from "react";

function downloadText(filename, text, mime = "text/plain") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function toCsv(rows) {
  const esc = (s) => `"${String(s).replaceAll('"', '""')}"`;
  const header = ["metabolite", "value"];
  const lines = [header.join(",")];
  for (const r of rows) lines.push([esc(r.met), r.value].join(","));
  return lines.join("\n");
}

const isFiniteNumber = (v) => typeof v === "number" && Number.isFinite(v);

function ratio(a, b) {
  if (!isFiniteNumber(a) || !isFiniteNumber(b) || b === 0) return null;
  return a / b;
}

export default function QuantVoxelPanel({ quant, voxel, method }) {
  const [q, setQ] = useState("");
  const [hideZeros, setHideZeros] = useState(true);

  const rows = useMemo(() => {
    const arr = Object.entries(quant || {})
      .map(([met, value]) => ({ met, value: Number(value) }))
      .filter((r) => isFiniteNumber(r.value))
      .sort((a, b) => b.value - a.value);

    const eps = 1e-6;
    const filtered = hideZeros ? arr.filter((r) => Math.abs(r.value) > eps) : arr;

    if (!q.trim()) return filtered;
    const qq = q.trim().toLowerCase();
    return filtered.filter((r) => r.met.toLowerCase().includes(qq));
  }, [quant, q, hideZeros]);

  const vmax = useMemo(() => (rows.length ? rows[0].value : 0), [rows]);
  const top = useMemo(() => rows.slice(0, 8), [rows]);

  const ratioCards = useMemo(() => {
    const get = (name) => {
      const v = quant?.[name];
      return isFiniteNumber(v) ? v : null;
    };
    const Cho = get("Cho") ?? get("PCh") ?? null;
    const NAA = get("NAA");
    const Cr = get("Cr");
    const Lac = get("Lac");
    const mI = get("mI");

    return [
      { label: "Cho/NAA", v: ratio(Cho, NAA) },
      { label: "Cho/Cr",  v: ratio(Cho, Cr) },
      { label: "Lac/Cr",  v: ratio(Lac, Cr) },
      { label: "mI/Cr",   v: ratio(mI, Cr) },
    ].filter((x) => x.v != null);
  }, [quant]);

  return (
    <div style={{
      marginTop: "0.75rem",
      padding: "0.9rem",
      borderRadius: 14,
      border: "1px solid var(--border-color)",
      background: "rgba(255,255,255,0.03)",
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13 }}>
            Voxel ({voxel?.x ?? "?"}, {voxel?.y ?? "?"}, {voxel?.z ?? "?"})
          </div>
          {method && (
            <div style={{ color: "var(--text-muted)", fontSize: 11, marginTop: 2 }}>
              Méthode : {method}
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ display: "flex", gap: 4, alignItems: "center", fontSize: 11, color: "var(--text-muted)", cursor: "pointer" }}>
            <input type="checkbox" checked={hideZeros} onChange={(e) => setHideZeros(e.target.checked)} />
            Masquer ~0
          </label>

          <button
            className="btn-secondary"
            style={{ fontSize: 11, padding: "3px 8px" }}
            onClick={() => navigator.clipboard?.writeText(JSON.stringify(quant, null, 2))}
          >
            Copier
          </button>

          <button
            className="btn-secondary"
            style={{ fontSize: 11, padding: "3px 8px" }}
            onClick={() => downloadText(
              `quant_${voxel?.x ?? 0}_${voxel?.y ?? 0}_${voxel?.z ?? 0}.json`,
              JSON.stringify({ voxel, method, quant }, null, 2),
              "application/json"
            )}
          >
            JSON
          </button>

          <button
            className="btn-secondary"
            style={{ fontSize: 11, padding: "3px 8px" }}
            onClick={() => downloadText(
              `quant_${voxel?.x ?? 0}_${voxel?.y ?? 0}_${voxel?.z ?? 0}.csv`,
              toCsv(rows),
              "text/csv"
            )}
          >
            CSV
          </button>
        </div>
      </div>

      {/* Search */}
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Filtrer (ex: NAA, Glu...)"
        style={{
          width: "100%",
          padding: "0.35rem 0.6rem",
          borderRadius: 8,
          border: "1px solid var(--border-color)",
          background: "transparent",
          color: "var(--text-main)",
          fontSize: 12,
          marginBottom: 10,
          boxSizing: "border-box",
        }}
      />

      {/* Ratios cliniques */}
      {ratioCards.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {ratioCards.map((r) => (
            <div key={r.label} style={{
              padding: "4px 10px",
              borderRadius: 10,
              border: "1px solid var(--border-color)",
              background: "rgba(255,255,255,0.04)",
              minWidth: 80,
              textAlign: "center",
            }}>
              <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{r.label}</div>
              <div style={{ fontWeight: 800, fontSize: 14 }}>{r.v.toFixed(3)}</div>
            </div>
          ))}
        </div>
      )}

      {/* Top 8 barres */}
      {top.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, marginBottom: 6 }}>
            Top métabolites
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {top.map((r) => {
              const pct = vmax > 0 ? Math.max(0, Math.min(1, r.value / vmax)) : 0;
              return (
                <div key={r.met} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 36, fontSize: 11, fontWeight: 600, flexShrink: 0 }}>{r.met}</div>
                  <div style={{ flex: 1, height: 8, borderRadius: 999, background: "rgba(255,255,255,0.08)" }}>
                    <div style={{
                      width: `${pct * 100}%`,
                      height: "100%",
                      borderRadius: 999,
                      background: "linear-gradient(90deg,#3b82f6,#06b6d4)"
                    }} />
                  </div>
                  <div style={{ width: 52, textAlign: "right", fontSize: 11, fontVariantNumeric: "tabular-nums", color: "var(--text-muted)" }}>
                    {r.value.toFixed(4)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Table complète */}
      <div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, marginBottom: 4 }}>
          Tous les métabolites ({rows.length})
        </div>
        <div style={{
          maxHeight: 280,
          overflow: "auto",
          borderRadius: 10,
          border: "1px solid var(--border-color)",
        }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "var(--bg-secondary)" }}>
                <th style={{ textAlign: "left", padding: "7px 10px", position: "sticky", top: 0, background: "var(--bg-secondary)", zIndex: 1 }}>Métabolite</th>
                <th style={{ textAlign: "right", padding: "7px 10px", width: 90, position: "sticky", top: 0, background: "var(--bg-secondary)", zIndex: 1 }}>Valeur</th>
                <th style={{ textAlign: "left", padding: "7px 10px", position: "sticky", top: 0, background: "var(--bg-secondary)", zIndex: 1 }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const pct = vmax > 0 ? Math.max(0, Math.min(1, r.value / vmax)) : 0;
                return (
                  <tr key={r.met} style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                    <td style={{ padding: "6px 10px", fontWeight: 600 }}>{r.met}</td>
                    <td style={{ padding: "6px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {r.value.toFixed(4)}
                    </td>
                    <td style={{ padding: "6px 10px", width: 80 }}>
                      <div style={{ height: 6, borderRadius: 999, background: "rgba(255,255,255,0.08)" }}>
                        <div style={{ width: `${pct * 100}%`, height: "100%", borderRadius: 999, background: "rgba(96,165,250,0.85)" }} />
                      </div>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={3} style={{ padding: 12, color: "var(--text-muted)", textAlign: "center" }}>
                    Aucune valeur (filtre trop restrictif ?)
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}