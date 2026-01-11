import React, { useState, useEffect, useRef } from "react";
import "./App.css";

const API_URL = "http://127.0.0.1:8000";

const SliceCanvas = ({ data, title, onClick, selectedVoxel, isMRSI }) => {
    const canvasRef = useRef(null);

    useEffect(() => {
        if (canvasRef.current && data) {
            const canvas = canvasRef.current;
            const ctx = canvas.getContext("2d");
            const height = data.length;
            const width = data[0].length;
            canvas.width = width;
            canvas.height = height;

            const imgData = ctx.createImageData(width, height);
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const val = data[y][x];
                    const idx = (y * width + x) * 4;
                    imgData.data[idx] = val;
                    imgData.data[idx + 1] = val;
                    imgData.data[idx + 2] = val;
                    imgData.data[idx + 3] = 255;
                }
            }
            ctx.putImageData(imgData, 0, 0);

            // Dessiner le voxel sélectionné si c'est du MRSI
            if (isMRSI && selectedVoxel) {
                ctx.strokeStyle = "#ff0000";
                ctx.lineWidth = 1;
                ctx.strokeRect(selectedVoxel.x, selectedVoxel.y, 1, 1);
            }
        }
    }, [data, selectedVoxel, isMRSI]);

    const handleClick = (e) => {
        if (!onClick || !canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const scaleX = canvasRef.current.width / rect.width;
        const scaleY = canvasRef.current.height / rect.height;
        const x = Math.floor((e.clientX - rect.left) * scaleX);
        const y = Math.floor((e.clientY - rect.top) * scaleY);
        onClick(x, y);
    };

    return (
        <div className="viz-container">
            <span className="slice-label">{title}</span>
            <canvas
                ref={canvasRef}
                onClick={handleClick}
                style={{ cursor: onClick ? "crosshair" : "default" }}
            />
        </div>
    );
};

const SpectrumChart = ({ data }) => {
    const canvasRef = useRef(null);

    useEffect(() => {
        if (!canvasRef.current || !data) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        const width = canvas.width;
        const height = canvas.height;
        const spectrum = data.spectrum;

        ctx.clearRect(0, 0, width, height);

        // Background
        ctx.fillStyle = "#1e293b";
        ctx.fillRect(0, 0, width, height);

        // Grid
        ctx.strokeStyle = "#334155";
        ctx.beginPath();
        for (let i = 0; i < width; i += 50) {
            ctx.moveTo(i, 0);
            ctx.lineTo(i, height);
        }
        for (let i = 0; i < height; i += 30) {
            ctx.moveTo(0, i);
            ctx.lineTo(width, i);
        }
        ctx.stroke();

        // Data
        ctx.strokeStyle = "#38bdf8";
        ctx.lineWidth = 2;
        ctx.beginPath();

        const max = Math.max(...spectrum.map(Math.abs)) || 1;
        const step = width / spectrum.length;

        spectrum.forEach((val, i) => {
            const x = i * step;
            const y = height / 2 - (val / max) * (height / 2.5);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();

        // Info text
        ctx.fillStyle = "white";
        ctx.font = "10px sans-serif";
        ctx.fillText(
            `Voxel: (${data.voxel.x}, ${data.voxel.y}, ${data.voxel.z})`,
            10,
            20
        );
    }, [data]);

    return (
        <div className="spectrum-container">
            <h3>Spectre du Voxel</h3>
            <canvas
                ref={canvasRef}
                width={600}
                height={200}
                style={{ borderRadius: "8px", width: "100%" }}
            />
        </div>
    );
};

function App() {
    const [view, setView] = useState("home");
    const [backendStatus, setBackendStatus] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [results, setResults] = useState(null);

    // Navigation 3D
    const [sliceIndices, setSliceIndices] = useState({
        sagittal: 0,
        coronal: 0,
        axial: 0,
        mrsi: 0,
    });

    // MRSI Interaction
    const [selectedVoxel, setSelectedVoxel] = useState(null);
    const [currentSpectrum, setCurrentSpectrum] = useState(null);

    useEffect(() => {
        checkStatus();
        const interval = setInterval(checkStatus, 10000);
        return () => clearInterval(interval);
    }, []);

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
        setResults(null);

        try {
            const endpoint = type === "IRM" ? "/upload-irm/" : "/upload-mrsi/";
            const response = await fetch(`${API_URL}${endpoint}`, {
                method: "POST",
                body: formData,
            });

            if (!response.ok) throw new Error(`Erreur ${response.status}`);

            const data = await response.json();
            setResults(data);

            // Initialisation des indices au centre pour l'IRM
            if (data.type === "IRM") {
                setSliceIndices({
                    ...sliceIndices,
                    sagittal: Math.floor(data.shape[0] / 2),
                    coronal: Math.floor(data.shape[1] / 2),
                    axial: Math.floor(data.shape[2] / 2),
                });
            } else if (data.type === "MRSI") {
                setSliceIndices({
                    ...sliceIndices,
                    mrsi: Math.floor(data.shape[2] / 2),
                });
                setSelectedVoxel(null);
                setCurrentSpectrum(null);
            }

            setView("results");
        } catch (err) {
            setError(`Erreur lors de l'envoi : ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    const fetchSpectrum = async (x, y, zOverride = null) => {
        if (!results || results.type !== "MRSI") return;

        const z = zOverride !== null ? zOverride : sliceIndices.mrsi;
        setLoading(true);
        try {
            const response = await fetch(`${API_URL}/spectrum/${x}/${y}/${z}`);
            const data = await response.json();
            if (data.error) throw new Error(data.error);
            setCurrentSpectrum(data);
            setSelectedVoxel({ x, y });
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

    const renderResults = () => {
        if (!results) return null;

        if (results.type === "IRM") {
            return (
                <div className="card">
                    <h2>Résultats IRM : {results.nom_fichier}</h2>
                    <div className="viz-grid">
                        <div className="slice-control">
                            <SliceCanvas
                                data={
                                    results.volumes.sagittal[
                                        sliceIndices.sagittal
                                    ]
                                }
                                title={`Sagittal (X=${sliceIndices.sagittal})`}
                            />
                            <input
                                type="range"
                                min="0"
                                max={results.shape[0] - 1}
                                value={sliceIndices.sagittal}
                                onChange={(e) =>
                                    setSliceIndices({
                                        ...sliceIndices,
                                        sagittal: parseInt(e.target.value),
                                    })
                                }
                                className="volume-slider"
                            />
                        </div>
                        <div className="slice-control">
                            <SliceCanvas
                                data={
                                    results.volumes.coronal[
                                        sliceIndices.coronal
                                    ]
                                }
                                title={`Coronal (Y=${sliceIndices.coronal})`}
                            />
                            <input
                                type="range"
                                min="0"
                                max={results.shape[1] - 1}
                                value={sliceIndices.coronal}
                                onChange={(e) =>
                                    setSliceIndices({
                                        ...sliceIndices,
                                        coronal: parseInt(e.target.value),
                                    })
                                }
                                className="volume-slider"
                            />
                        </div>
                        <div className="slice-control">
                            <SliceCanvas
                                data={results.volumes.axial[sliceIndices.axial]}
                                title={`Axial (Z=${sliceIndices.axial})`}
                            />
                            <input
                                type="range"
                                min="0"
                                max={results.shape[2] - 1}
                                value={sliceIndices.axial}
                                onChange={(e) =>
                                    setSliceIndices({
                                        ...sliceIndices,
                                        axial: parseInt(e.target.value),
                                    })
                                }
                                className="volume-slider"
                            />
                        </div>
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
                                                e.target.value
                                            );
                                            setSliceIndices({
                                                ...sliceIndices,
                                                mrsi: newZ,
                                            });
                                            if (selectedVoxel) {
                                                fetchSpectrum(
                                                    selectedVoxel.x,
                                                    selectedVoxel.y,
                                                    newZ
                                                );
                                            }
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

    const renderAuth = () => (
        <div className="auth-container">
            <div className="auth-card">
                <div className="auth-header">
                    <h1>Connexion</h1>
                    <p className="placeholder-msg">
                        Espace réservé au personnel médical
                    </p>
                </div>
                <form onSubmit={(e) => e.preventDefault()}>
                    <div className="form-group">
                        <label>Identifiant</label>
                        <input
                            type="text"
                            placeholder="Ex: dr.smith"
                            disabled
                        />
                    </div>
                    <div className="form-group">
                        <label>Mot de passe</label>
                        <input
                            type="password"
                            style={{
                                width: "100%",
                                padding: "0.625rem",
                                border: "1px solid #e2e8f0",
                                borderRadius: "6px",
                            }}
                            disabled
                        />
                    </div>
                    <button
                        className="btn-primary"
                        style={{ width: "100%" }}
                        disabled
                    >
                        Se connecter
                    </button>
                </form>
                <p className="placeholder-msg" style={{ marginTop: "2rem" }}>
                    Note: Le module d'authentification sera implémenté
                    prochainement.
                </p>
            </div>
        </div>
    );

    return (
        <div className="App">
            <div className="sidebar">
                <div className="sidebar-header">
                    <span style={{ fontSize: "1.5rem" }}>🏥</span>
                    <h1>Cancer Platform</h1>
                </div>
                <nav className="nav-links">
                    <div
                        className={`nav-item ${
                            view === "home" ? "active" : ""
                        }`}
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
                        className={`nav-item ${
                            view === "mrsi" ? "active" : ""
                        }`}
                        onClick={() => setView("mrsi")}
                    >
                        <span>📊 Upload MRSI</span>
                    </div>
                    <div
                        className={`nav-item ${
                            view === "auth" ? "active" : ""
                        }`}
                        onClick={() => setView("auth")}
                    >
                        <span>👤 Connexion</span>
                    </div>
                </nav>
            </div>

            <div className="main-area">
                <div className="top-bar">
                    <div className="status-indicator">
                        <div
                            className={`dot ${
                                backendStatus ? "connected" : "disconnected"
                            }`}
                        ></div>
                        <span>
                            Backend {backendStatus ? "Connecté" : "Déconnecté"}
                        </span>
                    </div>
                    <div className="user-info">
                        <span
                            style={{
                                color: "var(--text-muted)",
                                fontSize: "0.875rem",
                            }}
                        >
                            Invité
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
                {view === "irm" && renderUploadForm("IRM")}
                {view === "mrsi" && renderUploadForm("MRSI")}
                {view === "results" && renderResults()}
                {view === "auth" && renderAuth()}
            </div>
        </div>
    );
}

export default App;
