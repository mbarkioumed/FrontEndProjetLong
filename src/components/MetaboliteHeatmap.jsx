// src/components/MetaboliteHeatmap.jsx
import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";

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

function colormap(value01) {
  const v = clamp(value01, 0, 1);
  if (v < 0.02) return "#e5e7eb";

  let r, g, b;
  if (v < 0.5) {
    const t = v / 0.5;
    r = 255 - Math.floor(100 * t);
    g = 240;
    b = 150 - Math.floor(50 * t);
  } else {
    const t = (v - 0.5) / 0.5;
    r = 155 - Math.floor(100 * t);
    g = 240 - Math.floor(120 * t);
    b = 100 + Math.floor(120 * t);
  }
  return `rgb(${r},${g},${b})`;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const MODE_HELP = {
  clip: "Clip p2–p98 : ignore les valeurs extrêmes → couleurs plus stables.",
  auto: "Auto min–max : étire toute la plage → sensible aux outliers.",
  log: "Log : révèle les petites valeurs, compresse les grandes.",
};

const MetaboliteHeatmap = forwardRef(function MetaboliteHeatmap(
  {
    volumeData,
    dimensions,
    metabolite,
    sliceIndex = 0,

    cursorVoxel = null,
    onVoxelClick = null,

    title = null,

    //  Responsive sizing
    size = 140,      
    maxCanvas = 180, 
  },
  ref,
) {
  const canvasRef = useRef(null);
  const cardRef = useRef(null);

  const [mode, setMode] = useState("clip");
  const [showGrid, setShowGrid] = useState(true);

  const tooltipRef = useRef(null);
  const rafRef = useRef(null);
  const [hover, setHover] = useState(null);

  const [canvasSize, setCanvasSize] = useState(size);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;

    const ro = new ResizeObserver((entries) => {
      const w = entries?.[0]?.contentRect?.width ?? size;
      const s = clamp(Math.floor(w - 24), 80, maxCanvas);
      setCanvasSize(s);
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, [size, maxCanvas]);

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
    if (!sliceValues.length) return { min: 0, max: 0, p2: 0, p50: 0, p95: 0, p98: 0 };
    return {
      min: sliceValues[0],
      max: sliceValues[sliceValues.length - 1],
      p2: percentile(sliceValues, 2),
      p50: percentile(sliceValues, 50),
      p95: percentile(sliceValues, 95),
      p98: percentile(sliceValues, 98),
    };
  }, [sliceValues]);

  const norm = useMemo(() => {
    const eps = 1e-9;
    if (!sliceValues.length) return { lo: 0, hi: 1, log: false };

    if (mode === "auto") {
      const lo = stats.min;
      const hi = stats.max <= stats.min ? stats.min + 1 : stats.max;
      return { lo, hi, log: false };
    }
    if (mode === "log") {
      const lo = Math.max(0, stats.p2);
      const hi = Math.max(lo + eps, stats.p98);
      return { lo, hi, log: true };
    }
    const lo = stats.p2;
    const hi = stats.p98 <= stats.p2 ? stats.p2 + 1 : stats.p98;
    return { lo, hi, log: false };
  }, [mode, sliceValues.length, stats]);

  const exportPNG = (forcedName = null) => {
    const canvas = canvasRef.current;
    if (!canvas) return Promise.resolve(false);

    const filename = forcedName || `heatmap_${metabolite}_z${sliceIndex}.png`;
    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (!blob) return resolve(false);
        downloadBlob(blob, filename);
        resolve(true);
      }, "image/png", 1.0);
    });
  };

  const exportCSV = () => {
    if (!volumeData || !dimensions) return;
    const X = dimensions.X;
    const Y = dimensions.Y;

    let csv = "x,y,z,metabolite,value\n";
    for (let i = 0; i < X; i++) {
      for (let j = 0; j < Y; j++) {
        const key = `${i}_${j}_${sliceIndex}`;
        const v = volumeData[key]?.[metabolite];
        const val = typeof v === "number" && Number.isFinite(v) ? v : 0;
        csv += `${i},${j},${sliceIndex},${metabolite},${val}\n`;
      }
    }
    downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), `heatmap_${metabolite}_z${sliceIndex}.csv`);
  };

  useImperativeHandle(ref, () => ({
    exportPNG,
    getMeta: () => ({ metabolite, sliceIndex }),
  }));

  useEffect(() => {
    if (!volumeData || !dimensions) return;

    const X = dimensions.X;
    const Y = dimensions.Y;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    const width = canvasSize;
    const height = canvasSize;

    canvas.width = width;
    canvas.height = height;

    ctx.clearRect(0, 0, width, height);

    if (!X || !Y) return;

    const cellW = width / X;
    const cellH = height / Y;

    for (let i = 0; i < X; i++) {
      for (let j = 0; j < Y; j++) {
        const key = `${i}_${j}_${sliceIndex}`;
        const raw = volumeData[key]?.[metabolite];
        const rawVal = typeof raw === "number" && Number.isFinite(raw) ? raw : 0;

        let value01 = 0;
        if (norm.log) {
          const a = Math.log1p(Math.max(0, norm.lo));
          const b = Math.log1p(Math.max(0, norm.hi));
          const vv = Math.log1p(Math.max(0, rawVal));
          value01 = b > a ? (vv - a) / (b - a) : 0;
        } else {
          value01 = norm.hi > norm.lo ? (rawVal - norm.lo) / (norm.hi - norm.lo) : 0;
        }

        ctx.fillStyle = colormap(value01);

        const x0 = i * cellW;
        const y0 = height - (j + 1) * cellH;
        ctx.fillRect(x0, y0, cellW, cellH);
      }
    }

    if (showGrid) {
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.strokeStyle = "#111827";
      ctx.lineWidth = 1;
      for (let i = 0; i <= X; i++) {
        const x = i * cellW;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let j = 0; j <= Y; j++) {
        const y = j * cellH;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
      ctx.restore();
    }

    if (
      cursorVoxel &&
      cursorVoxel.x != null &&
      cursorVoxel.y != null &&
      cursorVoxel.z === sliceIndex
    ) {
      const i = clamp(cursorVoxel.x, 0, X - 1);
      const j = clamp(cursorVoxel.y, 0, Y - 1);

      const x0 = i * cellW;
      const y0 = height - (j + 1) * cellH;

      ctx.save();
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 2;
      ctx.strokeRect(x0 + 1, y0 + 1, cellW - 2, cellH - 2);
      ctx.restore();
    }
  }, [
    volumeData,
    dimensions,
    metabolite,
    sliceIndex,
    mode,
    showGrid,
    cursorVoxel,
    norm,
    canvasSize,
  ]);

  const computeHoverFromXY = (clientX, clientY) => {
    const el = canvasRef.current;
    if (!el) return null;
    if (!dimensions || !volumeData) return null;

    const rect = el.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;

    const X = dimensions.X;
    const Y = dimensions.Y;
    if (!X || !Y) return null;

    const cellW = canvasSize / X;
    const cellH = canvasSize / Y;

    const i = clamp(Math.floor(px / cellW), 0, X - 1);
    const jFromTop = clamp(Math.floor(py / cellH), 0, Y - 1);
    const j = Y - 1 - jFromTop;

    const key = `${i}_${j}_${sliceIndex}`;
    const raw = volumeData[key]?.[metabolite];
    const rawVal = typeof raw === "number" && Number.isFinite(raw) ? raw : 0;

    return { x: i, y: j, z: sliceIndex, rawVal, mode, lo: norm.lo, hi: norm.hi };
  };

  const handleCanvasMove = (e) => {
    tooltipRef.current = { clientX: e.clientX, clientY: e.clientY };
    if (rafRef.current) return;

    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const last = tooltipRef.current;
      if (!last) return;
      setHover(computeHoverFromXY(last.clientX, last.clientY));
    });
  };

  const handleCanvasLeave = () => {
    tooltipRef.current = null;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    setHover(null);
  };

  const handleCanvasClick = (e) => {
    if (!onVoxelClick) return;
    const h = computeHoverFromXY(e.clientX, e.clientY);
    if (!h) return;
    onVoxelClick(h.x, h.y, h.z);
  };

  const helpText = MODE_HELP[mode] || "";

  return (
    <div
      ref={cardRef}
      style={{
        width: "100%",
        border: "1px solid var(--border-color)",
        borderRadius: 14,
        padding: 12,
        background: "rgba(255,255,255,0.02)",
      }}
    >
      <div style={{ fontSize: 12, marginBottom: 8, fontWeight: 700 }}>
        {title || `${metabolite} – slice Z=${sliceIndex}`}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto",
          gap: 8,
          alignItems: "center",
          marginBottom: 10,
        }}
      >
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value)}
          style={{
            fontSize: 12,
            padding: "6px 10px",
            borderRadius: 10,
            background: "var(--bg-secondary)",
            color: "var(--text-main)",
            border: "1px solid var(--border-color)",
            width: "100%",
          }}
          title={helpText}
        >
          <option value="clip">Clip p2–p98</option>
          <option value="auto">Auto (min–max)</option>
          <option value="log">Log</option>
        </select>

        <label style={{ fontSize: 12, display: "flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} />
          Grille
        </label>

        <button className="btn-secondary" onClick={() => exportPNG()} style={{ fontSize: 12 }}>
          Export PNG
        </button>
        <button className="btn-secondary" onClick={exportCSV} style={{ fontSize: 12 }}>
          Export CSV
        </button>
      </div>

      <canvas
        ref={canvasRef}
        onClick={handleCanvasClick}
        onMouseMove={handleCanvasMove}
        onMouseLeave={handleCanvasLeave}
        style={{
          width: "100%",         
          maxWidth: maxCanvas,
          aspectRatio: "1 / 1",  
          display: "block",
          margin: "0 auto",
          borderRadius: 12,
          cursor: onVoxelClick ? "pointer" : "default",
        }}
      />

      {hover && (
        <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-muted)" }}>
          ({hover.x},{hover.y},{hover.z}) — raw: <b>{hover.rawVal.toFixed(4)}</b>
        </div>
      )}

      <div style={{ marginTop: 10, fontSize: 11, color: "var(--text-muted)" }}>
        lo: {Number(norm.lo).toFixed(2)} • p95: {Number(stats.p95).toFixed(2)} • hi: {Number(norm.hi).toFixed(2)}
      </div>
    </div>
  );
});

export default MetaboliteHeatmap;