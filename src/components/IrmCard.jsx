import React, { useMemo, useState, useEffect } from "react";
import SliceCanvas from "./SliceCanvas";
import Fusion3D from "./Fusion3D";

// Helpers orientation 2D (Moved from App.js if possible or redefined)
const transpose2D = (m) => {
    if (!m || !m.length) return m;
    const numRows = m.length;
    const numCols = m[0].length;
    const result = [];
    for (let c = 0; c < numCols; c++) {
        const newRow = new Uint8Array(numRows);
        for (let r = 0; r < numRows; r++) {
            newRow[r] = m[r][c];
        }
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
    let px = x, py = y;
    let w = width, h = height;
    if (o.flipY) py = h - 1 - py;
    if (o.flipX) px = w - 1 - px;
    if (o.rotate === 180) {
        px = w - 1 - px;
        py = h - 1 - py;
    } else if (o.rotate === 90) {
        const nx = py;
        const ny = w - 1 - px;
        px = nx; py = ny;
        [w, h] = [h, w];
    } else if (o.rotate === -90) {
        const nx = h - 1 - py;
        const ny = px;
        px = nx; py = ny;
        [w, h] = [h, w];
    }
    if (o.transpose) {
        const nx = py;
        const ny = px;
        px = nx; py = ny;
        [w, h] = [h, w];
    }
    return { x: px, y: py };
};

const forwardPoint = (x, y, width, height, o = {}) => {
    let px = x, py = y;
    let w = width, h = height;
    if (o.transpose) {
        const nx = py;
        const ny = px;
        px = nx; py = ny;
        [w, h] = [h, w];
    }
    if (o.rotate === 90) {
        const nx = h - 1 - py;
        const ny = px;
        px = nx; py = ny;
        [w, h] = [h, w];
    } else if (o.rotate === -90) {
        const nx = py;
        const ny = w - 1 - px;
        px = nx; py = ny;
        [w, h] = [h, w];
    } else if (o.rotate === 180) {
        px = w - 1 - px;
        py = h - 1 - py;
    }
    if (o.flipX) px = w - 1 - px;
    if (o.flipY) py = h - 1 - py;
    return { x: px, y: py };
};

const PLANE_LABEL = {
    sagittal: "Sagittal",
    coronal: "Coronal",
    axial: "Axial",
};

const ORIENTATION_DEFAULTS = {
    sagittal: { flipY: false, flipX: false, rotate: -90, transpose: false },
    coronal: { flipY: false, flipX: true, rotate: -90, transpose: false },
    axial: { flipY: false, flipX: false, rotate: 90, transpose: false },
};

const IrmCard = ({ 
    results, 
    cardId, 
    onDuplicate, 
    onDelete, 
    renderUploadForm 
}) => {
    // Initialize state with center indices if results provided
    const [sliceIndices, setSliceIndices] = useState(() => {
        if (results?.shape) {
            return {
                sagittal: Math.floor(results.shape[0] / 2),
                coronal: Math.floor(results.shape[1] / 2),
                axial: Math.floor(results.shape[2] / 2),
            };
        }
        return { sagittal: 0, coronal: 0, axial: 0 };
    });

    const [cursor3D, setCursor3D] = useState(() => {
        if (results?.shape) {
            return {
                x: Math.floor(results.shape[0] / 2),
                y: Math.floor(results.shape[1] / 2),
                z: Math.floor(results.shape[2] / 2),
            };
        }
        return { x: null, y: null, z: null };
    });
    const [prevResults, setPrevResults] = useState(results);
    const orientIRM = ORIENTATION_DEFAULTS;

    // Immediate state reset during render when the results object changes
    // (e.g. new file uploaded or card duplicated)
    if (results !== prevResults) {
        setPrevResults(results);
        if (results?.shape) {
            const centerX = Math.floor(results.shape[0] / 2);
            const centerY = Math.floor(results.shape[1] / 2);
            const centerZ = Math.floor(results.shape[2] / 2);
            
            setSliceIndices({
                sagittal: centerX,
                coronal: centerY,
                axial: centerZ,
            });
            setCursor3D({
                x: centerX,
                y: centerY,
                z: centerZ,
            });
        }
    }

    const sagOriented = useMemo(() => {
        if (!results?.data_uint8) return null;
        const [X, Y, Z] = results.shape;
        const vol = results.data_uint8;
        const sx = sliceIndices.sagittal;
        if (sx < 0 || sx >= X) return null;
        const slice = [];
        for (let y = 0; y < Y; y++) {
            const offset = (sx * Y * Z) + (y * Z);
            slice.push(vol.subarray(offset, offset + Z));
        }
        return orient2D(slice, orientIRM.sagittal);
    }, [results?.data_uint8, results?.shape, sliceIndices.sagittal, orientIRM.sagittal]);

    const corOriented = useMemo(() => {
        if (!results?.data_uint8) return null;
        const [X, Y, Z] = results.shape;
        const vol = results.data_uint8;
        const sy = sliceIndices.coronal;
        if (sy < 0 || sy >= Y) return null;
        const slice = [];
        for (let x = 0; x < X; x++) {
            const row = new Uint8Array(Z);
            for (let z = 0; z < Z; z++) {
                row[z] = vol[(x * Y * Z) + (sy * Z) + z];
            }
            slice.push(row);
        }
        return orient2D(slice, orientIRM.coronal);
    }, [results?.data_uint8, results?.shape, sliceIndices.coronal, orientIRM.coronal]);

    const axOriented = useMemo(() => {
        if (!results?.data_uint8) return null;
        const [X, Y, Z] = results.shape;
        const vol = results.data_uint8;
        const sz = sliceIndices.axial;
        if (sz < 0 || sz >= Z) return null;
        const slice = [];
        for (let x = 0; x < X; x++) {
            const row = new Uint8Array(Y);
            for (let y = 0; y < Y; y++) {
                row[y] = vol[(x * Y * Z) + (y * Z) + sz];
            }
            slice.push(row);
        }
        return orient2D(slice, orientIRM.axial);
    }, [results?.data_uint8, results?.shape, sliceIndices.axial, orientIRM.axial]);

    const sliceDims = useMemo(() => {
        if (!results?.shape) return null;
        const [X, Y, Z] = results.shape;
        const sagDispW = sagOriented?.[0]?.length ?? 0;
        const sagDispH = sagOriented?.length ?? 0;
        const corDispW = corOriented?.[0]?.length ?? 0;
        const corDispH = corOriented?.length ?? 0;
        const axDispW = axOriented?.[0]?.length ?? 0;
        const axDispH = axOriented?.length ?? 0;
        return {
            sagW: Z, sagH: Y, 
            corW: Z, corH: X, 
            axW: Y, axH: X,
            sagDispW, sagDispH, corDispW, corDispH, axDispW, axDispH
        };
    }, [results?.shape, sagOriented, corOriented, axOriented]);

    const safeNum = (v) => (typeof v === "number" ? v : null);

    const crosshairXY = (plane, sliceW, sliceH, xOrig, yOrig) => {
        let x = safeNum(xOrig);
        let y = safeNum(yOrig);
        if (x == null || y == null) return { x: null, y: null };
        const o = orientIRM[plane] || {};
        return forwardPoint(x, y, sliceW, sliceH, o);
    };

    if (!results) {
        return (
            <div className="card irm-card">
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button className="btn-secondary" onClick={() => onDelete(cardId)} style={{ color: "var(--danger)" }}>Supprimer</button>
                </div>
                {renderUploadForm("IRM", cardId)}
            </div>
        );
    }

    const {
        sagW, sagH, corW, corH, axW, axH,
        sagDispW, sagDispH, corDispW, corDispH, axDispW, axDispH
    } = sliceDims || {};

    return (
        <div className="card irm-card">
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "1rem",
                    flexWrap: "wrap",
                    marginBottom: "1rem"
                }}
            >
                <h2>Résultats IRM : {results.nom_fichier}</h2>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button className="btn-secondary" onClick={() => onDuplicate(results)}>Dupliquer</button>
                    <button className="btn-secondary" onClick={() => onDelete(cardId)} style={{ color: "var(--danger)" }}>Supprimer</button>
                </div>
            </div>


            <div className="viz-grid">
                {/* Sagittal */}
                <div className="slice-control">
                    <SliceCanvas
                        data={sagOriented}
                        title={`Sagittal (X=${sliceIndices.sagittal})`}
                        onClick={(xDisp, yDisp) => {
                            const p = inversePoint(xDisp, yDisp, sagDispW, sagDispH, orientIRM.sagittal);
                            setSliceIndices(prev => ({ ...prev, coronal: p.y, axial: p.x }));
                            setCursor3D(prev => ({ ...prev, y: p.y, z: p.x }));
                        }}
                        crosshair={crosshairXY("sagittal", sagW, sagH, cursor3D?.z, cursor3D?.y)}
                    />
                    <input type="range" min="0" max={results.shape[0] - 1} value={sliceIndices.sagittal} onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        setSliceIndices(prev => ({ ...prev, sagittal: val }));
                        setCursor3D(prev => ({ ...prev, x: val }));
                    }} className="volume-slider" />
                </div>

                {/* Coronal */}
                <div className="slice-control">
                    <SliceCanvas
                        data={corOriented}
                        title={`Coronal (Y=${sliceIndices.coronal})`}
                        onClick={(xDisp, yDisp) => {
                            const p = inversePoint(xDisp, yDisp, corDispW, corDispH, orientIRM.coronal);
                            setSliceIndices(prev => ({ ...prev, sagittal: p.y, axial: p.x }));
                            setCursor3D(prev => ({ ...prev, x: p.y, z: p.x }));
                        }}
                        crosshair={crosshairXY("coronal", corW, corH, cursor3D?.z, cursor3D?.x)}
                    />
                    <input type="range" min="0" max={results.shape[1] - 1} value={sliceIndices.coronal} onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        setSliceIndices(prev => ({ ...prev, coronal: val }));
                        setCursor3D(prev => ({ ...prev, y: val }));
                    }} className="volume-slider" />
                </div>

                {/* Axial */}
                <div className="slice-control">
                    <SliceCanvas
                        data={axOriented}
                        title={`Axial (Z=${sliceIndices.axial})`}
                        onClick={(xDisp, yDisp) => {
                            const p = inversePoint(xDisp, yDisp, axDispW, axDispH, orientIRM.axial);
                            setSliceIndices(prev => ({ ...prev, sagittal: p.y, coronal: p.x }));
                            setCursor3D(prev => ({ ...prev, x: p.y, y: p.x }));
                        }}
                        crosshair={crosshairXY("axial", axW, axH, cursor3D?.y, cursor3D?.x)}
                    />
                    <input type="range" min="0" max={results.shape[2] - 1} value={sliceIndices.axial} onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        setSliceIndices(prev => ({ ...prev, axial: val }));
                        setCursor3D(prev => ({ ...prev, z: val }));
                    }} className="volume-slider" />
                </div>

                <div className="slice-control" style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: "350px" }}>
                    <div style={{ flex: 1, width: "100%", minHeight: "300px", background: "black", borderRadius: "4px", overflow: "hidden" }}>
                        <Fusion3D irmData={results} cursor3D={cursor3D} />
                    </div>
                    <span className="slice-label" style={{ marginTop: "0.5rem" }}>3D Brain Preview</span>
                </div>
            </div>
        </div>
    );
};

export default IrmCard;
