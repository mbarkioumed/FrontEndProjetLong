import React, { useMemo, useState, useEffect, useRef } from "react";
import SliceCanvas from "./SliceCanvas";
import QuantVoxelPanel from "./QuantVoxelPanel";
import CollapsiblePanel from "./CollapsiblePanel";
import SpectrumChart from "./SpectrumChart";
import { getData } from "../utils/dataCache";
import MetaboliteHeatmap from "./MetaboliteHeatmap";
// Helpers orientation 2D
const transpose2D = (m) => {
  if (!m || !m.length) return m;
  const numRows = m.length;
  const numCols = m[0].length;
  const result = [];
  for (let c = 0; c < numCols; c++) {
    const newRow = new Uint8Array(numRows);
    for (let r = 0; r < numRows; r++) newRow[r] = m[r][c];
    result.push(newRow);
  }
  return result;
};
const HEATMAP_METABOLITES = [
  "Cr",
  "PCh",
  "GSH",
  "Glu",
  "NAA",
  "Gln",
  "Lac",
  "mI",
  "Asp",
];

const flipX2D = (m) => m.map((row) => new Uint8Array(row).reverse());
const flipY2D = (m) => [...m].reverse();
const rot90CW2D = (m) => flipX2D(transpose2D(m));
const rot90CCW2D = (m) => flipY2D(transpose2D(m));
const rot1802D = (m) => flipY2D(flipX2D(m));

const orient2D = (m, o = {}) => {
  if (!m) return m;
  let out = m;
  if (o.transpose) out = transpose2D(out);
  if (o.rotate === 90) out = rot90CW2D(out);
  if (o.rotate === -90) out = rot90CCW2D(out);
  if (o.rotate === 180) out = rot1802D(out);
  if (o.flipX) out = flipX2D(out);
  if (o.flipY) out = flipY2D(out);
  return out;
};

const inversePoint = (x, y, width, height, o = {}) => {
  let px = x,
    py = y;
  let w = width,
    h = height;

  if (o.flipY) py = h - 1 - py;
  if (o.flipX) px = w - 1 - px;

  if (o.rotate === 180) {
    px = w - 1 - px;
    py = h - 1 - py;
  } else if (o.rotate === 90) {
    const nx = py;
    const ny = w - 1 - px;
    px = nx;
    py = ny;
    [w, h] = [h, w];
  } else if (o.rotate === -90) {
    const nx = h - 1 - py;
    const ny = px;
    px = nx;
    py = ny;
    [w, h] = [h, w];
  }

  if (o.transpose) {
    const nx = py;
    const ny = px;
    px = nx;
    py = ny;
    [w, h] = [h, w];
  }

  return { x: px, y: py };
};

const forwardPoint = (x, y, width, height, o = {}) => {
  let px = x,
    py = y;
  let w = width,
    h = height;

  if (o.transpose) {
    const nx = py;
    const ny = px;
    px = nx;
    py = ny;
    [w, h] = [h, w];
  }

  if (o.rotate === 90) {
    const nx = h - 1 - py;
    const ny = px;
    px = nx;
    py = ny;
    [w, h] = [h, w];
  } else if (o.rotate === -90) {
    const nx = py;
    const ny = w - 1 - px;
    px = nx;
    py = ny;
    [w, h] = [h, w];
  } else if (o.rotate === 180) {
    px = w - 1 - px;
    py = h - 1 - py;
  }

  if (o.flipX) px = w - 1 - px;
  if (o.flipY) py = h - 1 - py;

  return { x: px, y: py };
};

const ORIENTATION_DEFAULTS = {
  sagittal: { flipY: false, flipX: false, rotate: -90, transpose: false },
  coronal: { flipY: false, flipX: true, rotate: -90, transpose: false },
  axial: { flipY: false, flipX: false, rotate: 90, transpose: false },
};

// ─── VoxelQuantInline ───────────────────────────────────────────────────────
// Analyse gliome complète inline sous le spectre

// Seuils cliniques gliome (littérature neuro-oncologie MRS)
// Sources : Howe 2003, Law 2008, Horska 2011, McKnight 2002
const GLIOMA_THRESHOLDS = {
  "Cho/NAA": [
    { max: 1.0,  label: "Normal",        color: "#22c55e", bg: "rgba(34,197,94,0.12)"  },
    { max: 1.5,  label: "Limite",         color: "#f59e0b", bg: "rgba(245,158,11,0.12)" },
    { max: 2.5,  label: "Suspect HG",    color: "#f97316", bg: "rgba(249,115,22,0.12)" },
    { max: Infinity, label: "Haut grade",color: "#ef4444", bg: "rgba(239,68,68,0.15)"  },
  ],
  "Cho/Cr": [
    { max: 1.2,  label: "Normal",        color: "#22c55e", bg: "rgba(34,197,94,0.12)"  },
    { max: 1.5,  label: "Limite",         color: "#f59e0b", bg: "rgba(245,158,11,0.12)" },
    { max: 2.0,  label: "Suspect",       color: "#f97316", bg: "rgba(249,115,22,0.12)" },
    { max: Infinity, label: "Tumoral",   color: "#ef4444", bg: "rgba(239,68,68,0.15)"  },
  ],
  "NAA/Cr": [
    { max: 0.8,  label: "Perte neuronale", color: "#ef4444", bg: "rgba(239,68,68,0.15)" },
    { max: 1.2,  label: "Réduit",          color: "#f97316", bg: "rgba(249,115,22,0.12)"},
    { max: Infinity, label: "Normal",      color: "#22c55e", bg: "rgba(34,197,94,0.12)" },
  ],
  "Lac/Cr": [
    { max: 0.1,  label: "Normal",        color: "#22c55e", bg: "rgba(34,197,94,0.12)"  },
    { max: 0.3,  label: "Discret",       color: "#f59e0b", bg: "rgba(245,158,11,0.12)" },
    { max: Infinity, label: "Nécrose/HG",color: "#ef4444", bg: "rgba(239,68,68,0.15)"  },
  ],
  "mI/Cr": [
    { max: 0.4,  label: "Normal",        color: "#22c55e", bg: "rgba(34,197,94,0.12)"  },
    { max: 0.7,  label: "Élevé",         color: "#f59e0b", bg: "rgba(245,158,11,0.12)" },
    { max: Infinity, label: "Gliose",    color: "#f97316", bg: "rgba(249,115,22,0.12)" },
  ],
};

// Score de malignité : somme pondérée des ratios pathologiques
function computeGliomaScore(ratioMap) {
  let score = 0;
  let total = 0;
  // Cho/NAA : marqueur principal (poids 3)
  if (ratioMap["Cho/NAA"] != null) {
    const v = ratioMap["Cho/NAA"];
    score += Math.min(v / 2.5, 1) * 3;
    total += 3;
  }
  // Cho/Cr (poids 2)
  if (ratioMap["Cho/Cr"] != null) {
    score += Math.min(ratioMap["Cho/Cr"] / 2.0, 1) * 2;
    total += 2;
  }
  // NAA/Cr inversé (baisse = mauvais, poids 2)
  if (ratioMap["NAA/Cr"] != null) {
    score += Math.max(0, 1 - ratioMap["NAA/Cr"] / 1.5) * 2;
    total += 2;
  }
  // Lac/Cr (poids 1.5)
  if (ratioMap["Lac/Cr"] != null) {
    score += Math.min(ratioMap["Lac/Cr"] / 0.3, 1) * 1.5;
    total += 1.5;
  }
  if (total === 0) return null;
  return score / total; // 0→1
}

function getThreshold(ratioLabel, value) {
  const thr = GLIOMA_THRESHOLDS[ratioLabel];
  if (!thr) return null;
  return thr.find((t) => value <= t.max) || thr[thr.length - 1];
}

const RATIOS_DEF = [
  { label: "Cho/NAA", a: ["Cho", "PCh"], b: ["NAA"]       },
  { label: "Cho/Cr",  a: ["Cho", "PCh"], b: ["Cr"]        },
  { label: "NAA/Cr",  a: ["NAA"],        b: ["Cr"]        },
  { label: "Lac/Cr",  a: ["Lac"],        b: ["Cr"]        },
  { label: "mI/Cr",   a: ["mI"],         b: ["Cr"]        },
  { label: "Glx/Cr",  a: ["Glu", "Gln"], b: ["Cr"]       },
];

function VoxelQuantInline({ quant, voxel, method }) {
  if (!quant) return null;

  const get = (names) => {
    let sum = 0, found = false;
    for (const n of names) {
      const v = quant[n];
      if (typeof v === "number" && Number.isFinite(v) && v > 0) { sum += v; found = true; }
    }
    return found ? sum : null;
  };

  // Calcul de tous les ratios
  const ratios = RATIOS_DEF.map(({ label, a, b }) => {
    const va = get(a);
    const vb = get(b);
    if (va == null || vb == null || vb < 1e-9) return null;
    return { label, v: va / vb };
  }).filter(Boolean);

  const ratioMap = Object.fromEntries(ratios.map((r) => [r.label, r.v]));

  // Score de malignité global
  const gliomaScore = computeGliomaScore(ratioMap);
  const scoreLabel = gliomaScore == null ? null
    : gliomaScore < 0.25 ? { text: "Profil normal",     color: "#22c55e", bar: "#22c55e" }
    : gliomaScore < 0.50 ? { text: "Suspect bas grade", color: "#f59e0b", bar: "#f59e0b" }
    : gliomaScore < 0.75 ? { text: "Suspect haut grade",color: "#f97316", bar: "#f97316" }
    :                      { text: "Haut grade probable",color: "#ef4444", bar: "#ef4444" };

  // Top 6 métabolites
  const top = Object.entries(quant)
    .map(([k, v]) => ({ k, v: Number(v) }))
    .filter((r) => Number.isFinite(r.v) && r.v > 1e-6)
    .sort((a, b) => b.v - a.v)
    .slice(0, 6);
  const vmax = top[0]?.v || 1;

  return (
    <div style={{ padding: "10px 12px", borderTop: "1px solid var(--border-color)", fontSize: 12 }}>

      {/* Header voxel + méthode */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 4 }}>
        {voxel && (
          <span style={{ fontWeight: 700, color: "#60a5fa" }}>
            📍 ({voxel.x ?? "?"}, {voxel.y ?? "?"}, {voxel.z ?? "?"})
          </span>
        )}
        {method && (
          <span style={{ fontSize: 10, color: "var(--text-muted)", background: "rgba(255,255,255,0.06)", padding: "2px 6px", borderRadius: 6 }}>
            {method}
          </span>
        )}
      </div>

      {/* ── Score de malignité gliome ── */}
      {scoreLabel && (
        <div style={{
          marginBottom: 12,
          padding: "8px 10px",
          borderRadius: 10,
          border: `1px solid ${scoreLabel.color}55`,
          background: `${scoreLabel.color}11`,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
            <span style={{ fontWeight: 700, fontSize: 11, color: scoreLabel.color, letterSpacing: "0.03em" }}>
              🧠 Score gliome
            </span>
            <span style={{ fontWeight: 800, fontSize: 12, color: scoreLabel.color }}>
              {scoreLabel.text}
            </span>
          </div>
          {/* Barre de progression */}
          <div style={{ height: 6, borderRadius: 999, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
            <div style={{
              width: `${gliomaScore * 100}%`,
              height: "100%",
              borderRadius: 999,
              background: `linear-gradient(90deg, #22c55e, #f59e0b, #ef4444)`,
              transition: "width 0.4s ease",
            }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "rgba(148,163,184,0.6)", marginTop: 2 }}>
            <span>Normal</span><span>Bas grade</span><span>Haut grade</span>
          </div>
        </div>
      )}

      {/* ── Ratios avec seuils colorés ── */}
      {ratios.length > 0 && (
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 10 }}>
          {ratios.map((r) => {
            const thr = getThreshold(r.label, r.v);
            return (
              <div key={r.label} style={{
                padding: "4px 8px",
                borderRadius: 8,
                border: `1px solid ${thr ? thr.color + "55" : "var(--border-color)"}`,
                background: thr ? thr.bg : "rgba(255,255,255,0.04)",
                textAlign: "center",
                minWidth: 68,
                flex: "1 1 68px",
              }}>
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 1 }}>{r.label}</div>
                <div style={{ fontWeight: 800, fontSize: 13, color: thr ? thr.color : "var(--text-main)" }}>
                  {r.v.toFixed(3)}
                </div>
                {thr && (
                  <div style={{ fontSize: 9, color: thr.color, marginTop: 1, fontWeight: 600 }}>
                    {thr.label}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Top métabolites ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {top.map((r) => {
          const pct = Math.max(0, Math.min(1, r.v / vmax));
          return (
            <div key={r.k} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 32, fontSize: 11, fontWeight: 600, color: "var(--text-main)" }}>{r.k}</span>
              <div style={{ flex: 1, height: 6, borderRadius: 999, background: "rgba(255,255,255,0.08)" }}>
                <div style={{
                  width: `${pct * 100}%`,
                  height: "100%",
                  borderRadius: 999,
                  background: "linear-gradient(90deg, #3b82f6, #06b6d4)",
                }} />
              </div>
              <span style={{ width: 52, textAlign: "right", fontSize: 11, fontVariantNumeric: "tabular-nums", color: "var(--text-muted)" }}>
                {r.v.toFixed(4)}
              </span>
            </div>
          );
        })}
      </div>

      {/* ── Note clinique contextuelle ── */}
      {gliomaScore != null && gliomaScore >= 0.5 && (
        <div style={{
          marginTop: 10,
          padding: "6px 8px",
          borderRadius: 8,
          background: "rgba(239,68,68,0.07)",
          border: "1px solid rgba(239,68,68,0.2)",
          fontSize: 10,
          color: "rgba(239,68,68,0.85)",
          lineHeight: 1.4,
        }}>
          ⚠️ Cho/NAA élevé + NAA réduit évoque une lésion de haut grade. Corrélation anatomique recommandée.
        </div>
      )}
      {gliomaScore != null && gliomaScore >= 0.25 && gliomaScore < 0.5 && (
        <div style={{
          marginTop: 10,
          padding: "6px 8px",
          borderRadius: 8,
          background: "rgba(245,158,11,0.07)",
          border: "1px solid rgba(245,158,11,0.2)",
          fontSize: 10,
          color: "rgba(245,158,11,0.85)",
          lineHeight: 1.4,
        }}>
          ⚡ Profil intermédiaire. Suivi spectroscopique recommandé.
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
const IrmCard = ({
  irmData,
  mrsiData,
  cardId,
  isActive,
  onSelect,
  onDuplicate,
  onDelete,
  onDeleteVersion,
  renderUploadForm: renderUploadFormProp,
  onFetchSpectrum,
  job,
  maskData,
  irmHistory = [],
  mrsiHistory = [],
  onSelectIrmVersion,
  onSelectMrsiVersion,
  irmLayers = [],
  onUpdateLayer,
  onUpdateMrsiData,
  onVoxelSelect,   // ← NEW: called with {x,y,z} whenever user clicks a voxel
}) => {
  const [isOpen, setIsOpen] = useState(true);
  const renderUpload =
    typeof renderUploadFormProp === "function"
      ? renderUploadFormProp
      : (type, id) => (
          <div
            style={{
              padding: "0.75rem",
              borderRadius: 10,
              border: "1px dashed var(--border-color)",
              color: "var(--text-muted)",
              fontSize: 12,
              textAlign: "center",
            }}
          >
            Upload indisponible : renderUploadForm n’a pas été passé à IrmCard
            <br />
            <b>{type}</b> — card <b>{id}</b>
          </div>
        );
  // Focus modal state
  const [focusedView, setFocusedView] = useState(null);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") setFocusedView(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // --- IRM STATE ---
  const [sliceIndices, setSliceIndices] = useState({
    sagittal: 0,
    coronal: 0,
    axial: 0,
  });
  const [cursor3D, setCursor3D] = useState({ x: null, y: null, z: null });
  const [prevIrmData, setPrevIrmData] = useState(null);

  // --- MRSI STATE ---
  const [mrsiSliceIndex, setMrsiSliceIndex] = useState(0);
  const [selectedVoxel, setSelectedVoxel] = useState(null);
  const [currentSpectrum, setCurrentSpectrum] = useState(null);

  // --- FUSION STATE ---
  const [fusionData, setFusionData] = useState(null);
  const [fusionOpacity, setFusionOpacity] = useState(0.5);
  const [forceCenter, setForceCenter] = useState(true);
  const [fusionChannel, setFusionChannel] = useState("");
  const [isFusing, setIsFusing] = useState(false);
  const [fusionError, setFusionError] = useState(null);

  const irmVersionKey = irmData?.__versionId || "none";
  const mrsiVersionKey = mrsiData?.__versionId || "none";

  // Sync selectedVoxel ONLY when MRSI version changes (new data loaded)
  // Using a ref to track previous version so this never fires on click
  const prevMrsiVersionKeyRef = useRef(mrsiVersionKey);
  useEffect(() => {
    const prevKey = prevMrsiVersionKeyRef.current;
    if (mrsiVersionKey !== prevKey) {
      prevMrsiVersionKeyRef.current = mrsiVersionKey;

      // Reset slice index from MRSI shape or voxel
      if (mrsiData?.shape) setMrsiSliceIndex(Math.floor(mrsiData.shape[2] / 2));
      else setMrsiSliceIndex(0);

      // Init heatmap slice from voxel.z if available
      const vz = mrsiData?.voxel?.z;
      if (typeof vz === "number" && Number.isFinite(vz)) setHeatmapSlice(vz);

      // Init selectedVoxel from new mrsiData
      if (
        mrsiData?.voxel?.x != null &&
        mrsiData?.voxel?.y != null &&
        mrsiData?.voxel?.z != null
      ) {
        setSelectedVoxel(mrsiData.voxel);
        setCurrentSpectrum(null);
      } else {
        setSelectedVoxel(null);
        setCurrentSpectrum(null);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mrsiVersionKey]);

  const [heatmapSlice, setHeatmapSlice] = useState(0);
  const [histMetabolite, setHistMetabolite] = useState(HEATMAP_METABOLITES[0]);
  const [spectrumPanelOpen, setSpectrumPanelOpen] = useState(true);

  // For MRSI_VOLUME: derive the quantification of the currently selected voxel
  const selectedVoxelQuant = useMemo(() => {
    if (mrsiData?.type !== "MRSI_VOLUME" || !mrsiData?.quantification) return null;
    const v = selectedVoxel;
    if (!v || v.x == null || v.y == null || v.z == null) return null;
    const key = `${v.x}_${v.y}_${v.z}`;
    return mrsiData.quantification[key] || null;
  }, [mrsiData?.type, mrsiData?.quantification, selectedVoxel]);

  const heatmapRefs = useRef({}); // { Cr: instance, ... }

  const setHeatmapRef = (m) => (instance) => {
    if (instance) heatmapRefs.current[m] = instance;
    else delete heatmapRefs.current[m];
  };
  const exportAllHeatmapsPNG = async () => {
    const z = heatmapSlice;

    for (const m of HEATMAP_METABOLITES) {
      const r = heatmapRefs.current[m];
      if (r?.exportPNG) {
        await r.exportPNG(`card${cardId}_heatmap_${m}_z${z}.png`);
        await new Promise((res) => setTimeout(res, 120));
      }
    }
  };
  useEffect(() => {
    if (irmData !== prevIrmData) {
      setPrevIrmData(irmData);

      if (irmData?.shape) {
        const centerX = Math.floor(irmData.shape[0] / 2);
        const centerY = Math.floor(irmData.shape[1] / 2);
        const centerZ = Math.floor(irmData.shape[2] / 2);

        setSliceIndices({
          sagittal: centerX,
          coronal: centerY,
          axial: centerZ,
        });
        setCursor3D({ x: centerX, y: centerY, z: centerZ });
      } else {
        setSliceIndices({ sagittal: 0, coronal: 0, axial: 0 });
        setCursor3D({ x: null, y: null, z: null });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [irmData, irmVersionKey]);

  const orientIRM = ORIENTATION_DEFAULTS;

  // --- MEMOIZED IRM SLICES ---
  const sagOriented = useMemo(() => {
    const vol = getData(irmData?.dataRef);
    if (!vol || !irmData?.shape) return null;
    const [X, Y, Z] = irmData.shape;
    const sx = sliceIndices.sagittal;
    if (sx < 0 || sx >= X) return null;
    const slice = [];
    for (let y = 0; y < Y; y++) {
      const offset = sx * Y * Z + y * Z;
      slice.push(vol.subarray(offset, offset + Z));
    }
    return orient2D(slice, orientIRM.sagittal);
  }, [irmData?.dataRef, irmData?.shape, sliceIndices.sagittal]);

  const corOriented = useMemo(() => {
    const vol = getData(irmData?.dataRef);
    if (!vol || !irmData?.shape) return null;
    const [X, Y, Z] = irmData.shape;
    const sy = sliceIndices.coronal;
    if (sy < 0 || sy >= Y) return null;
    const slice = [];
    for (let x = 0; x < X; x++) {
      const row = new Uint8Array(Z);
      for (let z = 0; z < Z; z++) row[z] = vol[x * Y * Z + sy * Z + z];
      slice.push(row);
    }
    return orient2D(slice, orientIRM.coronal);
  }, [irmData?.dataRef, irmData?.shape, sliceIndices.coronal]);

  const axOriented = useMemo(() => {
    const vol = getData(irmData?.dataRef);
    if (!vol || !irmData?.shape) return null;
    const [X, Y, Z] = irmData.shape;
    const sz = sliceIndices.axial;
    if (sz < 0 || sz >= Z) return null;
    const slice = [];
    for (let x = 0; x < X; x++) {
      const row = new Uint8Array(Y);
      for (let y = 0; y < Y; y++) row[y] = vol[x * Y * Z + y * Z + sz];
      slice.push(row);
    }
    return orient2D(slice, orientIRM.axial);
  }, [irmData?.dataRef, irmData?.shape, sliceIndices.axial]);

  // --- MULTI-LAYER SLICES ---
  const hasLayers = irmLayers.length > 1;

  const sagLayerSlices = useMemo(() => {
    if (!hasLayers) return null;
    return irmLayers
      .filter((l) => l.visible)
      .map((layer) => {
        const vol = getData(layer.data?.dataRef);
        if (!vol || !layer.data?.shape)
          return {
            data2D: null,
            opacity: layer.opacity,
            color: layer.color,
          };
        const [X, Y, Z] = layer.data.shape;
        const sx = sliceIndices.sagittal;
        if (sx < 0 || sx >= X)
          return {
            data2D: null,
            opacity: layer.opacity,
            color: layer.color,
          };
        const slice = [];
        for (let y = 0; y < Y; y++) {
          const offset = sx * Y * Z + y * Z;
          slice.push(vol.subarray(offset, offset + Z));
        }
        return {
          data2D: orient2D(slice, orientIRM.sagittal),
          opacity: layer.opacity,
          color: layer.color,
        };
      });
  }, [hasLayers, irmLayers, sliceIndices.sagittal]);

  const corLayerSlices = useMemo(() => {
    if (!hasLayers) return null;
    return irmLayers
      .filter((l) => l.visible)
      .map((layer) => {
        const vol = getData(layer.data?.dataRef);
        if (!vol || !layer.data?.shape)
          return {
            data2D: null,
            opacity: layer.opacity,
            color: layer.color,
          };
        const [X, Y, Z] = layer.data.shape;
        const sy = sliceIndices.coronal;
        if (sy < 0 || sy >= Y)
          return {
            data2D: null,
            opacity: layer.opacity,
            color: layer.color,
          };
        const slice = [];
        for (let x = 0; x < X; x++) {
          const row = new Uint8Array(Z);
          for (let z = 0; z < Z; z++) row[z] = vol[x * Y * Z + sy * Z + z];
          slice.push(row);
        }
        return {
          data2D: orient2D(slice, orientIRM.coronal),
          opacity: layer.opacity,
          color: layer.color,
        };
      });
  }, [hasLayers, irmLayers, sliceIndices.coronal]);

  const axLayerSlices = useMemo(() => {
    if (!hasLayers) return null;
    return irmLayers
      .filter((l) => l.visible)
      .map((layer) => {
        const vol = getData(layer.data?.dataRef);
        if (!vol || !layer.data?.shape)
          return {
            data2D: null,
            opacity: layer.opacity,
            color: layer.color,
          };
        const [X, Y, Z] = layer.data.shape;
        const sz = sliceIndices.axial;
        if (sz < 0 || sz >= Z)
          return {
            data2D: null,
            opacity: layer.opacity,
            color: layer.color,
          };
        const slice = [];
        for (let x = 0; x < X; x++) {
          const row = new Uint8Array(Y);
          for (let y = 0; y < Y; y++) row[y] = vol[x * Y * Z + y * Z + sz];
          slice.push(row);
        }
        return {
          data2D: orient2D(slice, orientIRM.axial),
          opacity: layer.opacity,
          color: layer.color,
        };
      });
  }, [hasLayers, irmLayers, sliceIndices.axial]);

  // MASK SLICES
  const maskSagOriented = useMemo(() => {
    const vol = getData(maskData?.dataRef);
    if (!vol || !maskData?.shape) return null;
    const [X, Y, Z] = maskData.shape;
    const sx = sliceIndices.sagittal;
    if (sx < 0 || sx >= X) return null;
    const slice = [];
    for (let y = 0; y < Y; y++) {
      const offset = sx * Y * Z + y * Z;
      slice.push(vol.subarray(offset, offset + Z));
    }
    return orient2D(slice, orientIRM.sagittal);
  }, [maskData?.dataRef, maskData?.shape, sliceIndices.sagittal]);

  const maskCorOriented = useMemo(() => {
    const vol = getData(maskData?.dataRef);
    if (!vol || !maskData?.shape) return null;
    const [X, Y, Z] = maskData.shape;
    const sy = sliceIndices.coronal;
    if (sy < 0 || sy >= Y) return null;
    const slice = [];
    for (let x = 0; x < X; x++) {
      const row = new Uint8Array(Z);
      for (let z = 0; z < Z; z++) row[z] = vol[x * Y * Z + sy * Z + z];
      slice.push(row);
    }
    return orient2D(slice, orientIRM.coronal);
  }, [maskData?.dataRef, maskData?.shape, sliceIndices.coronal]);

  const maskAxOriented = useMemo(() => {
    const vol = getData(maskData?.dataRef);
    if (!vol || !maskData?.shape) return null;
    const [X, Y, Z] = maskData.shape;
    const sz = sliceIndices.axial;
    if (sz < 0 || sz >= Z) return null;
    const slice = [];
    for (let x = 0; x < X; x++) {
      const row = new Uint8Array(Y);
      for (let y = 0; y < Y; y++) row[y] = vol[x * Y * Z + y * Z + sz];
      slice.push(row);
    }
    return orient2D(slice, orientIRM.axial);
  }, [maskData?.dataRef, maskData?.shape, sliceIndices.axial]);

  // dims
  const sliceDims = useMemo(() => {
    if (!irmData?.shape) return null;
    const [X, Y, Z] = irmData.shape;
    const sagDispW = sagOriented?.[0]?.length ?? 0;
    const sagDispH = sagOriented?.length ?? 0;
    const corDispW = corOriented?.[0]?.length ?? 0;
    const corDispH = corOriented?.length ?? 0;
    const axDispW = axOriented?.[0]?.length ?? 0;
    const axDispH = axOriented?.length ?? 0;
    return {
      sagW: Z,
      sagH: Y,
      corW: Z,
      corH: X,
      axW: Y,
      axH: X,
      sagDispW,
      sagDispH,
      corDispW,
      corDispH,
      axDispW,
      axDispH,
    };
  }, [irmData?.shape, sagOriented, corOriented, axOriented]);

  // --- FUSION HANDLER ---
  const handleFusionClick = async () => {
    if (!irmData || !mrsiData) return;
    setIsFusing(true);
    setFusionError(null);
    try {
      const mriName = irmData.nom_fichier || irmData.nom;
      const mrsiName = mrsiData.nom;

      let url = `http://127.0.0.1:8000/fusion/?mri=${encodeURIComponent(
        mriName,
      )}&mrsi=${encodeURIComponent(mrsiName)}&force_center=${forceCenter}`;
      if (fusionChannel !== "") url += `&channel=${fusionChannel}`;

      const res = await fetch(url);
      const json = await res.json();
      if (json.error) throw new Error(json.error);

      const binaryString = window.atob(json.data_b64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);

      setFusionData({
        ...json,
        data_uint8: bytes,
        transform_matrix: json.transform_matrix,
      });
    } catch (e) {
      console.error("Fusion error", e);
      setFusionError(e.message);
    } finally {
      setIsFusing(false);
    }
  };

  // --- MEMOIZED FUSION SLICES ---
  const fusionSag = useMemo(() => {
    if (!fusionData || !fusionData.data_uint8 || !irmData?.shape) return null;
    const vol = fusionData.data_uint8;
    const [X, Y, Z] = irmData.shape;
    const sx = sliceIndices.sagittal;
    if (sx < 0 || sx >= X) return null;
    if (vol.length !== X * Y * Z) return null;

    const slice = [];
    for (let y = 0; y < Y; y++) {
      const offset = sx * Y * Z + y * Z;
      slice.push(vol.subarray(offset, offset + Z));
    }
    return orient2D(slice, orientIRM.sagittal);
  }, [fusionData, irmData?.shape, sliceIndices.sagittal]);

  const fusionCor = useMemo(() => {
    if (!fusionData || !fusionData.data_uint8 || !irmData?.shape) return null;
    const vol = fusionData.data_uint8;
    const [X, Y, Z] = irmData.shape;
    const sy = sliceIndices.coronal;
    if (sy < 0 || sy >= Y) return null;

    const slice = [];
    for (let x = 0; x < X; x++) {
      const row = new Uint8Array(Z);
      for (let z = 0; z < Z; z++) row[z] = vol[x * Y * Z + sy * Z + z];
      slice.push(row);
    }
    return orient2D(slice, orientIRM.coronal);
  }, [fusionData, irmData?.shape, sliceIndices.coronal]);

  const fusionAx = useMemo(() => {
    if (!fusionData || !fusionData.data_uint8 || !irmData?.shape) return null;
    const vol = fusionData.data_uint8;
    const [X, Y, Z] = irmData.shape;
    const sz = sliceIndices.axial;
    if (sz < 0 || sz >= Z) return null;

    const slice = [];
    for (let x = 0; x < X; x++) {
      const row = new Uint8Array(Y);
      for (let y = 0; y < Y; y++) row[y] = vol[x * Y * Z + y * Z + sz];
      slice.push(row);
    }
    return orient2D(slice, orientIRM.axial);
  }, [fusionData, irmData?.shape, sliceIndices.axial]);

  const safeNum = (v) => (typeof v === "number" ? v : null);

  const crosshairXY = (plane, sliceW, sliceH, xOrig, yOrig) => {
    const x = safeNum(xOrig);
    const y = safeNum(yOrig);
    if (x == null || y == null) return { x: null, y: null };
    const o = orientIRM[plane] || {};
    return forwardPoint(x, y, sliceW, sliceH, o);
  };

  const handleVoxelClick = async (xVal, yVal, zVal = null) => {
    if (!mrsiData?.nom) {
      console.warn("[handleVoxelClick] mrsiData.nom manquant, abandon");
      return;
    }
    const shp = mrsiData?.shape || [
      mrsiData?.dimensions?.X || 64,
      mrsiData?.dimensions?.Y || 64,
      mrsiData?.dimensions?.Z || 32,
    ];
    const [X, Y, Z] = shp;

    const x = Math.max(0, Math.min(Math.round(xVal), X - 1));
    const y = Math.max(0, Math.min(Math.round(yVal), Y - 1));
    const z = zVal !== null
      ? Math.max(0, Math.min(Math.round(zVal), Z - 1))
      : mrsiSliceIndex;

    console.log(`[handleVoxelClick] voxel → (${x}, ${y}, ${z})`);

    setMrsiSliceIndex(z);
    setHeatmapSlice(z);
    setSelectedVoxel({ x, y, z });
    onVoxelSelect?.({ x, y, z });

    if (onFetchSpectrum) {
      try {
        const data = await onFetchSpectrum(mrsiData.nom, x, y, z);
        if (data && data.spectrum) setCurrentSpectrum(data);
      } catch(e) {
        console.error("[handleVoxelClick] fetchSpectrum error", e);
      }
    }
  };

  const handleSelectCard = () => {
    onSelect?.();
  };

  const currentIrmVersion = irmData?.__versionId || "base";
  const currentMrsiVersion = mrsiData?.__versionId || "base";

  const activeIrmVersion = useMemo(() => {
    if (!irmHistory?.length) return null;
    return irmHistory.find((v) => v.id === currentIrmVersion) || null;
  }, [irmHistory, currentIrmVersion]);

  const irmParamsText = useMemo(() => {
    if (!activeIrmVersion?.params) return null;
    return Object.entries(activeIrmVersion.params)
      .map(([k, v]) => `${k}: ${v}`)
      .join(" | ");
  }, [activeIrmVersion]);

  const activeMrsiVersion = useMemo(() => {
    if (!mrsiHistory?.length) return null;
    return mrsiHistory.find((v) => v.id === currentMrsiVersion) || null;
  }, [mrsiHistory, currentMrsiVersion]);

  const mrsiParamsText = useMemo(() => {
    if (!activeMrsiVersion?.params) return null;
    return Object.entries(activeMrsiVersion.params)
      .map(([k, v]) => `${k}: ${v}`)
      .join(" | ");
  }, [activeMrsiVersion]);

  if (!irmData && !mrsiData) {
    return (
      <div
        className={`card irm-card ${isActive ? "active" : ""}`}
        onClick={handleSelectCard}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSelectCard();
        }}
        style={{ cursor: onSelect ? "pointer" : "default" }}
      >
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            className="btn-secondary"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(cardId);
            }}
            style={{ color: "var(--danger)" }}
          >
            Supprimer
          </button>
        </div>

        <h3>Nouvelle Carte</h3>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "1rem",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div>{renderUpload("IRM", cardId)}</div>
          <div>{renderUpload("MRSI", cardId)}</div>
        </div>
      </div>
    );
  }
  const {
    sagW,
    sagH,
    corW,
    corH,
    axW,
    axH,
    sagDispW,
    sagDispH,
    corDispW,
    corDispH,
    axDispW,
    axDispH,
  } = sliceDims || {};

  return (
    <>
      <div
        className={`card irm-card ${isActive ? "active" : ""}`}
        onClick={handleSelectCard}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSelectCard();
        }}
        style={{
          cursor: onSelect ? "pointer" : "default",
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                cursor: "pointer",
                fontSize: 14,
                marginRight: 8,
                userSelect: "none",
              }}
              onClick={(e) => {
                e.stopPropagation();
                setIsOpen(!isOpen);
              }}
              title={isOpen ? "Réduire" : "Développer"}
            >
              {isOpen ? "▼" : "▶"}
            </span>

            <h2 style={{ margin: 0 }}>
              {irmData ? `IRM: ${irmData.nom_fichier}` : ""}
              {irmData && mrsiData ? " | " : ""}
              {mrsiData ? `MRSI: ${mrsiData.nom}` : ""}
            </h2>
          </div>

          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              className="btn-secondary"
              onClick={(e) => {
                e.stopPropagation();
                onDuplicate();
              }}
            >
              Dupliquer
            </button>
            <button
              className="btn-secondary"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(cardId);
              }}
              style={{ color: "var(--danger)" }}
            >
              Supprimer
            </button>
          </div>
        </div>

        {isOpen && (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
          >
            {/* Versions + Fusion */}
            <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
              <div
                style={{
                  background: "var(--bg-secondary)",
                  borderRadius: 8,
                  padding: "0.5rem 0.75rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.75rem",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                  flex: "1 1 0",
                  minWidth: 0,
                }}
              >
                {irmData && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      IRM version:
                    </span>
                    <select
                      className="form-select"
                      style={{
                        padding: "0.4rem 0.6rem",
                        borderRadius: 10,
                        fontSize: 12,
                        width: 220,
                      }}
                      value={currentIrmVersion}
                      onChange={(e) => onSelectIrmVersion?.(e.target.value)}
                    >
                      {(irmHistory?.length
                        ? irmHistory
                        : [{ id: "base", label: "Original" }]
                      ).map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.label || v.id}
                        </option>
                      ))}
                    </select>

                    {currentIrmVersion !== "base" && (
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteVersion?.("IRM", currentIrmVersion);
                        }}
                        style={{
                          cursor: "pointer",
                          color: "var(--danger)",
                          fontWeight: "bold",
                          fontSize: 16,
                          paddingLeft: 4,
                        }}
                        title="Supprimer cette version"
                      >
                        X
                      </span>
                    )}

                    {irmParamsText && (
                      <span
                        style={{
                          fontSize: 13,
                          color: "var(--text-muted)",
                          maxWidth: 400,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                        title={irmParamsText}
                      >
                        {irmParamsText}
                      </span>
                    )}
                  </div>
                )}

                {mrsiData && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      MRSI version:
                    </span>
                    <select
                      className="form-select"
                      style={{
                        padding: "0.4rem 0.6rem",
                        borderRadius: 10,
                        fontSize: 12,
                        width: 220,
                      }}
                      value={currentMrsiVersion}
                      onChange={(e) => onSelectMrsiVersion?.(e.target.value)}
                    >
                      {(mrsiHistory?.length
                        ? mrsiHistory
                        : [{ id: "base", label: "Original" }]
                      ).map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.label || v.id}
                        </option>
                      ))}
                    </select>

                    {currentMrsiVersion !== "base" && (
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteVersion?.("MRSI", currentMrsiVersion);
                        }}
                        style={{
                          cursor: "pointer",
                          color: "var(--danger)",
                          fontWeight: "bold",
                          fontSize: 16,
                          paddingLeft: 4,
                        }}
                        title="Supprimer cette version"
                      >
                        X
                      </span>
                    )}

                    {mrsiParamsText && (
                      <span
                        style={{
                          fontSize: 13,
                          color: "var(--text-muted)",
                          maxWidth: 400,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                        title={mrsiParamsText}
                      >
                        {mrsiParamsText}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {irmData && mrsiData && (
                <div
                  style={{
                    background: "var(--bg-secondary)",
                    borderRadius: 8,
                    padding: "0.5rem 0.75rem",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.75rem",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                    flex: "1 1 0",
                    minWidth: 0,
                    alignSelf: "flex-start",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <strong style={{ fontSize: 13, marginBottom: 4 }}>
                      Fusion MRI-MRSI
                    </strong>

                    <button
                      className="btn-primary"
                      onClick={handleFusionClick}
                      disabled={isFusing}
                      style={{ fontSize: 12, padding: "0.3rem 0.5rem" }}
                    >
                      {isFusing
                        ? "Fusion en cours..."
                        : "Générer / Mettre à jour"}
                    </button>
                  </div>

                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.3rem",
                      fontSize: 12,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={forceCenter}
                      onChange={(e) => setForceCenter(e.target.checked)}
                    />
                    Force Center
                  </label>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.3rem",
                      fontSize: 12,
                    }}
                  >
                    <span>Metabolite Index:</span>
                    <input
                      type="number"
                      min="0"
                      placeholder="All"
                      value={fusionChannel}
                      onChange={(e) => setFusionChannel(e.target.value)}
                      style={{ width: "60px", padding: "0.2rem", fontSize: 12 }}
                    />
                  </div>

                  {fusionData && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.3rem",
                        fontSize: 12,
                      }}
                    >
                      <span>Opacité:</span>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={fusionOpacity}
                        onChange={(e) =>
                          setFusionOpacity(parseFloat(e.target.value))
                        }
                        style={{ flex: 1 }}
                      />
                      <span>{Math.round(fusionOpacity * 100)}%</span>
                    </div>
                  )}

                  {fusionError && (
                    <div style={{ color: "var(--danger)", fontSize: 11 }}>
                      {fusionError}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Layers */}
            {hasLayers && onUpdateLayer && (
              <div
                style={{
                  marginTop: "0.75rem",
                  padding: "0.75rem 1rem",
                  borderRadius: 12,
                  border: "1px solid var(--border-color)",
                  background: "rgba(255,255,255,0.02)",
                  overflowX: "auto",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <strong
                  style={{
                    fontSize: 13,
                    display: "block",
                    marginBottom: 8,
                  }}
                >
                  🎨 Couches IRM ({irmLayers.length})
                </strong>

                <div
                  style={{
                    display: "flex",
                    gap: 12,
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  {irmLayers.map((layer, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        opacity: layer.visible ? 1 : 0.4,
                        padding: "2px 4px",
                        minWidth: 0,
                        flex: "1 1 auto",
                      }}
                    >
                      <span
                        style={{
                          width: 12,
                          height: 12,
                          borderRadius: "50%",
                          background: layer.color || "#ccc",
                          border: "1px solid rgba(255,255,255,0.3)",
                          flexShrink: 0,
                        }}
                      />

                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: "var(--text-main)",
                          whiteSpace: "nowrap",
                          marginRight: 4,
                        }}
                      >
                        {layer.label}
                      </span>

                      <button
                        type="button"
                        onClick={() =>
                          onUpdateLayer(idx, { visible: !layer.visible })
                        }
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          fontSize: 14,
                          padding: "0 2px",
                          marginRight: 4,
                        }}
                        title={layer.visible ? "Masquer" : "Afficher"}
                      >
                        {layer.visible ? "👁" : "🚫"}
                      </button>

                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={Math.round(layer.opacity * 100)}
                        onChange={(e) =>
                          onUpdateLayer(idx, {
                            opacity: parseInt(e.target.value, 10) / 100,
                          })
                        }
                        style={{ flex: 1, minWidth: 60 }}
                        title={`Opacité: ${Math.round(layer.opacity * 100)}%`}
                      />

                      <span
                        style={{
                          fontSize: 11,
                          color: "var(--text-muted)",
                          minWidth: 28,
                          textAlign: "right",
                        }}
                      >
                        {Math.round(layer.opacity * 100)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {job?.error && (
          <div style={{ color: "var(--danger)", marginBottom: "0.5rem" }}>
            {job.error}
          </div>
        )}
        {job?.loading && (
          <div style={{ color: "var(--text-muted)", marginBottom: "0.5rem" }}>
            Traitement en cours...
          </div>
        )}

        <div className="viz-grid viz-grid-compact">
          {irmData && (
            <>
              {/* Sagittal */}
              <div className="slice-control">
                <SliceCanvas
                  data={sagOriented}
                  layers={sagLayerSlices}
                  overlay={fusionSag ? fusionSag : maskSagOriented}
                  opacity={fusionSag ? fusionOpacity : 0.45}
                  title={`Sagittal (X=${sliceIndices.sagittal})`}
                  onFocus={() => setFocusedView("sagittal")}
                  onClick={(xDisp, yDisp) => {
                    const p = inversePoint(
                      xDisp,
                      yDisp,
                      sagDispW,
                      sagDispH,
                      orientIRM.sagittal,
                    );
                    setSliceIndices((prev) => ({
                      ...prev,
                      coronal: p.y,
                      axial: p.x,
                    }));
                    setCursor3D((prev) => ({ ...prev, y: p.y, z: p.x }));
                  }}
                  crosshair={crosshairXY(
                    "sagittal",
                    sagW,
                    sagH,
                    cursor3D?.z,
                    cursor3D?.y,
                  )}
                />
                <input
                  type="range"
                  min="0"
                  max={irmData.shape[0] - 1}
                  value={sliceIndices.sagittal}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    setSliceIndices((prev) => ({ ...prev, sagittal: val }));
                    setCursor3D((prev) => ({ ...prev, x: val }));
                  }}
                  className="volume-slider"
                />
              </div>

              {/* Coronal */}
              <div className="slice-control">
                <SliceCanvas
                  data={corOriented}
                  layers={corLayerSlices}
                  overlay={fusionCor ? fusionCor : maskCorOriented}
                  opacity={fusionCor ? fusionOpacity : 0.45}
                  title={`Coronal (Y=${sliceIndices.coronal})`}
                  onFocus={() => setFocusedView("coronal")}
                  onClick={(xDisp, yDisp) => {
                    const p = inversePoint(
                      xDisp,
                      yDisp,
                      corDispW,
                      corDispH,
                      orientIRM.coronal,
                    );
                    const nx = p.y;
                    const ny = p.x;

                    setSliceIndices((prev) => ({
                      ...prev,
                      sagittal: nx,
                      axial: ny,
                    }));
                    setCursor3D((prev) => ({ ...prev, x: nx, z: ny }));

                    if (mrsiData) {
                      if (fusionData && fusionData.transform_matrix) {
                        const M = fusionData.transform_matrix;
                        const x = nx;
                        const y = sliceIndices.coronal;
                        const z = ny;
                        const i = Math.round(M[0][0]*x + M[0][1]*y + M[0][2]*z + M[0][3]);
                        const j = Math.round(M[1][0]*x + M[1][1]*y + M[1][2]*z + M[1][3]);
                        const k = Math.round(M[2][0]*x + M[2][1]*y + M[2][2]*z + M[2][3]);
                        handleVoxelClick(i, j, k);
                      } else if (mrsiData.shape && irmData?.shape) {
                        // Sans fusion : mapping direct IRM → MRSI par ratio de dimensions
                        const [MX, MY, MZ] = mrsiData.shape;
                        const [IX, IY, IZ] = irmData.shape;
                        const mi = Math.round((nx / Math.max(1, IX)) * MX);
                        const mk = Math.round((ny / Math.max(1, IZ)) * MZ);
                        const mj = Math.round((sliceIndices.coronal / Math.max(1, IY)) * MY);
                        handleVoxelClick(mi, mj, mk);
                      }
                    }
                  }}
                  crosshair={crosshairXY(
                    "coronal",
                    corW,
                    corH,
                    sliceIndices.axial,
                    sliceIndices.sagittal,
                  )}
                />
                <input
                  type="range"
                  min="0"
                  max={irmData.shape[1] - 1}
                  value={sliceIndices.coronal}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    setSliceIndices((prev) => ({ ...prev, coronal: val }));
                    setCursor3D((prev) => ({ ...prev, y: val }));
                  }}
                  className="volume-slider"
                />
              </div>

              {/* Axial */}
              <div className="slice-control">
                <SliceCanvas
                  data={axOriented}
                  layers={axLayerSlices}
                  overlay={fusionAx ? fusionAx : maskAxOriented}
                  opacity={fusionAx ? fusionOpacity : 0.45}
                  title={`Axial (Z=${sliceIndices.axial})`}
                  onFocus={() => setFocusedView("axial")}
                  onClick={(xDisp, yDisp) => {
                    const p = inversePoint(
                      xDisp,
                      yDisp,
                      axDispW,
                      axDispH,
                      orientIRM.axial,
                    );
                    const mriX = p.y;
                    const mriY = p.x;

                    setSliceIndices((prev) => ({
                      ...prev,
                      sagittal: mriX,
                      coronal: mriY,
                    }));
                    setCursor3D((prev) => ({ ...prev, x: mriX, y: mriY }));

                    if (mrsiData) {
                      if (fusionData && fusionData.transform_matrix) {
                        const M = fusionData.transform_matrix;
                        const x = mriX;
                        const y = mriY;
                        const z = sliceIndices.axial;
                        const i = Math.round(M[0][0]*x + M[0][1]*y + M[0][2]*z + M[0][3]);
                        const j = Math.round(M[1][0]*x + M[1][1]*y + M[1][2]*z + M[1][3]);
                        const k = Math.round(M[2][0]*x + M[2][1]*y + M[2][2]*z + M[2][3]);
                        handleVoxelClick(i, j, k);
                      } else if (mrsiData.shape && irmData?.shape) {
                        // Sans fusion : mapping direct IRM → MRSI par ratio de dimensions
                        const [MX, MY, MZ] = mrsiData.shape;
                        const [IX, IY, IZ] = irmData.shape;
                        const mi = Math.round((mriX / Math.max(1, IX)) * MX);
                        const mj = Math.round((mriY / Math.max(1, IY)) * MY);
                        const mk = Math.round((sliceIndices.axial / Math.max(1, IZ)) * MZ);
                        handleVoxelClick(mi, mj, mk);
                      }
                    }
                  }}
                  crosshair={crosshairXY(
                    "axial",
                    axW,
                    axH,
                    cursor3D?.y,
                    cursor3D?.x,
                  )}
                />
                <input
                  type="range"
                  min="0"
                  max={irmData.shape[2] - 1}
                  value={sliceIndices.axial}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    setSliceIndices((prev) => ({ ...prev, axial: val }));
                    setCursor3D((prev) => ({ ...prev, z: val }));
                  }}
                  className="volume-slider"
                />
              </div>

              {/* ─── MRSI Voxel Panel (spectre + quant inline) ─── */}
              <div
                className="slice-control spectrum-inline"
                onClick={(e) => e.stopPropagation()}
                style={{ display: "flex", flexDirection: "column", gap: 0 }}
              >
                {/* Header avec voxel actif */}
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "6px 8px",
                  background: "rgba(255,255,255,0.04)",
                  borderRadius: "8px 8px 0 0",
                  borderBottom: "1px solid var(--border-color)",
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--text-muted)",
                  userSelect: "none",
                  cursor: "pointer",
                }}
                onClick={() => setSpectrumPanelOpen(o => !o)}
                >
                  <span>
                    {selectedVoxel
                      ? `🎯 Voxel (${selectedVoxel.x}, ${selectedVoxel.y}, ${selectedVoxel.z})`
                      : "Spectre MRSI"}
                  </span>
                  <span>{spectrumPanelOpen ? "▼" : "▶"}</span>
                </div>

                {spectrumPanelOpen && (
                  <div style={{ background: "rgba(255,255,255,0.02)", borderRadius: "0 0 8px 8px", border: "1px solid var(--border-color)", borderTop: "none" }}>

                    {/* Quant inline AU-DESSUS du spectre : mode voxel unique */}
                    {mrsiData?.type === "MRSI" && mrsiData?.quantification && (
                      <VoxelQuantInline
                        quant={mrsiData.quantification}
                        voxel={selectedVoxel || mrsiData.voxel}
                        method={mrsiData?.method || mrsiData?._version_params?.method}
                      />
                    )}

                    {/* Quant inline AU-DESSUS du spectre : mode volume */}
                    {mrsiData?.type === "MRSI_VOLUME" && selectedVoxelQuant && selectedVoxel && (
                      <VoxelQuantInline
                        quant={selectedVoxelQuant}
                        voxel={selectedVoxel}
                        method={mrsiData?.method}
                      />
                    )}
                    {mrsiData?.type === "MRSI_VOLUME" && !selectedVoxelQuant && selectedVoxel && (
                      <div style={{ padding: "8px 10px", fontSize: 11, color: "var(--text-muted)" }}>
                        Voxel ({selectedVoxel.x},{selectedVoxel.y},{selectedVoxel.z}) non traité ou vide.
                      </div>
                    )}
                    {mrsiData?.type === "MRSI_VOLUME" && !selectedVoxel && (
                      <div style={{ padding: "8px 10px", fontSize: 11, color: "var(--text-muted)" }}>
                        Cliquez sur une heatmap pour voir la concentration d'un voxel.
                      </div>
                    )}

                    {/* Séparateur avant le spectre */}
                    {(selectedVoxel || currentSpectrum) && (
                      <div style={{ borderTop: "1px solid var(--border-color)", margin: "0 8px" }} />
                    )}

                    {/* Spectre EN-DESSOUS des résultats */}
                    <div style={{ minHeight: 100 }}>
                      {currentSpectrum ? (
                        <SpectrumChart
                          data={currentSpectrum}
                          label={`Voxel (${selectedVoxel?.x}, ${selectedVoxel?.y}, ${selectedVoxel?.z})`}
                        />
                      ) : (
                        <div style={{
                          height: 100,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "var(--text-muted)",
                          fontSize: 11,
                          textAlign: "center",
                          padding: "0.5rem",
                        }}>
                          {mrsiData
                            ? "Cliquez sur l'IRM pour afficher le spectre"
                            : "Pas de MRSI chargé"}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Quantification voxel — mode MRSI (single voxel result) — full panel */}
        {mrsiData && mrsiData.type === "MRSI" && mrsiData.quantification && (
          <CollapsiblePanel
            title={`Quantification détaillée – Voxel (${selectedVoxel?.x ?? mrsiData?.voxel?.x ?? "?"}, ${
              selectedVoxel?.y ?? mrsiData?.voxel?.y ?? "?"
            }, ${selectedVoxel?.z ?? mrsiData?.voxel?.z ?? "?"})`}
            defaultOpen={false}
          >
            <QuantVoxelPanel
              quant={mrsiData.quantification}
              voxel={selectedVoxel || mrsiData.voxel}
              method={mrsiData?.method || mrsiData?._version_params?.method}
            />
          </CollapsiblePanel>
        )}

        {/* Heatmaps — mode MRSI_VOLUME */}
        {mrsiData &&
          mrsiData.type === "MRSI_VOLUME" &&
          mrsiData.quantification &&
          mrsiData.dimensions && (
            <CollapsiblePanel
              title={`Cartes de concentration (${mrsiData.processed_voxels}/${mrsiData.total_voxels} voxels)`}
              defaultOpen={false}
            >
              <div
                style={{
                  marginTop: "0.5rem",
                  padding: "0.75rem",
                  borderRadius: 12,
                  border: "1px solid var(--border-color)",
                  background: "rgba(255,255,255,0.03)",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Controls */}
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
                  <button
                    className="btn-primary"
                    onClick={(e) => { e.stopPropagation(); exportAllHeatmapsPNG(); }}
                    style={{ fontSize: 12 }}
                  >
                    Export PNG (Z={heatmapSlice})
                  </button>
                  <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
                    Slice Z : <b>{heatmapSlice}</b>
                    <input
                      type="range"
                      min="0"
                      max={(mrsiData.dimensions?.Z || 1) - 1}
                      value={heatmapSlice}
                      onChange={(e) => setHeatmapSlice(parseInt(e.target.value, 10))}
                      style={{ width: 100 }}
                    />
                  </label>
                  {selectedVoxel && (
                    <span style={{ fontSize: 11, color: "var(--accent)", fontWeight: 700 }}>
                      ▶ Voxel sélectionné : ({selectedVoxel.x}, {selectedVoxel.y}, {selectedVoxel.z})
                    </span>
                  )}
                </div>

                {/* Grid heatmaps */}
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: 16,
                }}>
                  {HEATMAP_METABOLITES.map((m) => (
                    <div key={m} style={{ width: "100%" }}>
                      <MetaboliteHeatmap
                        ref={setHeatmapRef(m)}
                        metabolite={m}
                        volumeData={mrsiData?.quantification}
                        dimensions={mrsiData?.dimensions}
                        sliceIndex={heatmapSlice}
                        cursorVoxel={selectedVoxel || mrsiData?.voxel}
                        onVoxelClick={(x, y, z) => handleVoxelClick(x, y, z)}
                        width={90}
                        height={90}
                      />
                    </div>
                  ))}
                </div>

                {/* Quant détaillée du voxel sélectionné */}
                {selectedVoxelQuant && selectedVoxel && (
                  <div style={{ marginTop: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: "var(--text-muted)" }}>
                      Quantification complète — Voxel ({selectedVoxel.x}, {selectedVoxel.y}, {selectedVoxel.z})
                    </div>
                    <QuantVoxelPanel
                      quant={selectedVoxelQuant}
                      voxel={selectedVoxel}
                      method={mrsiData?.method}
                    />
                  </div>
                )}
              </div>
            </CollapsiblePanel>
          )}
        {!irmData && (
          <div
            className="slice-control card"
            onClick={(e) => e.stopPropagation()}
          >
            {renderUpload("IRM", cardId)}
          </div>
        )}
        {!mrsiData && (
          <div
            className="slice-control card"
            onClick={(e) => e.stopPropagation()}
          >
            {renderUpload("MRSI", cardId)}
          </div>
        )}
      </div>

      {/* Focus modal */}
      {focusedView && (
        <div
          className="focus-overlay"
          onClick={() => setFocusedView(null)}
          role="dialog"
          aria-modal="true"
        >
          <div className="focus-modal" onClick={(e) => e.stopPropagation()}>
            <div className="focus-header">
              <div className="focus-title">
                {focusedView === "sagittal" &&
                  `Sagittal (X=${sliceIndices.sagittal})`}
                {focusedView === "coronal" &&
                  `Coronal (Y=${sliceIndices.coronal})`}
                {focusedView === "axial" && `Axial (Z=${sliceIndices.axial})`}
              </div>
              <button
                className="btn-secondary"
                onClick={() => setFocusedView(null)}
              >
                ✕
              </button>
            </div>

            <div className="focus-body">
              {focusedView === "sagittal" && (
                <SliceCanvas
                  data={sagOriented}
                  overlay={fusionSag ? fusionSag : maskSagOriented}
                  opacity={fusionSag ? fusionOpacity : 0.45}
                  title={`Sagittal (zoom)`}
                  onClick={(xDisp, yDisp) => {
                    const p = inversePoint(
                      xDisp,
                      yDisp,
                      sagDispW,
                      sagDispH,
                      orientIRM.sagittal,
                    );
                    setSliceIndices((prev) => ({
                      ...prev,
                      coronal: p.y,
                      axial: p.x,
                    }));
                    setCursor3D((prev) => ({ ...prev, y: p.y, z: p.x }));
                  }}
                  crosshair={crosshairXY(
                    "sagittal",
                    sagW,
                    sagH,
                    cursor3D?.z,
                    cursor3D?.y,
                  )}
                />
              )}

              {focusedView === "coronal" && (
                <SliceCanvas
                  data={corOriented}
                  overlay={fusionCor ? fusionCor : maskCorOriented}
                  opacity={fusionCor ? fusionOpacity : 0.45}
                  title={`Coronal (zoom)`}
                  onClick={(xDisp, yDisp) => {
                    const p = inversePoint(xDisp, yDisp, corDispW, corDispH, orientIRM.coronal);
                    const nx = p.y;
                    const ny = p.x;
                    setSliceIndices((prev) => ({ ...prev, sagittal: nx, axial: ny }));
                    setCursor3D((prev) => ({ ...prev, x: nx, z: ny }));
                    if (mrsiData) {
                      if (fusionData && fusionData.transform_matrix) {
                        const M = fusionData.transform_matrix;
                        handleVoxelClick(
                          Math.round(M[0][0]*nx + M[0][1]*sliceIndices.coronal + M[0][2]*ny + M[0][3]),
                          Math.round(M[1][0]*nx + M[1][1]*sliceIndices.coronal + M[1][2]*ny + M[1][3]),
                          Math.round(M[2][0]*nx + M[2][1]*sliceIndices.coronal + M[2][2]*ny + M[2][3]),
                        );
                      } else if (mrsiData.shape && irmData?.shape) {
                        const [MX, MY, MZ] = mrsiData.shape;
                        const [IX, IY, IZ] = irmData.shape;
                        handleVoxelClick(
                          Math.round((nx / Math.max(1, IX)) * MX),
                          Math.round((sliceIndices.coronal / Math.max(1, IY)) * MY),
                          Math.round((ny / Math.max(1, IZ)) * MZ),
                        );
                      }
                    }
                  }}
                  crosshair={crosshairXY("coronal", corW, corH, sliceIndices.axial, sliceIndices.sagittal)}
                />
              )}

              {focusedView === "axial" && (
                <SliceCanvas
                  data={axOriented}
                  overlay={fusionAx ? fusionAx : maskAxOriented}
                  opacity={fusionAx ? fusionOpacity : 0.45}
                  title={`Axial (zoom)`}
                  onClick={(xDisp, yDisp) => {
                    const p = inversePoint(xDisp, yDisp, axDispW, axDispH, orientIRM.axial);
                    const mriX = p.y;
                    const mriY = p.x;
                    setSliceIndices((prev) => ({ ...prev, sagittal: mriX, coronal: mriY }));
                    setCursor3D((prev) => ({ ...prev, x: mriX, y: mriY }));
                    if (mrsiData) {
                      if (fusionData && fusionData.transform_matrix) {
                        const M = fusionData.transform_matrix;
                        handleVoxelClick(
                          Math.round(M[0][0]*mriX + M[0][1]*mriY + M[0][2]*sliceIndices.axial + M[0][3]),
                          Math.round(M[1][0]*mriX + M[1][1]*mriY + M[1][2]*sliceIndices.axial + M[1][3]),
                          Math.round(M[2][0]*mriX + M[2][1]*mriY + M[2][2]*sliceIndices.axial + M[2][3]),
                        );
                      } else if (mrsiData.shape && irmData?.shape) {
                        const [MX, MY, MZ] = mrsiData.shape;
                        const [IX, IY, IZ] = irmData.shape;
                        handleVoxelClick(
                          Math.round((mriX / Math.max(1, IX)) * MX),
                          Math.round((mriY / Math.max(1, IY)) * MY),
                          Math.round((sliceIndices.axial / Math.max(1, IZ)) * MZ),
                        );
                      }
                    }
                  }}
                  crosshair={crosshairXY("axial", axW, axH, cursor3D?.y, cursor3D?.x)}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default IrmCard;