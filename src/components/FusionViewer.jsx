import React, { useState, useEffect, useMemo } from "react";
import { api } from "../api/client";
import SliceCanvas from "./SliceCanvas";
import Fusion3D from "./Fusion3D";



export default function FusionViewer({ irmData, mrsiData, onVoxelClick }) {
    // 3D cursor position
    const [crosshair, setCrosshair] = useState({ x: 0, y: 0, z: 0 });
    const [opacity, setOpacity] = useState(0.5);
    const [selectedMetabolite, setSelectedMetabolite] = useState("None");
    const [metaboliteMap, setMetaboliteMap] = useState(null);
    const [loadingMap, setLoadingMap] = useState(false);

    const METABOLITES = ["NAA", "Cr", "Cho"];

    // Initialize crosshair center
    useEffect(() => {
        if (irmData && irmData.shape) {
            setCrosshair({
                x: Math.floor(irmData.shape[0] / 2),
                y: Math.floor(irmData.shape[1] / 2),
                z: Math.floor(irmData.shape[2] / 2),
            });
        }
    }, [irmData]);

    // Fetch Metabolite Data
    useEffect(() => {
        if (selectedMetabolite === "None" || !mrsiData) {
            setMetaboliteMap(null);
            return;
        }

        async function fetchMetabolite() {
            setLoadingMap(true);
            try {
                if (!mrsiData.nom) return;
                
                const catalog = {
                        [mrsiData.nom]: {
                            type_traitement: "metabolite_extractor",
                            params: { metabolites: [selectedMetabolite] }
                        }
                };

                const token = localStorage.getItem("token");
                const data = await api.runTreatment(catalog, token);
                
                if (data && data[mrsiData.nom] && data[mrsiData.nom][selectedMetabolite]) {
                    setMetaboliteMap(data[mrsiData.nom][selectedMetabolite]);
                }
            } catch (e) {
                console.error("Failed to fetch metabolite map", e);
            } finally {
                setLoadingMap(false);
            }
        }
        fetchMetabolite();
    }, [selectedMetabolite, mrsiData]);


    // Slicing Logic
    const slices = useMemo(() => {
        if (!irmData || !irmData.data) return null;
        
        const { data: vol, shape } = irmData;
        const { x: cx, y: cy, z: cz } = crosshair;
        const [X, Y, Z] = shape;

        // Pre-checking map availability
        // Backend now returns map resampled to MRI grid but structured as slices along Z.
        // mapVol is list[Z][X][Y].
        // Access: mapVol[z][x][y].
        let mapVol = null;
        if (metaboliteMap && metaboliteMap.voxel_map_all) {
             mapVol = metaboliteMap.voxel_map_all;
        }

        // Extract MRI slices + Compute Overlay
        const extractSlice = (axis, index) => {
            // axis: 0=Sag(x), 1=Cor(y), 2=Axi(z)
            // Returns { mri: 2D, ov: 2D }
            const mriSlice = [];
            const ovSlice = [];
            
            // Define dimensions for the slice
            // Sag: (Y, Z)
            // Cor: (X, Z)
            // Axi: (X, Y)
            
            let D1, D2; // Width, Height of canvas
            
            if (axis === 0) { // Sagittal (Plane X = index) -> width=Y, height=Z
                D1 = Y; D2 = Z;
            } else if (axis === 1) { // Coronal (Plane Y = index) -> width=X, height=Z
                D1 = X; D2 = Z;
            } else { // Axial (Plane Z = index) -> width=X, height=Y
                D1 = X; D2 = Y;
            }

            for (let r = 0; r < D2; r++) { // height (rows)
                const mriRow = [];
                const ovRow = [];
                for (let c = 0; c < D1; c++) { // width (cols)
                     let val = 0;
                     let i, j, k;
                     
                     // Map 2D (c, r) -> 3D (i, j, k)
                     if (axis === 0) { // Sag: X fixed. c=Y, r=Z. 
                         i = index; j = c; k = r;
                     } else if (axis === 1) { // Cor: Y fixed. c=X, r=Z.
                         i = c; j = index; k = r;
                     } else { // Axi: Z fixed. c=X, r=Y.
                         i = c; j = r; k = index;
                     }

                     // MRI Value (vol is [x][y][z])
                     if (vol[i] && vol[i][j] !== undefined) {
                         val = vol[i][j][k];
                     }
                     mriRow.push(val);
                     
                     // Overlay Value
                     // Masking: if mri val is low (background), skip overlay
                     if (val < 15) {
                         ovRow.push(0);
                     } else {
                         // Direct access: mapVol[k][i][j]
                         let ovVal = 0;
                         if (mapVol && mapVol[k] && mapVol[k][i] !== undefined) {
                             ovVal = mapVol[k][i][j];
                         }
                         ovRow.push(ovVal);
                     }
                }
                mriSlice.push(mriRow);
                ovSlice.push(ovRow);
            }
            return { mri: mriSlice, ov: ovSlice };
        };

        const sag = extractSlice(0, Math.min(cx, X-1));
        const cor = extractSlice(1, Math.min(cy, Y-1));
        const axi = extractSlice(2, Math.min(cz, Z-1));

        return { sag, cor, axi };
    }, [irmData, metaboliteMap, crosshair]);

    const handleCanvasClick = (view, px, py) => {
        if (!irmData?.shape) return;
        const [X, Y, Z] = irmData.shape;
        
        let { x, y, z } = crosshair;
        
        if (view === "sag") {
            // Click on (Y, Z)
            y = px; z = py; 
        } else if (view === "cor") {
            // Click on (X, Z)
            x = px; z = py;
        } else if (view === "axi") {
            // Click on (X, Y)
            x = px; y = py;
        }
        
        // Clamp
        x = Math.max(0, Math.min(x, X - 1));
        y = Math.max(0, Math.min(y, Y - 1));
        z = Math.max(0, Math.min(z, Z - 1));
        
        setCrosshair({ x, y, z });
        
        // Call parent handler (convert to MRSI voxel if needed? logic for clicking usually expects global coords)
        // Parent `onVoxelClick` expects MRSI coordinates.
        if (onVoxelClick && mrsiData) {
            // Map to MRSI
             const rX = mrsiData.shape[0] / X;
             const rY = mrsiData.shape[1] / Y;
             const rZ = mrsiData.shape[2] / Z;
             onVoxelClick(Math.floor(x * rX), Math.floor(y * rY), Math.floor(z * rZ));
        }
    };

    return (
        <div className="fusion-viewer">
            <div className="fusion-controls card">
                <h3>Fusion Controls</h3>
                <div style={{display: "flex", gap: "20px", alignItems: "center", flexWrap: "wrap"}}>
                    <div className="form-group">
                        <label>Metabolite:</label>
                        <select className="form-select" value={selectedMetabolite} onChange={e => setSelectedMetabolite(e.target.value)}>
                            <option value="None">None</option>
                            {METABOLITES.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                    </div>
                    <div className="form-group">
                        <label>Opacity: {Math.round(opacity * 100)}%</label>
                        <input type="range" min="0" max="1" step="0.1" value={opacity} onChange={e => setOpacity(parseFloat(e.target.value))} />
                    </div>
                </div>
                <div style={{marginTop: "10px", color: "var(--text-muted)"}}>
                    Position: [{crosshair.x}, {crosshair.y}, {crosshair.z}]
                </div>
            </div>

            <div className="mrsi-layout"> 
                <div className="viz-grid">
                     {irmData ? (
                         <>
                            <SliceCanvas 
                                data={slices?.sag.mri} 
                                overlay={slices?.sag.ov}
                                opacity={opacity}
                                title={`Sagittal (X=${crosshair.x})`}
                                onClick={(x,y) => handleCanvasClick("sag", x, y)}
                                crosshair={{x: crosshair.y, y: crosshair.z}}
                            />
                            <SliceCanvas 
                                data={slices?.cor.mri} 
                                overlay={slices?.cor.ov}
                                opacity={opacity}
                                title={`Coronal (Y=${crosshair.y})`}
                                onClick={(x,y) => handleCanvasClick("cor", x, y)}
                                crosshair={{x: crosshair.x, y: crosshair.z}}
                            />
                            <SliceCanvas 
                                data={slices?.axi.mri} 
                                overlay={slices?.axi.ov}
                                opacity={opacity}
                                title={`Axial (Z=${crosshair.z})`}
                                onClick={(x,y) => handleCanvasClick("axi", x, y)}
                                crosshair={{x: crosshair.x, y: crosshair.y}}
                            />
                            <div
                                className="slice-control"
                                style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    height: "100%",
                                    minHeight: "350px",
                                }}
                            >
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
                                    <Fusion3D
                                        irmData={irmData}
                                        cursor3D={crosshair}
                                    />
                                </div>
                                <span
                                    className="slice-label"
                                    style={{ marginTop: "0.5rem", fontSize: "0.75rem", fontWeight: "bold", textTransform: "uppercase" }}
                                >
                                    3D Brain Preview
                                </span>
                            </div>
                         </>
                     ) : <p>Please load IRM data first.</p>}
                </div>
                {loadingMap && <div className="loading-overlay">Computing Metabolite Map...</div>}
            </div>
        </div>
    );
}
