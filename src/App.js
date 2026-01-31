import React, { useState, useEffect } from "react";
import { useContext } from "react";
import "./App.css";
import AuthContext from "./context/AuthContext";
import Login from "./components/Login";
import SliceCanvas from "./components/SliceCanvas";
import Fusion3D from "./components/Fusion3D"; // New 3D View import
import SpectrumChart from "./components/SpectrumChart";
import PatientsExplorer from "./components/PatientsExplorer";
import FusionViewer from "./components/FusionViewer";
const API_URL = "http://127.0.0.1:8000";

// ===============================
// Helpers orientation 2D
// ===============================
const transpose2D = (m) => m[0].map((_, i) => m.map((row) => row[i]));
const flipX2D = (m) => m.map((row) => [...row].reverse()); // miroir gauche/droite
const flipY2D = (m) => [...m].reverse(); // miroir haut/bas

const rot90CW2D = (m) => flipX2D(transpose2D(m)); // 90° horaire
const rot90CCW2D = (m) => flipY2D(transpose2D(m)); // 90° anti-horaire
const rot1802D = (m) => flipY2D(flipX2D(m));

/**
 * o = { transpose?:boolean, rotate?:0|90|-90|180, flipX?:boolean, flipY?:boolean }
 */
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

/**
 * Inverse transform pour convertir un clic (x,y) sur l'image affichée
 * vers les coords de l'image originale (avant orient2D).
 *
 * ⚠️ IMPORTANT: width/height doivent être ceux de l'image AFFICHÉE (après orient2D),
 * pas ceux de la slice originale.
 */
const inversePoint = (x, y, width, height, o = {}) => {
    let px = x,
        py = y;
    let w = width,
        h = height;

    // Inverse flips (appliqués en dernier)
    if (o.flipY) py = h - 1 - py;
    if (o.flipX) px = w - 1 - px;

    // Inverse rotation
    if (o.rotate === 180) {
        px = w - 1 - px;
        py = h - 1 - py;
    } else if (o.rotate === 90) {
        // inverse d'un 90° CW = 90° CCW
        const nx = py;
        const ny = w - 1 - px;
        px = nx;
        py = ny;
        [w, h] = [h, w];
    } else if (o.rotate === -90) {
        // inverse d'un 90° CCW = 90° CW
        const nx = h - 1 - py;
        const ny = px;
        px = nx;
        py = ny;
        [w, h] = [h, w];
    }

    // Inverse transpose
    if (o.transpose) {
        const nx = py;
        const ny = px;
        px = nx;
        py = ny;
        [w, h] = [h, w];
    }

    return { x: px, y: py };
};

/**
 * Transforme un point (x,y) de l'image ORIGINALE vers l'image AFFICHÉE
 * (après orient2D). À utiliser pour les crosshairs.
 */
const forwardPoint = (x, y, width, height, o = {}) => {
    let px = x,
        py = y;
    let w = width,
        h = height;

    // Appliquer les mêmes opérations que orient2D, dans le même ordre
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

// ===============================
// UI Debug orientation (facultatif mais pratique)
// ===============================
const PLANE_LABEL = {
    sagittal: "Sagittal",
    coronal: "Coronal",
    axial: "Axial",
};

function App() {
    const { user, token, logout, loading: authLoading } = useContext(AuthContext);
    const [view, setView] = useState("home");
    const [backendStatus, setBackendStatus] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [irmResults, setIrmResults] = useState(null);
    const [mrsiResults, setMrsiResults] = useState(null);
    const [theme, setTheme] = useState(
        () => localStorage.getItem("theme") || "light",
    );

    // Navigation 3D
    const [sliceIndices, setSliceIndices] = useState({
        sagittal: 0,
        coronal: 0,
        axial: 0,
        mrsi: 0,
    });

    // Cursor 3D pour synchro crosshair IRM
    const [cursor3D, setCursor3D] = useState({ x: null, y: null, z: null });

    // MRSI Interaction
    const [selectedVoxel, setSelectedVoxel] = useState(null);
    const [currentSpectrum, setCurrentSpectrum] = useState(null);

    const [orientIRM, setOrientIRM] = useState({
        sagittal: { flipY: false, flipX: false, rotate: -90, transpose: false },
        coronal: { flipY: false, flipX: false, rotate: -90, transpose: false },
        axial: { flipY: false, flipX: false, rotate: 90, transpose: false },
    });

    // Helpers
    const safeNum = (v) => (typeof v === "number" ? v : null);

    // Crosshair "au moins correct" pour flipX/flipY (et stable si rotate/transpose = 0)
    const crosshairXY = (plane, sliceW, sliceH, xOrig, yOrig) => {
        let x = safeNum(xOrig);
        let y = safeNum(yOrig);
        if (x == null || y == null) return { x: null, y: null };

        const o = orientIRM[plane] || {};
        return forwardPoint(x, y, sliceW, sliceH, o);
    };

    // Handlers IRM crosshair (synchro des 3 vues) — coords en référentiel ORIGINAL
    const handleAxialClick = (x, y) => {
        const z = sliceIndices.axial;
        setCursor3D({ x, y, z });
        setSliceIndices((prev) => ({
            ...prev,
            sagittal: x,
            coronal: y,
            axial: z,
        }));
    };

    const handleCoronalClick = (x, z) => {
        const y = sliceIndices.coronal;
        setCursor3D({ x, y, z });
        setSliceIndices((prev) => ({
            ...prev,
            sagittal: x,
            coronal: y,
            axial: z,
        }));
    };

    const handleSagittalClick = (y, z) => {
        const x = sliceIndices.sagittal;
        setCursor3D({ x, y, z });
        setSliceIndices((prev) => ({
            ...prev,
            sagittal: x,
            coronal: y,
            axial: z,
        }));
    };

    useEffect(() => {
        if (user) {
            checkStatus();
            const interval = setInterval(checkStatus, 10000);
            return () => clearInterval(interval);
        }
    }, [user]);

    useEffect(() => {
        document.documentElement.setAttribute("data-theme", theme);
        localStorage.setItem("theme", theme);
    }, [theme]);

    const checkStatus = async () => {
        try {
            const res = await fetch(`${API_URL}/`);
            if (res.ok) setBackendStatus(true);
            else setBackendStatus(false);
        } catch {
            setBackendStatus(false);
        }
    };

    const handleUpload = async (e, type) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const file = formData.get("fichier");

        if (!file || file.size === 0) {
            setError("Veuillez sélectionner un fichier.");
            return;
        }

        setLoading(true);
        setError("");

        try {
            const endpoint = type === "IRM" ? "/upload-irm/" : "/upload-mrsi/";
            const response = await fetch(`${API_URL}${endpoint}`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token}`
                },
                body: formData,
            });

            if (!response.ok) throw new Error(`Erreur ${response.status}`);

            const data = await response.json();
            if (data?.error) throw new Error(data.error);

            // Initialisation des indices au centre pour l'IRM
            if (data.type === "IRM") {
                setIrmResults(data);
                setSliceIndices((prev) => ({
                    ...prev,
                    sagittal: Math.floor(data.shape[0] / 2),
                    coronal: Math.floor(data.shape[1] / 2),
                    axial: Math.floor(data.shape[2] / 2),
                }));
                // Reset cursor
                setCursor3D({ 
                     x: Math.floor(data.shape[0] / 2),
                     y: Math.floor(data.shape[1] / 2),
                     z: Math.floor(data.shape[2] / 2)
                });
                setView("irm");
            } else if (data.type === "MRSI") {
                setMrsiResults(data);
                setSliceIndices((prev) => ({
                    ...prev,
                    mrsi: Math.floor(data.shape[2] / 2),
                }));
                setSelectedVoxel(null);
                setCurrentSpectrum(null);
                setView("mrsi");
            }
        } catch (err) {
            setError(`Erreur lors de l'envoi : ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    const fetchSpectrum = async (x, y, zOverride = null) => {
        if (!mrsiResults) return;

        const z = zOverride !== null ? zOverride : sliceIndices.mrsi;
        setLoading(true);
        try {
            const response = await fetch(`${API_URL}/spectrum/${x}/${y}/${z}`, {
                headers: {
                    "Authorization": `Bearer ${token}`
                }
            });
            const data = await response.json();
            if (data.error) throw new Error(data.error);
            setCurrentSpectrum(data);
            setSelectedVoxel({ x, y });
            return data; // Return for FusionViewer
        } catch (err) {
            setError(`Erreur spectre : ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    const renderHome = () => (
        <div className="card">
            <h2>Bienvenue sur Plateforme Cancer</h2>
            <p>
                Cette application permet de visualiser et d'analyser des données
                médicales IRM et MRSI.
            </p>
            <div className="info-grid" style={{ marginTop: "2rem" }}>
                <div className="info-card">
                    <h3>🧠 IRM</h3>
                    <p>
                        Visualisation de coupes sagittales, coronales et
                        axiales.
                    </p>
                </div>
                <div className="info-card">
                    <h3>📊 MRSI</h3>
                    <p>Analyse spectrographique et cartes de voxels.</p>
                </div>
            </div>
        </div>
    );

    const renderUploadForm = (type) => (
        <div className="card">
            <h2>Upload {type}</h2>
            <form onSubmit={(e) => handleUpload(e, type)}>
                <div className="form-group">
                    <label>Fichier NIfTI (.nii, .nii.gz)</label>
                    <input
                        type="file"
                        name="fichier"
                        accept=".nii,.gz"
                        required
                    />
                </div>
                <button
                    type="submit"
                    className="btn-primary"
                    disabled={loading || !backendStatus}
                >
                    {loading ? "Traitement..." : `Analyser ${type}`}
                </button>
                {!backendStatus && (
                    <p
                        className="status-error"
                        style={{ fontSize: "0.8rem", marginTop: "0.5rem" }}
                    >
                        Backend hors ligne
                    </p>
                )}
            </form>
        </div>
    );

    const renderOrientationControls = () => (
        <div
            className="card"
            style={{
                padding: "0.75rem 1rem",
                marginBottom: "1rem",
                borderLeft: "4px solid var(--text-muted)",
            }}
        >
            <div
                style={{
                    display: "flex",
                    gap: "1rem",
                    flexWrap: "wrap",
                    alignItems: "center",
                }}
            >
                <strong>Orientation IRM (debug)</strong>
                <span
                    style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}
                >
                    Ajuste ici jusqu’à obtenir la bonne vue, puis fige les
                    valeurs.
                </span>
            </div>

            <div
                style={{
                    display: "flex",
                    gap: "0.5rem",
                    flexWrap: "wrap",
                    marginTop: "0.5rem",
                    justifyContent: "center"
                }}
            >
                {["sagittal", "coronal", "axial"].map((plane) => (
                    <div
                        key={plane}
                        style={{
                            display: "flex",
                            gap: "0.75rem",
                            alignItems: "center",
                            padding: "0.5rem 0.75rem",
                            border: "1px solid var(--border-color)",
                            borderRadius: "10px",
                            background: "var(--card-bg)",
                        }}
                    >
                        <strong style={{ minWidth: 70 }}>
                            {PLANE_LABEL[plane]}
                        </strong>

                        <label
                            style={{
                                display: "flex",
                                gap: 6,
                                alignItems: "center",
                            }}
                        >
                            <input
                                type="checkbox"
                                checked={orientIRM[plane].flipX}
                                onChange={(e) =>
                                    setOrientIRM((p) => ({
                                        ...p,
                                        [plane]: {
                                            ...p[plane],
                                            flipX: e.target.checked,
                                        },
                                    }))
                                }
                            />
                            flipX
                        </label>

                        <label
                            style={{
                                display: "flex",
                                gap: 6,
                                alignItems: "center",
                            }}
                        >
                            <input
                                type="checkbox"
                                checked={orientIRM[plane].flipY}
                                onChange={(e) =>
                                    setOrientIRM((p) => ({
                                        ...p,
                                        [plane]: {
                                            ...p[plane],
                                            flipY: e.target.checked,
                                        },
                                    }))
                                }
                            />
                            flipY
                        </label>

                        <label
                            style={{
                                display: "flex",
                                gap: 6,
                                alignItems: "center",
                            }}
                        >
                            rotate
                            <select
                                value={orientIRM[plane].rotate}
                                onChange={(e) =>
                                    setOrientIRM((p) => ({
                                        ...p,
                                        [plane]: {
                                            ...p[plane],
                                            rotate: parseInt(
                                                e.target.value,
                                                10,
                                            ),
                                        },
                                    }))
                                }
                            >
                                <option value={0}>0</option>
                                <option value={90}>90</option>
                                <option value={-90}>-90</option>
                                <option value={180}>180</option>
                            </select>
                        </label>

                        <label
                            style={{
                                display: "flex",
                                gap: 6,
                                alignItems: "center",
                            }}
                        >
                            <input
                                type="checkbox"
                                checked={orientIRM[plane].transpose}
                                onChange={(e) =>
                                    setOrientIRM((p) => ({
                                        ...p,
                                        [plane]: {
                                            ...p[plane],
                                            transpose: e.target.checked,
                                        },
                                    }))
                                }
                            />
                            transpose
                        </label>
                    </div>
                ))}
            </div>
        </div>
    );

    const renderResults = (results) => {
        if (!results) return null;

        if (results.type === "IRM") {
            // Optimization Update: results.data is [X][Y][Z] (single 3D array)
            const vol = results.data;
            if (!vol) {
                // Handle legacy state/error
                return <div className="error-message">Données invalides ou obsolètes. Veuillez re-uploader le fichier.</div>;
            }

            // Extract slices on the fly
            const sx = sliceIndices.sagittal;
            const sy = sliceIndices.coronal;
            const sz = sliceIndices.axial;

            // Sagittal: vol[sx][:][:] -> Y x Z
            // Note: vol[sx] returns a 2D array [Y][Z]
            const sagSlice = (sx < vol.length) ? vol[sx] : [];

            // Coronal: vol[:][sy][:] -> X x Z
            // We need to map row by row
            const corSlice = vol.map(row => (sy < row.length) ? row[sy] : []);

            // Axial: vol[:][:][sz] -> X x Y
            const axSlice = vol.map(row => row.map(col => (sz < col.length) ? col[sz] : 0));

            // dims originales (avant orientation)
            const sagH = sagSlice?.length ?? 0;
            const sagW = sagSlice?.[0]?.length ?? 0;

            const corW = corSlice?.[0]?.length ?? 0;
            const corH = corSlice?.length ?? 0;

            const axH = axSlice?.length ?? 0;
            const axW = axSlice?.[0]?.length ?? 0;

            // ✅ slices orientées + dims affichées (après orientation)
            const sagOriented = orient2D(sagSlice, orientIRM.sagittal);
            const sagDispH = sagOriented?.length ?? 0;
            const sagDispW = sagOriented?.[0]?.length ?? 0;

            const corOriented = orient2D(corSlice, orientIRM.coronal);
            const corDispH = corOriented?.length ?? 0;
            const corDispW = corOriented?.[0]?.length ?? 0;

            const axOriented = orient2D(axSlice, orientIRM.axial);
            const axDispH = axOriented?.length ?? 0;
            const axDispW = axOriented?.[0]?.length ?? 0;

            return (
                <div className="card">
                    <h2>Résultats IRM : {results.nom_fichier}</h2>

                    {/* Panneau d’orientation pour trouver rapidement la bonne config */}
                    {renderOrientationControls()}

                    <div className="viz-grid">
                        {/* Sagittal */}
                        <div className="slice-control">
                            <SliceCanvas
                                data={sagOriented}
                                title={`Sagittal (X=${sliceIndices.sagittal})`}
                                onClick={(xDisp, yDisp) => {
                                    // ✅ on inverse avec les dims AFFICHÉES
                                    const p = inversePoint(
                                        xDisp,
                                        yDisp,
                                        sagDispW,
                                        sagDispH,
                                        orientIRM.sagittal,
                                    );
                                    // Fix: p.y is Y (row), p.x is Z (col)
                                    handleSagittalClick(p.y, p.x);
                                }}
                                crosshair={crosshairXY(
                                    "sagittal",
                                    sagW,
                                    sagH,
                                    // Fix: Horizontal is Z, Vertical is Y
                                    cursor3D?.z,
                                    cursor3D?.y,
                                )}
                            />
                            <input
                                type="range"
                                min="0"
                                max={results.shape[0] - 1}
                                value={sliceIndices.sagittal}
                                onChange={(e) =>
                                    setSliceIndices((prev) => ({
                                        ...prev,
                                        sagittal: parseInt(e.target.value, 10),
                                    }))
                                }
                                className="volume-slider"
                            />
                        </div>

                        {/* Coronal */}
                        <div className="slice-control">
                            <SliceCanvas
                                data={corOriented}
                                title={`Coronal (Y=${sliceIndices.coronal})`}
                                onClick={(xDisp, yDisp) => {
                                    // ✅ on inverse avec les dims AFFICHÉES
                                    const p = inversePoint(
                                        xDisp,
                                        yDisp,
                                        corDispW,
                                        corDispH,
                                        orientIRM.coronal,
                                    );
                                    // Fix: p.y is X (row), p.x is Z (col)
                                    handleCoronalClick(p.y, p.x);
                                }}
                                crosshair={crosshairXY(
                                    "coronal",
                                    corW,
                                    corH,
                                    // Fix: Horizontal is Z, Vertical is X
                                    cursor3D?.z,
                                    cursor3D?.x,
                                )}
                            />
                            <input
                                type="range"
                                min="0"
                                max={results.shape[1] - 1}
                                value={sliceIndices.coronal}
                                onChange={(e) =>
                                    setSliceIndices((prev) => ({
                                        ...prev,
                                        coronal: parseInt(e.target.value, 10),
                                    }))
                                }
                                className="volume-slider"
                            />
                        </div>

                        {/* Axial */}
                        <div className="slice-control">
                            <SliceCanvas
                                data={axOriented}
                                title={`Axial (Z=${sliceIndices.axial})`}
                                onClick={(xDisp, yDisp) => {
                                    // ✅ on inverse avec les dims AFFICHÉES
                                    const p = inversePoint(
                                        xDisp,
                                        yDisp,
                                        axDispW,
                                        axDispH,
                                        orientIRM.axial,
                                    );
                                    // Fix: p.y is X (row), p.x is Y (col)
                                    handleAxialClick(p.y, p.x);
                                }}
                                crosshair={crosshairXY(
                                    "axial",
                                    axW,
                                    axH,
                                    // Fix: Horizontal is Y, Vertical is X
                                    cursor3D?.y,
                                    cursor3D?.x,
                                )}
                            />
                            <input
                                type="range"
                                min="0"
                                max={results.shape[2] - 1}
                                value={sliceIndices.axial}
                                onChange={(e) =>
                                    setSliceIndices((prev) => ({
                                        ...prev,
                                        axial: parseInt(e.target.value, 10),
                                    }))
                                }
                                className="volume-slider"
                            />
                        </div>


                        {/* 4. 3D Brain View */}
                        <div className="slice-control" style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: "350px"}}>
                             <div style={{ flex: 1, width: "100%", minHeight: "300px", background: "black", borderRadius: "4px", overflow:"hidden" }}>
                                <Fusion3D 
                                    irmData={results} 
                                    cursor3D={cursor3D} 
                                />
                             </div>
                             <span className="slice-label" style={{marginTop: "0.5rem"}}>3D Brain Preview</span>
                        </div>
                    </div>

                    <div
                        style={{
                            marginTop: "1rem",
                            color: "var(--text-muted)",
                            fontSize: "0.85rem",
                        }}
                    >
                        Astuce: commence par flipY, puis teste rotate 90 / -90
                        sur la vue qui reste “bizarre”.
                    </div>
                </div>
            );
        }

        if (results.type === "MRSI") {
            return (
                <div className="card">
                    <h2>Résultats MRSI : {results.nom}</h2>
                    <p className="instruction">
                        Utilisez le slider pour changer de coupe, puis cliquez
                        sur un voxel pour voir son spectre.
                    </p>
                    <div className="mrsi-layout">
                        <div className="viz-grid single">
                            <div className="slice-control">
                                <SliceCanvas
                                    data={
                                        results.voxel_map_all[sliceIndices.mrsi]
                                    }
                                    title={`Voxel Map (Z=${sliceIndices.mrsi})`}
                                    onClick={fetchSpectrum}
                                    selectedVoxel={selectedVoxel}
                                    isMRSI={true}
                                />
                                <div className="slice-selector">
                                    <label htmlFor="mrsi-z-select">
                                        Sélectionner la coupe Z :{" "}
                                    </label>
                                    <select
                                        id="mrsi-z-select"
                                        value={sliceIndices.mrsi}
                                        onChange={(e) => {
                                            const newZ = parseInt(
                                                e.target.value,
                                                10,
                                            );
                                            setSliceIndices((prev) => ({
                                                ...prev,
                                                mrsi: newZ,
                                            }));
                                            if (selectedVoxel)
                                                fetchSpectrum(
                                                    selectedVoxel.x,
                                                    selectedVoxel.y,
                                                    newZ,
                                                );
                                        }}
                                        className="form-select"
                                    >
                                        {[
                                            ...Array(results.shape[2]).keys(),
                                        ].map((z) => (
                                            <option key={z} value={z}>
                                                Coupe {z}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>

                        {currentSpectrum && (
                            <SpectrumChart data={currentSpectrum} />
                        )}
                    </div>

                    <div
                        style={{
                            marginTop: "1.5rem",
                            color: "var(--text-muted)",
                        }}
                    >
                        Méthode : {results.method} | Shape :{" "}
                        {results.shape.join(" x ")}
                    </div>
                </div>
            );
        }

        return (
            <div className="card">
                <pre>{JSON.stringify(results, null, 2)}</pre>
            </div>
        );
    };

    if (authLoading) return <div className="loading-screen">Chargement...</div>;
    if (!user) return <Login />;

    return (
        <div className="App">
            <div className="sidebar">
                <div className="sidebar-header">
                    <span style={{ fontSize: "1.5rem" }}>🏥</span>
                    <h1>Cancer Platform</h1>
                </div>
                <nav className="nav-links">
                    <div
                        className={`nav-item ${view === "home" ? "active" : ""}`}
                        onClick={() => setView("home")}
                    >
                        <span>🏠 Accueil</span>
                    </div>
                    <div
                        className={`nav-item ${view === "irm" ? "active" : ""}`}
                        onClick={() => setView("irm")}
                    >
                        <span>🧠 Upload IRM</span>
                    </div>
                    <div
                        className={`nav-item ${view === "mrsi" ? "active" : ""}`}
                        onClick={() => setView("mrsi")}
                    >
                        <span>📊 Upload MRSI</span>
                    </div>
                    <div
                        className={`nav-item ${view === "patients" ? "active" : ""}`}
                        onClick={() => setView("patients")}
                    >
                        <span>👤 Patients</span>
                    </div>

                    <div
                        className={`nav-item ${view === "fusion" ? "active" : ""} ${(!irmResults || !mrsiResults) ? "disabled" : ""}`}
                        onClick={() => {
                            if (irmResults && mrsiResults) setView("fusion");
                        }}
                        style={{ 
                            opacity: (!irmResults || !mrsiResults) ? 0.5 : 1,
                            cursor: (!irmResults || !mrsiResults) ? "not-allowed" : "pointer" 
                        }}
                    >
                        <span>🔮 Fusion</span>
                    </div>
                </nav>
                
                <div className="sidebar-footer">
                     <button className="btn-logout" onClick={logout}>Déconnexion</button>
                </div>
            </div>

            <div className="main-area">
                <div className="top-bar">
                    <div className="status-indicator">
                        <div
                            className={`dot ${backendStatus ? "connected" : "disconnected"}`}
                        ></div>
                        <span>
                            Backend {backendStatus ? "Connecté" : "Déconnecté"}
                        </span>
                    </div>
                    <div
                        className="user-info"
                        style={{ display: "flex", gap: 12 }}
                    >
                        <button
                            className="theme-toggle"
                            onClick={() =>
                                setTheme((t) =>
                                    t === "dark" ? "light" : "dark",
                                )
                            }
                        >
                            {theme === "dark" ? "☀️ Light" : "🌙 Dark"}
                        </button>
                        <span
                            style={{
                                color: "var(--text-muted)",
                                fontSize: "0.875rem",
                            }}
                        >
                            {user.username}
                        </span>
                    </div>
                </div>

                {error && (
                    <div
                        className="card"
                        style={{
                            borderLeft: "4px solid var(--danger)",
                            color: "var(--danger)",
                        }}
                    >
                        {error}
                    </div>
                )}

                {view === "home" && renderHome()}
                {view === "irm" && (
                    <>
                        {renderUploadForm("IRM")}
                        {renderResults(irmResults)}
                    </>
                )}
                {view === "mrsi" && (
                    <>
                        {renderUploadForm("MRSI")}
                        {renderResults(mrsiResults)}
                    </>
                )}
                {view === "fusion" && (
                    <FusionViewer 
                        irmData={irmResults} 
                        mrsiData={mrsiResults}
                        fetchSpectrum={(x,y,z) => fetchSpectrum(x,y,z)} 
                    />
                )}
                {view === "patients" && <PatientsExplorer />}
            </div>
        </div>
    );
}

export default App;
