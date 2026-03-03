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

    const items = [
      { label: "Cho/NAA", v: ratio(Cho, NAA) },
      { label: "Cho/Cr", v: ratio(Cho, Cr) },
      { label: "Lac/Cr", v: ratio(Lac, Cr) },
      { label: "mI/Cr", v: ratio(mI, Cr) },
    ].filter((x) => x.v != null);

    return items;
  }, [quant]);

  return (
    <div
      style={{
        marginTop: "0.75rem",
        padding: "0.9rem",
        borderRadius: 14,
        border: "1px solid var(--border-color)",
        background: "rgba(255,255,255,0.03)",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 700 }}>
            Quantification – Voxel ({voxel?.x ?? "?"}, {voxel?.y ?? "?"}, {voxel?.z ?? "?"})
          </div>
          <div style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 2 }}>
            {method ? `Méthode: ${method}` : " "}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, color: "var(--text-muted)" }}>
            <input type="checkbox" checked={hideZeros} onChange={(e) => setHideZeros(e.target.checked)} />
            Masquer ~0
          </label>

          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filtrer (ex: NAA, Glu...)"
            style={{
              padding: "0.45rem 0.6rem",
              borderRadius: 10,
              border: "1px solid var(--border-color)",
              background: "transparent",
              color: "var(--text-main)",
              fontSize: 12,
              minWidth: 220,
            }}
          />

          <button
            className="btn-secondary"
            onClick={() => {
              navigator.clipboard?.writeText(JSON.stringify(quant, null, 2));
            }}
          >
            Copier
          </button>

          <button
            className="btn-secondary"
            onClick={() => {
              downloadText(
                `quant_voxel_${voxel?.x ?? 0}_${voxel?.y ?? 0}_${voxel?.z ?? 0}.json`,
                JSON.stringify({ voxel, method, quant }, null, 2),
                "application/json"
              );
            }}
          >
            Export JSON
          </button>

          <button
            className="btn-secondary"
            onClick={() => {
              const csv = toCsv(rows);
              downloadText(
                `quant_voxel_${voxel?.x ?? 0}_${voxel?.y ?? 0}_${voxel?.z ?? 0}.csv`,
                csv,
                "text/csv"
              );
            }}
          >
            Export CSV
          </button>
        </div>
      </div>

      {/* Ratios */}
      {ratioCards.length > 0 && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
          {ratioCards.map((r) => (
            <div
              key={r.label}
              style={{
                padding: "0.5rem 0.7rem",
                borderRadius: 12,
                border: "1px solid var(--border-color)",
                background: "rgba(255,255,255,0.02)",
                minWidth: 120,
              }}
            >
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{r.label}</div>
              <div style={{ fontWeight: 700 }}>{r.v.toFixed(3)}</div>
            </div>
          ))}
        </div>
      )}

      {/* Top bars */}
      {top.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 650, fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>
            Top métabolites
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {top.map((r) => {
              const pct = vmax > 0 ? Math.max(0, Math.min(1, r.value / vmax)) : 0;
              return (
                <div key={r.met} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 56, fontSize: 12, fontWeight: 600 }}>{r.met}</div>
                  <div style={{ flex: 1, height: 10, borderRadius: 999, border: "1px solid var(--border-color)" }}>
                    <div style={{ width: `${pct * 100}%`, height: "100%", borderRadius: 999, background: "var(--accent)" }} />
                  </div>
                  <div style={{ width: 72, textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: 12 }}>
                    {r.value.toFixed(4)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Full table */}
      <div style={{ marginTop: 12 }}>
        <div style={{ fontWeight: 650, fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>
          Tous les métabolites ({rows.length})
        </div>

        <div
          style={{
            maxHeight: 320,
            overflow: "auto",
            borderRadius: 12,
            border: "1px solid var(--border-color)",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead style={{ position: "sticky", top: 0, background: "rgba(15,20,35,0.95)" }}>
              <tr>
                <th style={{ textAlign: "left", padding: 10 }}>Métabolite</th>
                <th style={{ textAlign: "right", padding: 10, width: 110 }}>Valeur</th>
                <th style={{ textAlign: "left", padding: 10 }}> </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const pct = vmax > 0 ? Math.max(0, Math.min(1, r.value / vmax)) : 0;
                return (
                  <tr key={r.met} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                    <td style={{ padding: 10, fontWeight: 600 }}>{r.met}</td>
                    <td style={{ padding: 10, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {r.value.toFixed(4)}
                    </td>
                    <td style={{ padding: 10 }}>
                      <div style={{ height: 8, borderRadius: 999, border: "1px solid rgba(255,255,255,0.10)" }}>
                        <div style={{ width: `${pct * 100}%`, height: "100%", borderRadius: 999, background: "rgba(120,160,255,0.9)" }} />
                      </div>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={3} style={{ padding: 12, color: "var(--text-muted)" }}>
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