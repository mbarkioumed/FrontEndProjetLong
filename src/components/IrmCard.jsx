import React, { useMemo, useState, useEffect } from "react";
import SliceCanvas from "./SliceCanvas";
import Brain3D from "./Brain3D";
import SpectrumChart from "./SpectrumChart";
import { getData } from "../utils/dataCache";

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

const IrmCard = ({
  irmData,
  mrsiData,
  cardId,
  isActive,
  onSelect,
  onDuplicate,
  onDelete,
  onDeleteVersion,
  renderUploadForm,
  onFetchSpectrum,
  job,
  maskData,
  irmHistory = [],
  mrsiHistory = [],
  onSelectIrmVersion,
  onSelectMrsiVersion,
}) => {
  //      Focus modal state
  const [focusedView, setFocusedView] = useState(null); // "sagittal" | "coronal" | "axial" | null

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
  const [prevMrsiData, setPrevMrsiData] = useState(null);

  // --- FUSION STATE ---
  const [fusionData, setFusionData] = useState(null);
  const [fusionOpacity, setFusionOpacity] = useState(0.5);
  const [forceCenter, setForceCenter] = useState(true);
  const [fusionChannel, setFusionChannel] = useState("");
  const [isFusing, setIsFusing] = useState(false);
  const [fusionError, setFusionError] = useState(null);

  // --- FUSION HANDLER ---
  const handleFusionClick = async () => {
    if (!irmData || !mrsiData) return;
    setIsFusing(true);
    setFusionError(null);
    try {
      const mriName = irmData.nom_fichier || irmData.nom;
      const mrsiName = mrsiData.nom;

      let url = `http://127.0.0.1:8000/fusion/?mri=${mriName}&mrsi=${mrsiName}&force_center=${forceCenter}`;
      if (fusionChannel !== "") {
        url += `&channel=${fusionChannel}`;
      }

      const res = await fetch(url);
      const json = await res.json();

      if (json.error) throw new Error(json.error);

      const binaryString = window.atob(json.data_b64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

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

  //      detect version changes too
  const irmVersionKey = irmData?.__versionId || "none";
  const mrsiVersionKey = mrsiData?.__versionId || "none";

  // Sync IRM data changes
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

  // Sync MRSI data changes
  useEffect(() => {
    if (mrsiData !== prevMrsiData) {
      setPrevMrsiData(mrsiData);
      if (mrsiData?.shape) {
        setMrsiSliceIndex(Math.floor(mrsiData.shape[2] / 2));
        setSelectedVoxel(null);
        setCurrentSpectrum(null);
      } else {
        setMrsiSliceIndex(0);
        setSelectedVoxel(null);
        setCurrentSpectrum(null);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mrsiData, mrsiVersionKey]);

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
  }, [irmData?.dataRef, irmData?.shape, sliceIndices.sagittal, orientIRM.sagittal]);

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
  }, [irmData?.dataRef, irmData?.shape, sliceIndices.coronal, orientIRM.coronal]);

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
  }, [irmData?.dataRef, irmData?.shape, sliceIndices.axial, orientIRM.axial]);

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
  }, [maskData?.dataRef, maskData?.shape, sliceIndices.sagittal, orientIRM.sagittal]);

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
  }, [maskData?.dataRef, maskData?.shape, sliceIndices.coronal, orientIRM.coronal]);

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
  }, [maskData?.dataRef, maskData?.shape, sliceIndices.axial, orientIRM.axial]);

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
  }, [fusionData, irmData?.shape, sliceIndices.sagittal, orientIRM.sagittal]);

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
  }, [fusionData, irmData?.shape, sliceIndices.coronal, orientIRM.coronal]);

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
  }, [fusionData, irmData?.shape, sliceIndices.axial, orientIRM.axial]);

  // --- MEMOIZED MRSI SLICE ---
  const mrsiSlice = useMemo(() => {
    if (!mrsiData?.shape) return [];
    let dataUint8 = mrsiData.data_uint8;
    if (!dataUint8 && mrsiData.dataRef) dataUint8 = getData(mrsiData.dataRef);
    if (!dataUint8) return [];

    const [X, Y, Z] = mrsiData.shape;
    const z = mrsiSliceIndex;
    if (z < 0 || z >= Z) return [];

    const slice = [];
    for (let x = 0; x < X; x++) {
      const row = new Uint8Array(Y);
      for (let y = 0; y < Y; y++) row[y] = dataUint8[x * Y * Z + y * Z + z];
      slice.push(row);
    }
    return slice;
  }, [mrsiData, mrsiSliceIndex]);

  const safeNum = (v) => (typeof v === "number" ? v : null);

  const crosshairXY = (plane, sliceW, sliceH, xOrig, yOrig) => {
    const x = safeNum(xOrig);
    const y = safeNum(yOrig);
    if (x == null || y == null) return { x: null, y: null };
    const o = orientIRM[plane] || {};
    return forwardPoint(x, y, sliceW, sliceH, o);
  };

  const handleVoxelClick = async (xVal, yVal, zVal = null) => {
    if (!mrsiData?.shape) return;
    const [X, Y] = mrsiData.shape;
    const x = Math.max(0, Math.min(xVal, X - 1));
    const y = Math.max(0, Math.min(yVal, Y - 1));
    const z = zVal !== null ? zVal : mrsiSliceIndex;

    if (zVal !== null) setMrsiSliceIndex(z);

    setSelectedVoxel({ x, y, z });

    if (onFetchSpectrum && mrsiData?.nom) {
      const data = await onFetchSpectrum(mrsiData.nom, x, y, z);
      if (data && data.spectrum) setCurrentSpectrum(data);
    }
  };

  const handleSelectCard = () => {
    onSelect?.();
  };

  const currentIrmVersion = irmData?.__versionId || "base";

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

  const currentMrsiVersion = mrsiData?.__versionId || "base";
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

  //      Carte vide : upload forms
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

        <h3>Nouvelle Carte</h3>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "1rem",
          }}
        >
          <div onClick={(e) => e.stopPropagation()}>
            {renderUploadForm("IRM", cardId)}
          </div>
          <div onClick={(e) => e.stopPropagation()}>
            {renderUploadForm("MRSI", cardId)}
          </div>
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
        style={{ cursor: onSelect ? "pointer" : "default" }}
      >
        {/* ===== header ===== */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
            flexWrap: "wrap",
            marginBottom: "0.75rem",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              minWidth: 260,
            }}
          >
            <h2 style={{ margin: 0 }}>
              {irmData ? `IRM: ${irmData.nom_fichier}` : ""}
              {irmData && mrsiData ? " | " : ""}
              {mrsiData ? `MRSI: ${mrsiData.nom}` : ""}
            </h2>

            {/*      Versions selectors (IRM / MRSI) */}
            <div
              style={{ display: "flex", gap: 10, flexWrap: "wrap" }}
              onClick={(e) => e.stopPropagation()}
            >
              {irmData && (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
            </div>

            <div
              style={{ display: "flex", gap: 10, flexWrap: "wrap" }}
              onClick={(e) => e.stopPropagation()}
            >
              {mrsiData && (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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

        {/* per-card job status */}
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

        <div className="viz-grid">
          {/* --- IRM --- */}
          {irmData && (
            <>
              {/* Sagittal */}
              <div className="slice-control">
                <SliceCanvas
                  data={sagOriented}
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
                      orientIRM.sagittal
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
                    cursor3D?.y
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
                      orientIRM.coronal
                    );
                    const nx = p.y;
                    const ny = p.x;

                    setSliceIndices((prev) => ({
                      ...prev,
                      sagittal: nx,
                      axial: ny,
                    }));
                    setCursor3D((prev) => ({ ...prev, x: nx, z: ny }));

                    if (fusionData && fusionData.transform_matrix) {
                      const M = fusionData.transform_matrix;
                      const x = nx;
                      const y = sliceIndices.coronal;
                      const z = ny;
                      const i = Math.round(
                        M[0][0] * x +
                          M[0][1] * y +
                          M[0][2] * z +
                          M[0][3]
                      );
                      const j = Math.round(
                        M[1][0] * x +
                          M[1][1] * y +
                          M[1][2] * z +
                          M[1][3]
                      );
                      const k = Math.round(
                        M[2][0] * x +
                          M[2][1] * y +
                          M[2][2] * z +
                          M[2][3]
                      );
                      handleVoxelClick(i, j, k);
                    }
                  }}
                  crosshair={crosshairXY(
                    "coronal",
                    corW,
                    corH,
                    sliceIndices.axial,
                    sliceIndices.sagittal
                  )}
                  sliceLineH={sliceIndices.axial}
                  sliceLineV={sliceIndices.sagittal}
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
                  overlay={fusionAx}
                  opacity={fusionOpacity}
                  title={`Axial (Z=${sliceIndices.axial})`}
                  onFocus={() => setFocusedView("axial")}
                  onClick={(xDisp, yDisp) => {
                    const p = inversePoint(
                      xDisp,
                      yDisp,
                      axDispW,
                      axDispH,
                      orientIRM.axial
                    );
                    const mriX = p.y;
                    const mriY = p.x;

                    setSliceIndices((prev) => ({
                      ...prev,
                      sagittal: mriX,
                      coronal: mriY,
                    }));
                    setCursor3D((prev) => ({ ...prev, x: mriX, y: mriY }));

                    if (fusionData && fusionData.transform_matrix) {
                      const M = fusionData.transform_matrix;
                      const x = mriX;
                      const y = mriY;
                      const z = sliceIndices.axial;
                      const i = Math.round(
                        M[0][0] * x +
                          M[0][1] * y +
                          M[0][2] * z +
                          M[0][3]
                      );
                      const j = Math.round(
                        M[1][0] * x +
                          M[1][1] * y +
                          M[1][2] * z +
                          M[1][3]
                      );
                      const k = Math.round(
                        M[2][0] * x +
                          M[2][1] * y +
                          M[2][2] * z +
                          M[2][3]
                      );
                      handleVoxelClick(i, j, k);
                    }
                  }}
                  crosshair={crosshairXY(
                    "axial",
                    axW,
                    axH,
                    cursor3D?.y,
                    cursor3D?.x
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
            </>
          )}
        </div>

        {/* --- FUSION CONTROLS --- */}
        {irmData && mrsiData && (
          <div
            style={{
              marginTop: "1rem",
              padding: "1rem",
              background: "var(--bg-secondary)",
              borderRadius: "8px",
            }}
          >
            <h4>Fusion MRI-MRSI</h4>
            {fusionError && (
              <div
                style={{
                  color: "red",
                  fontSize: "0.8rem",
                  marginBottom: "0.5rem",
                }}
              >
                {fusionError}
              </div>
            )}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "1rem",
                flexWrap: "wrap",
              }}
            >
              <button
                className="btn-primary"
                onClick={handleFusionClick}
                disabled={isFusing}
              >
                {isFusing ? "Fusion en cours..." : "Générer / Mettre à jour la Fusion"}
              </button>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "2rem",
                  flexWrap: "wrap",
                }}
              >
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={forceCenter}
                    onChange={(e) => setForceCenter(e.target.checked)}
                  />
                  <span>Force Center</span>
                </label>

                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span>Metabolite Index:</span>
                  <input
                    type="number"
                    min="0"
                    placeholder="All (Sum)"
                    value={fusionChannel}
                    onChange={(e) => setFusionChannel(e.target.value)}
                    style={{ width: "80px", padding: "0.2rem" }}
                  />
                </div>

                {fusionData && (
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span>Opacité:</span>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={fusionOpacity}
                      onChange={(e) => setFusionOpacity(parseFloat(e.target.value))}
                    />
                    <span>{Math.round(fusionOpacity * 100)}%</span>
                  </div>
                )}

                {fusionData && (
                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    {fusionData.info}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* --- 3D / Spectrum (Bottom) --- */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "1rem",
            marginTop: "1rem",
          }}
        >
          {/* 3D Brain */}
          <div className="card-panel">
            <h5 style={{ margin: "0 0 0.5rem 0" }}>3D Brain Preview</h5>
            <Brain3D
              irmData={irmData}
              maskData={maskData}
              cursor={cursor3D}
              width={300}
              height={300}
            />
          </div>

          {/* Spectrum */}
          <div className="card-panel" style={{ display: "flex", flexDirection: "column" }}>
            <h5 style={{ margin: "0 0 0.5rem 0" }}>Spectre MRSI</h5>
            {currentSpectrum ? (
              <SpectrumChart
                data={currentSpectrum}
                label={`Voxel (${selectedVoxel?.x}, ${selectedVoxel?.y}, ${selectedVoxel?.z})`}
              />
            ) : (
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "8px",
                  color: "var(--text-muted)",
                }}
              >
                {mrsiData
                  ? fusionData
                    ? "Cliquez sur l'IRM fusionnée pour voir le spectre"
                    : "Cliquez sur l'IRM pour sélectionner un voxel"
                  : "Pas de MRSI chargé"}
              </div>
            )}
          </div>
        </div>

        {/* --- Upload if missing --- */}
        {!irmData && (
          <div className="slice-control card" onClick={(e) => e.stopPropagation()}>
            {renderUploadForm("IRM", cardId)}
          </div>
        )}
        {!mrsiData && (
          <div className="slice-control card" onClick={(e) => e.stopPropagation()}>
            {renderUploadForm("MRSI", cardId)}
          </div>
        )}
      </div>

      {/* ====== MODAL VIEW AGRANDIE ====== */}
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
                {focusedView === "sagittal" && `Sagittal (X=${sliceIndices.sagittal})`}
                {focusedView === "coronal" && `Coronal (Y=${sliceIndices.coronal})`}
                {focusedView === "axial" && `Axial (Z=${sliceIndices.axial})`}
              </div>
              <button className="btn-secondary" onClick={() => setFocusedView(null)}>
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
                      orientIRM.sagittal
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
                    cursor3D?.y
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
                    const p = inversePoint(
                      xDisp,
                      yDisp,
                      corDispW,
                      corDispH,
                      orientIRM.coronal
                    );
                    const nx = p.y;
                    const ny = p.x;

                    setSliceIndices((prev) => ({
                      ...prev,
                      sagittal: nx,
                      axial: ny,
                    }));
                    setCursor3D((prev) => ({ ...prev, x: nx, z: ny }));

                    if (fusionData && fusionData.transform_matrix) {
                      const M = fusionData.transform_matrix;
                      const x = nx;
                      const y = sliceIndices.coronal;
                      const z = ny;
                      const i = Math.round(
                        M[0][0] * x +
                          M[0][1] * y +
                          M[0][2] * z +
                          M[0][3]
                      );
                      const j = Math.round(
                        M[1][0] * x +
                          M[1][1] * y +
                          M[1][2] * z +
                          M[1][3]
                      );
                      const k = Math.round(
                        M[2][0] * x +
                          M[2][1] * y +
                          M[2][2] * z +
                          M[2][3]
                      );
                      handleVoxelClick(i, j, k);
                    }
                  }}
                  crosshair={crosshairXY(
                    "coronal",
                    corW,
                    corH,
                    sliceIndices.axial,
                    sliceIndices.sagittal
                  )}
                />
              )}

              {focusedView === "axial" && (
                <SliceCanvas
                  data={axOriented}
                  overlay={fusionAx}
                  opacity={fusionOpacity}
                  title={`Axial (zoom)`}
                  onClick={(xDisp, yDisp) => {
                    const p = inversePoint(
                      xDisp,
                      yDisp,
                      axDispW,
                      axDispH,
                      orientIRM.axial
                    );
                    const mriX = p.y;
                    const mriY = p.x;

                    setSliceIndices((prev) => ({
                      ...prev,
                      sagittal: mriX,
                      coronal: mriY,
                    }));
                    setCursor3D((prev) => ({ ...prev, x: mriX, y: mriY }));

                    if (fusionData && fusionData.transform_matrix) {
                      const M = fusionData.transform_matrix;
                      const x = mriX;
                      const y = mriY;
                      const z = sliceIndices.axial;
                      const i = Math.round(
                        M[0][0] * x +
                          M[0][1] * y +
                          M[0][2] * z +
                          M[0][3]
                      );
                      const j = Math.round(
                        M[1][0] * x +
                          M[1][1] * y +
                          M[1][2] * z +
                          M[1][3]
                      );
                      const k = Math.round(
                        M[2][0] * x +
                          M[2][1] * y +
                          M[2][2] * z +
                          M[2][3]
                      );
                      handleVoxelClick(i, j, k);
                    }
                  }}
                  crosshair={crosshairXY(
                    "axial",
                    axW,
                    axH,
                    cursor3D?.y,
                    cursor3D?.x
                  )}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default React.memo(IrmCard);