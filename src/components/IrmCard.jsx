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
  renderUploadForm,
  onFetchSpectrum,
  job, // per-card job state { loading, error }
  // ✅ NEW (versions)
  irmHistory = [],
  mrsiHistory = [],
  onSelectIrmVersion,
  onSelectMrsiVersion,
}) => {
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

  // ✅ detect version changes too (so center resets when you switch a processed version)
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

        setSliceIndices({ sagittal: centerX, coronal: centerY, axial: centerZ });
        setCursor3D({ x: centerX, y: centerY, z: centerZ });
      } else {
        setSliceIndices({ sagittal: 0, coronal: 0, axial: 0 });
        setCursor3D({ x: null, y: null, z: null });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [irmData, irmVersionKey]); // <- important: version key

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
  }, [mrsiData, mrsiVersionKey]); // <- important: version key

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

  const handleVoxelClick = async (xVal, yVal) => {
    if (!mrsiData?.shape) return;
    const [X, Y] = mrsiData.shape;
    const x = Math.max(0, Math.min(xVal, X - 1));
    const y = Math.max(0, Math.min(yVal, Y - 1));
    const z = mrsiSliceIndex;

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
  const currentMrsiVersion = mrsiData?.__versionId || "base";

  // ✅ Carte vide : upload forms
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

        {/* per-card job status */}
        {job?.error && <div style={{ color: "var(--danger)", marginBottom: "0.5rem" }}>{job.error}</div>}
        {job?.loading && <div style={{ color: "var(--text-muted)", marginBottom: "0.5rem" }}>Traitement en cours...</div>}

        <h3>Nouvelle Carte</h3>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          <div onClick={(e) => e.stopPropagation()}>{renderUploadForm("IRM", cardId)}</div>
          <div onClick={(e) => e.stopPropagation()}>{renderUploadForm("MRSI", cardId)}</div>
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
        <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 260 }}>
          <h2 style={{ margin: 0 }}>
            {irmData ? `IRM: ${irmData.nom_fichier}` : ""}
            {irmData && mrsiData ? " | " : ""}
            {mrsiData ? `MRSI: ${mrsiData.nom}` : ""}
          </h2>

          {/* ✅ Versions selectors (IRM / MRSI) */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }} onClick={(e) => e.stopPropagation()}>
            {irmData && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>IRM version:</span>
                <select
                  className="form-select"
                  style={{ padding: "0.4rem 0.6rem", borderRadius: 10, fontSize: 12, width: 220 }}
                  value={currentIrmVersion}
                  onChange={(e) => onSelectIrmVersion?.(e.target.value)}
                >
                  {(irmHistory?.length ? irmHistory : [{ id: "base", label: "Original" }]).map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label || v.id}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {mrsiData && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>MRSI version:</span>
                <select
                  className="form-select"
                  style={{ padding: "0.4rem 0.6rem", borderRadius: 10, fontSize: 12, width: 220 }}
                  value={currentMrsiVersion}
                  onChange={(e) => onSelectMrsiVersion?.(e.target.value)}
                >
                  {(mrsiHistory?.length ? mrsiHistory : [{ id: "base", label: "Original" }]).map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label || v.id}
                    </option>
                  ))}
                </select>
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
      {job?.error && <div style={{ color: "var(--danger)", marginBottom: "0.5rem" }}>{job.error}</div>}
      {job?.loading && <div style={{ color: "var(--text-muted)", marginBottom: "0.5rem" }}>Traitement en cours...</div>}

      <div className="viz-grid">
        {/* --- IRM --- */}
        {irmData && (
          <>
            {/* Sagittal */}
            <div className="slice-control">
              <SliceCanvas
                data={sagOriented}
                title={`Sagittal (X=${sliceIndices.sagittal})`}
                onClick={(xDisp, yDisp) => {
                  const p = inversePoint(xDisp, yDisp, sagDispW, sagDispH, orientIRM.sagittal);
                  setSliceIndices((prev) => ({ ...prev, coronal: p.y, axial: p.x }));
                  setCursor3D((prev) => ({ ...prev, y: p.y, z: p.x }));
                }}
                crosshair={crosshairXY("sagittal", sagW, sagH, cursor3D?.z, cursor3D?.y)}
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
                title={`Coronal (Y=${sliceIndices.coronal})`}
                onClick={(xDisp, yDisp) => {
                  const p = inversePoint(xDisp, yDisp, corDispW, corDispH, orientIRM.coronal);
                  setSliceIndices((prev) => ({ ...prev, sagittal: p.y, axial: p.x }));
                  setCursor3D((prev) => ({ ...prev, x: p.y, z: p.x }));
                }}
                crosshair={crosshairXY("coronal", corW, corH, cursor3D?.z, cursor3D?.x)}
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
                title={`Axial (Z=${sliceIndices.axial})`}
                onClick={(xDisp, yDisp) => {
                  const p = inversePoint(xDisp, yDisp, axDispW, axDispH, orientIRM.axial);
                  setSliceIndices((prev) => ({ ...prev, sagittal: p.y, coronal: p.x }));
                  setCursor3D((prev) => ({ ...prev, x: p.y, y: p.x }));
                }}
                crosshair={crosshairXY("axial", axW, axH, cursor3D?.y, cursor3D?.x)}
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

            {/* 3D Brain */}
            <div className="slice-control" style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: "350px" }}>
              <div
                style={{
                  flex: 1,
                  width: "100%",
                  minHeight: "300px",
                  background: "black",
                  borderRadius: "4px",
                  overflow: "hidden",
                }}
              >
                <Brain3D
                  irmData={{
                    ...irmData,
                    data_uint8: getData(irmData.dataRef),
                  }}
                  cursor3D={cursor3D}
                />
              </div>
              <span className="slice-label" style={{ marginTop: "0.5rem" }}>
                3D Brain Preview
              </span>
            </div>
          </>
        )}

        {/* --- MRSI --- */}
        {mrsiData && (
          <>
            <div className="slice-control">
              <SliceCanvas
                data={mrsiSlice}
                title={`MRSI Slice (Z=${mrsiSliceIndex})`}
                onClick={(x, y) => handleVoxelClick(x, y)}
                selectedVoxel={selectedVoxel}
                isMRSI={true}
              />
              <input
                type="range"
                min="0"
                max={mrsiData.shape[2] - 1}
                value={mrsiSliceIndex}
                onChange={(e) => setMrsiSliceIndex(parseInt(e.target.value, 10))}
                className="volume-slider"
              />
            </div>

            <div className="slice-control" style={{ gridColumn: "span 2" }}>
              {currentSpectrum ? (
                <SpectrumChart data={currentSpectrum} />
              ) : (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    height: "100%",
                    background: "#f8f9fa",
                    borderRadius: "8px",
                    border: "1px dashed #ccc",
                  }}
                >
                  <p>Sélectionnez un voxel sur la carte MRSI pour voir le spectre</p>
                </div>
              )}
            </div>
          </>
        )}

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
    </div>
  );
};

export default React.memo(IrmCard);
