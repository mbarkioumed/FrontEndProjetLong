// src/components/MetaboliteHistogram.jsx
import React, { useMemo, useState, useRef, useEffect } from "react";

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const t = idx - lo;
  return sorted[lo] * (1 - t) + sorted[hi] * t;
}

// approx largeur texte pour éviter overflow (pas précis mais suffisant)
function approxTextWidthPx(str, fontSize = 11) {
  return str.length * fontSize * 0.58;
}

export default function MetaboliteHistogram({
  volumeData,
  dimensions,
  metabolite,
  sliceIndex,
  selectedVoxel = null,
  width = 700,
  height = 160,
  bins = 30,
}) {
  const wrapRef = useRef(null);
  const [hoverBin, setHoverBin] = useState(null); 
  const [hoverX, setHoverX] = useState(null);

  useEffect(() => {
    const onScroll = () => {
      setHoverBin(null);
      setHoverX(null);
    };
    window.addEventListener("scroll", onScroll, true);
    return () => window.removeEventListener("scroll", onScroll, true);
  }, []);

  const sliceValues = useMemo(() => {
    if (!volumeData || !dimensions) return [];
    const X = dimensions.X;
    const Y = dimensions.Y;

    const arr = [];
    for (let i = 0; i < X; i++) {
      for (let j = 0; j < Y; j++) {
        const key = `${i}_${j}_${sliceIndex}`;
        const val = volumeData[key]?.[metabolite];
        if (typeof val === "number" && Number.isFinite(val)) arr.push(val);
      }
    }
    arr.sort((a, b) => a - b);
    return arr;
  }, [volumeData, dimensions, metabolite, sliceIndex]);

  const stats = useMemo(() => {
    if (!sliceValues.length) return null;
    return {
      min: sliceValues[0],
      max: sliceValues[sliceValues.length - 1],
      p2: percentile(sliceValues, 2),
      p50: percentile(sliceValues, 50),
      p95: percentile(sliceValues, 95),
      p98: percentile(sliceValues, 98),
    };
  }, [sliceValues]);

  const selectedVal = useMemo(() => {
    if (!selectedVoxel || !volumeData) return null;
    if (
      selectedVoxel.x == null ||
      selectedVoxel.y == null ||
      selectedVoxel.z == null
    )
      return null;
    if (selectedVoxel.z !== sliceIndex) return null;

    const key = `${selectedVoxel.x}_${selectedVoxel.y}_${sliceIndex}`;
    const v = volumeData[key]?.[metabolite];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  }, [selectedVoxel, volumeData, metabolite, sliceIndex]);

  const bars = useMemo(() => {
    if (!sliceValues.length || !stats) return [];
    const lo = stats.min;
    const hi = stats.max <= stats.min ? stats.min + 1 : stats.max;

    const counts = new Array(bins).fill(0);
    for (const v of sliceValues) {
      const t = (v - lo) / (hi - lo);
      const b = clamp(Math.floor(t * bins), 0, bins - 1);
      counts[b]++;
    }

    const maxCount = Math.max(1, ...counts);
    const total = sliceValues.length;

    return counts.map((c, idx) => {
      const binLo = lo + (idx / bins) * (hi - lo);
      const binHi = lo + ((idx + 1) / bins) * (hi - lo);
      return {
        idx,
        count: c,
        pct: total > 0 ? (c / total) * 100 : 0,
        h01: c / maxCount,
        x0: idx / bins,
        x1: (idx + 1) / bins,
        loVal: binLo,
        hiVal: binHi,
      };
    });
  }, [sliceValues, stats, bins]);

  // ---- dimensions svg
  const pad = 10;
  const W = width;
  const H = height;

  // helpers dépendants de stats (si stats null -> valeurs safe)
  const lo = stats ? stats.min : 0;
  const hi = stats ? (stats.max <= stats.min ? stats.min + 1 : stats.max) : 1;

  const xFromValue = (v) => {
    const t = clamp((v - lo) / (hi - lo), 0, 1);
    return pad + t * (W - 2 * pad);
  };

  const showHover = (b, evt) => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const xPx = evt.clientX - rect.left;
    const yPx = evt.clientY - rect.top;

    setHoverX(clamp(xPx, 0, W));
    setHoverBin({
      idx: b.idx,
      count: b.count,
      pct: b.pct,
      loVal: b.loVal,
      hiVal: b.hiVal,
      xPx,
      yPx,
    });
  };

  if (!stats) {
    return (
      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
        Pas de données pour {metabolite} (slice Z={sliceIndex})
      </div>
    );
  }

  const voxelLabel =
    selectedVal != null ? `voxel: ${selectedVal.toFixed(3)}` : "";
  const xv = selectedVal != null ? xFromValue(selectedVal) : null;

  let voxelTextX = xv != null ? xv + 8 : null;
  let voxelAnchor = "start";
  if (xv != null) {
    const tw = approxTextWidthPx(voxelLabel, 11);
    if (xv + 8 + tw > W - pad) {
      voxelTextX = Math.max(pad, xv - 8);
      voxelAnchor = "end";
    }
    if (voxelTextX < pad) {
      voxelTextX = pad;
      voxelAnchor = "start";
    }
  }

  const tooltipW = 220;
  const tooltipH = 120;
  const tipLeft =
    hoverBin != null
      ? clamp(hoverBin.xPx + 12, 0, Math.max(0, W - tooltipW))
      : 0;
  const tipTop =
    hoverBin != null
      ? clamp(hoverBin.yPx + 12, 0, Math.max(0, H - tooltipH))
      : 0;

  return (
    <div ref={wrapRef} style={{ position: "relative", width: W }}>
      {hoverBin && (
        <div
          style={{
            position: "absolute",
            left: tipLeft,
            top: tipTop,
            width: tooltipW,
            pointerEvents: "none",
            fontSize: 12,
            padding: "8px 10px",
            borderRadius: 10,
            border: "1px solid var(--border-color)",
            background: "var(--bg-secondary)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
            color: "var(--text-main)",
          }}
        >
          <div style={{ fontWeight: 800, marginBottom: 4 }}>
            Bin #{hoverBin.idx} / {bins - 1}
          </div>
          <div style={{ marginBottom: 2 }}>
            <span style={{ color: "var(--text-muted)" }}>range:</span>{" "}
            <b>
              {hoverBin.loVal.toFixed(3)} → {hoverBin.hiVal.toFixed(3)}
            </b>
          </div>
          <div style={{ marginBottom: 2 }}>
            <span style={{ color: "var(--text-muted)" }}>count:</span>{" "}
            <b>{hoverBin.count}</b> voxels
          </div>
          <div>
            <span style={{ color: "var(--text-muted)" }}>part:</span>{" "}
            <b>{hoverBin.pct.toFixed(1)}%</b>
          </div>
          <div
            style={{
              marginTop: 6,
              fontSize: 11,
              color: "var(--text-muted)",
              lineHeight: 1.25,
            }}
          >
            Chaque barre = un intervalle. La hauteur = combien de voxels dedans.
          </div>
        </div>
      )}

      <svg
        width={W}
        height={H}
        style={{ display: "block" }}
        onMouseLeave={() => {
          setHoverBin(null);
          setHoverX(null);
        }}
      >
        {/* fond léger */}
        <rect
          x={0}
          y={0}
          width={W}
          height={H}
          fill="currentColor"
          opacity="0.03"
        />

        {/* baseline */}
        <line
          x1={pad}
          y1={H - pad}
          x2={W - pad}
          y2={H - pad}
          stroke="currentColor"
          opacity="0.25"
        />

        {/* hover line */}
        {hoverX != null && (
          <line
            x1={hoverX}
            y1={pad}
            x2={hoverX}
            y2={H - pad}
            stroke="currentColor"
            opacity="0.12"
          />
        )}

        {/* percentiles */}
        <line
          x1={xFromValue(stats.p2)}
          y1={pad}
          x2={xFromValue(stats.p2)}
          y2={H - pad}
          stroke="currentColor"
          opacity="0.18"
          strokeDasharray="3 3"
        />
        <line
          x1={xFromValue(stats.p98)}
          y1={pad}
          x2={xFromValue(stats.p98)}
          y2={H - pad}
          stroke="currentColor"
          opacity="0.18"
          strokeDasharray="3 3"
        />
        <line
          x1={xFromValue(stats.p50)}
          y1={pad}
          x2={xFromValue(stats.p50)}
          y2={H - pad}
          stroke="currentColor"
          opacity="0.22"
        />

        {/* bars */}
        {bars.map((b) => {
          const x0 = pad + b.x0 * (W - 2 * pad);
          const x1 = pad + b.x1 * (W - 2 * pad);
          const bw = Math.max(1, x1 - x0 - 1);
          const bh = b.h01 * (H - 2 * pad);

          const voxelInThisBin =
            selectedVal != null &&
            selectedVal >= b.loVal &&
            (b.idx === bins - 1 ? selectedVal <= b.hiVal : selectedVal < b.hiVal);

          const isHover = hoverBin?.idx === b.idx;

          return (
            <g key={b.idx}>
              {/* hit area */}
              <rect
                x={x0}
                y={pad}
                width={bw}
                height={H - 2 * pad}
                fill="transparent"
                onMouseMove={(e) => showHover(b, e)}
              />
              {/* bar */}
              <rect
                x={x0}
                y={H - pad - bh}
                width={bw}
                height={bh}
                fill="currentColor"
                opacity={voxelInThisBin ? 0.7 : isHover ? 0.55 : 0.35}
                rx={2}
                ry={2}
              />
            </g>
          );
        })}

        {/* selected voxel marker */}
        {selectedVal != null && xv != null && (
          <>
            <line
              x1={xv}
              y1={pad}
              x2={xv}
              y2={H - pad}
              stroke="red"
              strokeWidth={2}
              opacity="0.85"
            />
            <text
              x={voxelTextX}
              y={pad + 12}
              fontSize="11"
              fill="red"
              textAnchor={voxelAnchor}
            >
              {voxelLabel}
            </text>
          </>
        )}
      </svg>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 12,
          color: "var(--text-muted)",
          marginTop: 2,
        }}
      >
        <span>min: {stats.min.toFixed(3)}</span>
        <span>p2: {stats.p2.toFixed(3)}</span>
        <span>p50: {stats.p50.toFixed(3)}</span>
        <span>p98: {stats.p98.toFixed(3)}</span>
        <span>max: {stats.max.toFixed(3)}</span>
      </div>

      <div style={{ marginTop: 6, fontSize: 11, color: "var(--text-muted)" }}>
        <b>bins = {bins}</b> : intervalle [{lo.toFixed(3)} → {hi.toFixed(3)}]
        découpé en {bins} “seaux”. Survole une barre pour son range + count + %.
      </div>
    </div>
  );
}