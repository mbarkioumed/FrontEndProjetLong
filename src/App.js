import React, { useState, useEffect, useMemo } from "react";
import { useContext } from "react";
import "./App.css";
import AuthContext from "./context/AuthContext";
import Login from "./components/Login";
import SliceCanvas from "./components/SliceCanvas";
import Fusion3D from "./components/Fusion3D"; // New 3D View import
import FusionViewer from "./components/FusionViewer";
import SpectrumChart from "./components/SpectrumChart";
import PatientsExplorer from "./components/PatientsExplorer";

import { api } from "./api/client";

const base64ToUint8Array = (base64) => {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
};


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
        py = h- 1 - py;
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

// ===============================
// UI Debug orientation (facultatif mais pratique)
// ===============================
const PLANE_LABEL = {
    sagittal: "Sagittal",
    coronal: "Coronal",
    axial: "Axial",
};

function App() {
    const {
        user,
        token,
        logout,
        loading: authLoading,
    } = useContext(AuthContext);
    const [view, setView] = useState("home");
    const [backendStatus, setBackendStatus] = useState(false);
    const [selectedTraitement, setSelectedTraitement] = useState("fft_spatiale");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [irmResults, setIrmResults] = useState(null);
    const canRunIrm = irmResults?.nom_fichier ? true : false;
    const [reference3DData, setReference3DData] = useState(null); // Stable data for 3D View
    const [mrsiResults, setMrsiResults] = useState(null);
    const canRunMrsi = mrsiResults?.nom ? true : false;
    const [theme, setTheme] = useState(
        () => localStorage.getItem("theme") || "light",
    );
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(
        () => localStorage.getItem("sidebarCollapsed") === "true",
    );
    const [isRightSidebarCollapsed, setIsRightSidebarCollapsed] = useState(
        () => localStorage.getItem("rightSidebarCollapsed") === "true",
    );

    useEffect(() => {
        localStorage.setItem("sidebarCollapsed", isSidebarCollapsed);
    }, [isSidebarCollapsed]);

    useEffect(() => {
        localStorage.setItem("rightSidebarCollapsed", isRightSidebarCollapsed);
    }, [isRightSidebarCollapsed]);

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
        coronal: { flipY: false, flipX: true, rotate: -90, transpose: false },
        axial: { flipY: false, flipX: false, rotate: 90, transpose: false },
    });

    // ===============================
    // Optimization: Efficient Slicing from Flat Uint8Array
    // ===============================
    const sagOriented = useMemo(() => {
        if (!irmResults?.data_uint8) return null;
        const [X, Y, Z] = irmResults.shape;
        const vol = irmResults.data_uint8;
        const sx = sliceIndices.sagittal;
        if (sx < 0 || sx >= X) return null;

        // Extract slice [sx, :, :] -> original orientation [Y][Z] (row=Y, col=Z)
        const slice = [];
        for (let y = 0; y < Y; y++) {
            const row = new Uint8Array(Z);
            const offset = (sx * Y * Z) + (y * Z);
            row.set(vol.subarray(offset, offset + Z));
            slice.push(Array.from(row));
        }
        return orient2D(slice, orientIRM.sagittal);
    }, [irmResults?.data_uint8, irmResults?.shape, sliceIndices.sagittal, orientIRM.sagittal]);

    const corOriented = useMemo(() => {
        if (!irmResults?.data_uint8) return null;
        const [X, Y, Z] = irmResults.shape;
        const vol = irmResults.data_uint8;
        const sy = sliceIndices.coronal;
        if (sy < 0 || sy >= Y) return null;

        // Extract slice [:, sy, :] -> original orientation [X][Z] (row=X, col=Z)
        const slice = [];
        for (let x = 0; x < X; x++) {
            const row = new Uint8Array(Z);
            for (let z = 0; z < Z; z++) {
                row[z] = vol[(x * Y * Z) + (sy * Z) + z];
            }
            slice.push(Array.from(row));
        }
        return orient2D(slice, orientIRM.coronal);
    }, [irmResults?.data_uint8, irmResults?.shape, sliceIndices.coronal, orientIRM.coronal]);

    const axOriented = useMemo(() => {
        if (!irmResults?.data_uint8) return null;
        const [X, Y, Z] = irmResults.shape;
        const vol = irmResults.data_uint8;
        const sz = sliceIndices.axial;
        if (sz < 0 || sz >= Z) return null;

        // Extract slice [:, :, sz] -> original orientation [X][Y] (row=X, col=Y)
        const slice = [];
        for (let x = 0; x < X; x++) {
            const row = new Uint8Array(Y);
            for (let y = 0; y < Y; y++) {
                row[y] = vol[(x * Y * Z) + (y * Z) + sz];
            }
            slice.push(Array.from(row));
        }
        return orient2D(slice, orientIRM.axial);
    }, [irmResults?.data_uint8, irmResults?.shape, sliceIndices.axial, orientIRM.axial]);

    const sliceDims = useMemo(() => {
        if (!irmResults?.shape) return null;
        const [X, Y, Z] = irmResults.shape;

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
    }, [irmResults?.shape, sagOriented, corOriented, axOriented]);

    // Helpers
    const safeNum = (v) => (typeof v === "number" ? v : null);

    const crosshairXY = (plane, sliceW, sliceH, xOrig, yOrig) => {
        let x = safeNum(xOrig);
        let y = safeNum(yOrig);
        if (x == null || y == null) return { x: null, y: null };

        const o = orientIRM[plane] || {};
        return forwardPoint(x, y, sliceW, sliceH, o);
    };

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
                    Authorization: `Bearer ${token}`,
                },
                body: formData,
            });

            if (!response.ok) throw new Error(`Erreur ${response.status}`);

            const data = await response.json();
            if (data?.error) throw new Error(data.error);

            // Initialisation des indices au centre pour l'IRM
            if (data.type === "IRM") {
                if (data.data_b64) {
                    data.data_uint8 = base64ToUint8Array(data.data_b64);
                }
                setIrmResults(data);
                setReference3DData(data); // Initialize 3D view with original data
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
                    z: Math.floor(data.shape[2] / 2),
                });
                setView("irm");
            } else if (data.type === "MRSI") {
                if (data.data_b64) {
                    data.data_uint8 = base64ToUint8Array(data.data_b64);
                }
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
    const openExamFromPatients = async ({ irmFiles, mrsiFile, meta }) => {
  setLoading(true);
  setError("");

  try {
    // 1) Choisir une IRM par défaut
    const irmFile = irmFiles && irmFiles.length ? irmFiles[0] : null;

    if (irmFile) {
      const irmData = await api.uploadIRMFile(irmFile, token);
      if (irmData.data_b64) {
        irmData.data_uint8 = base64ToUint8Array(irmData.data_b64);
      }
      setIrmResults(irmData);
      setReference3DData(irmData);

      // init slices center
      setSliceIndices((prev) => ({
        ...prev,
        sagittal: Math.floor(irmData.shape[0] / 2),
        coronal: Math.floor(irmData.shape[1] / 2),
        axial: Math.floor(irmData.shape[2] / 2),
      }));
      setCursor3D({
        x: Math.floor(irmData.shape[0] / 2),
        y: Math.floor(irmData.shape[1] / 2),
        z: Math.floor(irmData.shape[2] / 2),
      });
    }

    if (mrsiFile) {
      const mrsiData = await api.uploadMRSIFile(mrsiFile, token);
      if (mrsiData.data_b64) {
        mrsiData.data_uint8 = base64ToUint8Array(mrsiData.data_b64);
      }
      setMrsiResults(mrsiData);
      setSliceIndices((prev) => ({
        ...prev,
        mrsi: Math.floor(mrsiData.shape[2] / 2),
      }));
      setSelectedVoxel(null);
      setCurrentSpectrum(null);
    }

    // 2) Aller à la vue fusion si possible, sinon IRM
    if (irmFile && mrsiFile) setView("fusion");
    else if (irmFile) setView("irm");
    else if (mrsiFile) setView("mrsi");
    else setView("patients");
  } catch (e) {
    setError(`Ouverture examen impossible : ${e.message}`);
  } finally {
    setLoading(false);
  }
};





    const fetchSpectrum = async (x, y, zVal = null) => {
        const z = zVal !== null ? zVal : sliceIndices.mrsi;
        if (x == null || y == null) return;

        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/spectrum/${x}/${y}/${z}`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });
            if (!res.ok) throw new Error("Erreur affichage spectre");
            const data = await res.json();

            setSelectedVoxel({ x, y, z });
            setCurrentSpectrum(data);
        } catch (err) {
            console.error(err);
            setError("Impossible de charger le spectre.");
        } finally {
            setLoading(false);
        }
    };

    const runTraitement = async (dataInstance) => {
        // dataInstance peut être irmResults ou mrsiResults
        if (!dataInstance?.nom_fichier && !dataInstance?.nom) return;
        setLoading(true);
        setError("");
        try {
            // Déterminer le nom du fichier / instance
            // C'est galère car pour IRM c'est nom_fichier et MRSI c'est nom
            const key = dataInstance.nom_fichier || dataInstance.nom;
            
            const response = await fetch(`${API_URL}/traitements`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    [key]: {
                        type_traitement: selectedTraitement,
                    },
                }),
            });

            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(data?.detail || `Erreur ${response.status}`);
            }

            if (data?.error) throw new Error(data.error);

            const next = data?.[key];
            if (next?.error) throw new Error(next.error);
            if (!next) throw new Error("Réponse traitement inattendue.");

            if (next.type === "IRM") {
                if (next.data_b64) {
                    next.data_uint8 = base64ToUint8Array(next.data_b64);
                }
                setIrmResults(next);
                setSliceIndices((prev) => ({
                    ...prev,
                    sagittal: Math.floor(next.shape[0] / 2),
                    coronal: Math.floor(next.shape[1] / 2),
                    axial: Math.floor(next.shape[2] / 2),
                }));
                setCursor3D({
                    x: Math.floor(next.shape[0] / 2),
                    y: Math.floor(next.shape[1] / 2),
                    z: Math.floor(next.shape[2] / 2),
                });
                setView("irm");
            } else if (next.type === "MRSI") {
                if (next.data_b64) {
                    next.data_uint8 = base64ToUint8Array(next.data_b64);
                }
                setMrsiResults(next);
                setSliceIndices((prev) => ({
                    ...prev,
                    mrsi: Math.floor(next.shape[2] / 2),
                }));
                setSelectedVoxel(null);
                setCurrentSpectrum(null);
                setView("mrsi");
            }
            else {
                setIrmResults(next);
            }
        } catch (err) {
            setError(`Erreur FFT : ${err.message}`);
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
                    justifyContent: "center",
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
            const vol = results.data_uint8;
            if (!vol) {
                return (
                    <div className="error-message">
                        Données invalides ou obsolètes. Veuillez re-uploader le
                        fichier.
                    </div>
                );
            }

            const {
                sagW, sagH, corW, corH, axW, axH,
                sagDispW, sagDispH, corDispW, corDispH, axDispW, axDispH
            } = sliceDims || {};

            return (
                
                <div className="card">
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "1rem",
                            flexWrap: "wrap",
                        }}
                    >
                        
                        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                            <select
                                value={selectedTraitement}
                                onChange={(e) => setSelectedTraitement(e.target.value)}
                                disabled={loading}
                            >
                                <option value="fft_spatiale">FFT Spatiale</option>
                                <option value="fft_spectrale">FFT Spectrale</option>
                                <option value="metabolite_extractor">Extraction de Métabolites</option>
                            </select>
                            <button
                                className="btn-secondary"
                                
                                disabled={loading}
                            >
                                ⚙️ Paramètres (A FAIRE)
                            </button> 
                            <button
                                className="btn-primary"
                                onClick={() =>runTraitement(irmResults)}
                                disabled={loading || !canRunIrm}
                            >
                                {loading ? "Traitement..." : "Lancer Traitement IRM"}
                            </button> 
                        </div>



                        <h2>Résultats IRM : {results.nom_fichier}</h2>
                        
                    </div>

                    {/* Panneau d’orientation pour trouver rapidement la bonne config */}
                    {renderOrientationControls()}

                    <div className="viz-grid">
                        {/* Sagittal */}
                        <div className="slice-control">
                            <SliceCanvas
                                data={sagOriented}
                                title={`Sagittal (X=${sliceIndices.sagittal})`}
                                onClick={(xDisp, yDisp) => {
                                    const p = inversePoint(
                                        xDisp,
                                        yDisp,
                                        sagDispW,
                                        sagDispH,
                                        orientIRM.sagittal,
                                    );
                                    handleSagittalClick(p.y, p.x);
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
                                max={results.shape[0] - 1}
                                value={sliceIndices.sagittal}
                                onChange={(e) => {
                                    const val = parseInt(e.target.value, 10);
                                    setSliceIndices((prev) => ({
                                        ...prev,
                                        sagittal: val,
                                    }));
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
                                    const p = inversePoint(
                                        xDisp,
                                        yDisp,
                                        corDispW,
                                        corDispH,
                                        orientIRM.coronal,
                                    );
                                    handleCoronalClick(p.y, p.x);
                                }}
                                crosshair={crosshairXY(
                                    "coronal",
                                    corW,
                                    corH,
                                    cursor3D?.z,
                                    cursor3D?.x,
                                )}
                            />
                            <input
                                type="range"
                                min="0"
                                max={results.shape[1] - 1}
                                value={sliceIndices.coronal}
                                onChange={(e) => {
                                    const val = parseInt(e.target.value, 10);
                                    setSliceIndices((prev) => ({
                                        ...prev,
                                        coronal: val,
                                    }));
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
                                    const p = inversePoint(
                                        xDisp,
                                        yDisp,
                                        axDispW,
                                        axDispH,
                                        orientIRM.axial,
                                    );
                                    handleAxialClick(p.y, p.x);
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
                                max={results.shape[2] - 1}
                                value={sliceIndices.axial}
                                onChange={(e) => {
                                    const val = parseInt(e.target.value, 10);
                                    setSliceIndices((prev) => ({
                                        ...prev,
                                        axial: val,
                                    }));
                                    setCursor3D((prev) => ({ ...prev, z: val }));
                                }}
                                className="volume-slider"
                            />
                        </div>

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
                                    irmData={reference3DData || results}
                                    cursor3D={cursor3D}
                                />
                            </div>
                            <span
                                className="slice-label"
                                style={{ marginTop: "0.5rem" }}
                            >
                                3D Brain Preview
                            </span>
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
                    
                    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                        <select
                            value={selectedTraitement}
                            onChange={(e) => setSelectedTraitement(e.target.value)}
                            disabled={loading}
                        >
                            <option value="fft_spatiale">FFT Spatiale</option>
                            <option value="fft_spectrale">FFT Spectrale</option>
                            <option value="metabolite_extractor">Extraction de Métabolites</option>
                        </select>
                        <button
                                className="btn-secondary"
                                
                                disabled={loading}
                            >
                                ⚙️ Paramètres (A FAIRE)
                            </button> 
                        <button
                            className="btn-primary"
                            onClick={() =>runTraitement(mrsiResults)}
                            disabled={loading || !canRunMrsi}
                        >
                            {loading ? "Traitement..." : "Lancer Traitement MRSI"}
                        </button>
                    </div>
                    
                    <p className="instruction">
                        Utilisez le slider pour changer de coupe, puis cliquez
                        sur un voxel pour voir son spectre.
                    </p>
                    <div className="mrsi-layout">
                        <div className="viz-grid single">
                            <div className="slice-control">
                                <SliceCanvas
                                    data={(() => {
                                        if (!results.data_uint8) return null;
                                        const [X, Y, Z] = results.shape;
                                        const z = sliceIndices.mrsi;
                                        const slice = [];
                                        for (let x = 0; x < X; x++) {
                                            // Manual extraction for non-contiguous axis (Z is deepest)
                                            // Need manual extraction.
                                            const manualRow = new Uint8Array(Y);
                                            for(let y=0; y<Y; y++) manualRow[y] = results.data_uint8[(x * Y * Z) + (y * Z) + z];
                                            slice.push(manualRow);
                                        }
                                        return slice;
                                    })()}
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
            <div className={`sidebar ${isSidebarCollapsed ? "collapsed" : ""}`}>
                <div className="sidebar-header">
                    <span className="emoji">🏥</span>
                    <h1>Cancer Platform</h1>
                </div>

                <button 
                    className="sidebar-toggle" 
                    onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                    title={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
                >
                    {isSidebarCollapsed ? "→" : "←"}
                </button>

                <nav className="nav-links">
                    <div
                        className={`nav-item ${view === "home" ? "active" : ""}`}
                        onClick={() => setView("home")}
                    >
                        <span className="icon">🏠</span>
                        <span className="label">Accueil</span>
                    </div>
                    <div
                        className={`nav-item ${view === "irm" ? "active" : ""}`}
                        onClick={() => setView("irm")}
                    >
                        <span className="icon">🧠</span>
                        <span className="label">Upload IRM</span>
                    </div>
                    <div
                        className={`nav-item ${view === "mrsi" ? "active" : ""}`}
                        onClick={() => setView("mrsi")}
                    >
                        <span className="icon">📊</span>
                        <span className="label">Upload MRSI</span>
                    </div>
                    <div
                        className={`nav-item ${view === "fusion" ? "active" : ""}`}
                        onClick={() => setView("fusion")}
                    >
                        <span className="icon">🔬</span>
                        <span className="label">Test Fusion</span>
                    </div>
                    <div
                        className={`nav-item ${view === "patients" ? "active" : ""}`}
                        onClick={() => setView("patients")}
                    >
                        <span className="icon">👤</span>
                        <span className="label">Patients</span>
                    </div>
                </nav>

                <div className="sidebar-footer">
                    <button className="btn-logout" onClick={logout}>
                        {isSidebarCollapsed ? "🚪" : "Déconnexion"}
                    </button>
                </div>
            </div>

            <div className={`main-area ${isSidebarCollapsed ? "sidebar-collapsed" : ""} ${isRightSidebarCollapsed ? "right-sidebar-collapsed" : ""}`}>
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
                        onVoxelClick={(x,y,z) => fetchSpectrum(x,y,z)} 
                     />
                )}

                {view === "patients" && <PatientsExplorer onOpenExam={openExamFromPatients} />}



            </div>

            <div className={`sidebar right-sidebar ${isRightSidebarCollapsed ? "collapsed" : ""}`}>
                <div className="sidebar-header">
                    <span className="emoji">⚙️</span>
                    <h1>Actions</h1>
                </div>

                <button 
                    className="sidebar-toggle right" 
                    onClick={() => setIsRightSidebarCollapsed(!isRightSidebarCollapsed)}
                    title={isRightSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
                >
                    {isRightSidebarCollapsed ? "←" : "→"}
                </button>

                <div className="nav-links">
                    {/* RIGHT_SIDEBAR_CONTENT */}
                    <div className="nav-item">
                        <span className="icon">🚀</span>
                        <span className="label">Button 1</span>
                    </div>
                    <div className="nav-item">
                        <span className="icon">🛠️</span>
                        <span className="label">Button 2</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default App;
