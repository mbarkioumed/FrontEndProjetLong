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
import IrmCard from "./components/IrmCard";

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
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [irmResults, setIrmResults] = useState(null);
    const [reference3DData, setReference3DData] = useState(null); // Stable data for 3D View
    const [mrsiResults, setMrsiResults] = useState(null);
    const [isTraitementOpen, setIsTraitementOpen] = useState(false);
    const [isParamOpen, setIsParamOpen] = useState(true);

    const [irmCards, setIrmCards] = useState([
        { id: Date.now(), results: null }
    ]);

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

    /* POST TRAITEMENT CHOIX */ 
    const [catalog, setCatalog] = useState({});
    const [selectedTraitement, setSelectedTraitement] = useState("");
    const [traitementParams, setTraitementParams] = useState({}); // valeurs courantes pour le formulaire

    useEffect(() => { /* chargement du catalogue */
    const fetchCatalog = async () => {
        try {
            const response = await fetch(`${API_URL}/traitements/catalog`);
            const data = await response.json();
            setCatalog(data);

            // Initialiser le premier traitement par défaut si besoin
            const firstKey = Object.keys(data)[0];
            setSelectedTraitement(firstKey);
            setTraitementParams(data[firstKey].params || {});
        } catch (err) {
            console.error("Impossible de charger le catalogue :", err);
        }
    };

    fetchCatalog();
    }, []);

    useEffect(() => { /* Type de traitement entre IRM et MRSI*/
        if (!selectedTraitement) return;
        const allowedTypes = catalog[selectedTraitement]?.type || [];
        setTraitementParams((prev) => ({
            ...prev,
            dataType: allowedTypes[0] || null,
            // réinitialiser les autres paramètres aux valeurs par défaut (utile si on change entre les traitements)
            ...Object.fromEntries(
            Object.entries(catalog[selectedTraitement]?.params || {}).map(
                ([k, v]) => [k, v.default]
            )
            ),
        }));
    }, [selectedTraitement, catalog]);


    /* FIN POST TRAITEMENT CHOIX */ 

    // Navigation 3D
    const [sliceIndices, setSliceIndices] = useState({
        mrsi: 0,
    });

    // MRSI Interaction
    const [selectedVoxel, setSelectedVoxel] = useState(null);
    const [currentSpectrum, setCurrentSpectrum] = useState(null);

    // ===============================
    // Optimization: Efficient Slicing from Flat Uint8Array
    // ===============================

    // Helpers

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

    const handleUpload = async (e, type, cardId = null) => {
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
                
                if (cardId) {
                    setIrmCards(prev => prev.map(c => c.id === cardId ? { ...c, results: data } : c));
                } else {
                    // Update the first empty card or add new one
                    setIrmCards(prev => {
                        const firstEmpty = prev.find(c => !c.results);
                        if (firstEmpty) {
                            return prev.map(c => c.id === firstEmpty.id ? { ...c, results: data } : c);
                        } else {
                            return [...prev, { id: Date.now(), results: data }];
                        }
                    });
                }
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
      setIrmCards([{ id: Date.now(), results: irmData }]);
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





    const fetchSpectrum = async (name, x, y, zVal = null) => {
        const z = zVal !== null ? zVal : sliceIndices.mrsi;
        if (x == null || y == null) return;
        setLoading(true);
        try {
            
            const res = await fetch(`${API_URL}/spectrum/${name}/${x}/${y}/${z}`, {
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

    const runTraitement = async (dataInstance, typeTraitement = selectedTraitement, params = {}) => {
        // dataInstance peut être irmResults ou mrsiResults
        if (!dataInstance?.nom_fichier && !dataInstance?.nom) return;
        setLoading(true);
        setError("");
        try {
            // Determine filename/instance key (IRM uses nom_fichier, MRSI uses nom)
            const key = dataInstance.nom_fichier || dataInstance.nom;

            // Filtrer les seuls params valides pour ce traitement
            // = on enlève datatype qu'on a mis précédemment avec les params
            const paramDefs = catalog[typeTraitement]?.params || {};
            const validParams = {};
            Object.keys(paramDefs).forEach((k) => {
                if (params[k] !== undefined) validParams[k] = params[k];
            });

            
            // Préparation de la payload
            const bodyPayload = {
                [key]: {
                    type_traitement: typeTraitement,
                    params: validParams,
                },
            };

            const response = await fetch(`${API_URL}/traitements`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify(bodyPayload),
            });

            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(data?.detail || `Erreur ${response.status}`);
            }

            if (data?.error) throw new Error(data.error);

            const next = data?.[key];
            if (!next) throw new Error("Réponse traitement inattendue.");
            if (next?.error) throw new Error(next.error);

            if (next.data_b64) {
                next.data_uint8 = base64ToUint8Array(next.data_b64);
            }

            if (next.type === "IRM") {
                setIrmResults(next);
                setIrmCards(prev => prev.map((c, i) => i === 0 ? { ...c, results: next } : c));
                setView("irm");
            } else if (next.type === "MRSI") {
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
            setError(`Erreur Post-Traitement : ${err.message}`);
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

    const renderUploadForm = (type, cardId = null) => (
        <div className="card">
            <h2>Upload {type}</h2>
            <form onSubmit={(e) => handleUpload(e, type, cardId)}>
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


    const renderResults = (results) => {
        if (!results) return null;

        if (results.type === "IRM") {
            // IRM results are now handled by IrmCard component in the main render loop
            return null;
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
                                    onClick={(x, y) => fetchSpectrum(results.nom, x, y)}
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
                                                    results.nom,
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
                    <div className="irm-comparison-container" style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
                        {irmCards.map((card) => (
                            <IrmCard 
                                key={card.id}
                                cardId={card.id}
                                results={card.results}
                                onDuplicate={(results) => {
                                    setIrmCards(prev => {
                                        const index = prev.findIndex(c => c.id === card.id);
                                        const newCard = { id: Date.now(), results: { ...results } };
                                        const newCards = [...prev];
                                        newCards.splice(index + 1, 0, newCard);
                                        return newCards;
                                    });
                                }}
                                onDelete={(id) => {
                                    setIrmCards(prev => {
                                        if (prev.length === 1) return [{ id: Date.now(), results: null }];
                                        return prev.filter(c => c.id !== id);
                                    });
                                }}
                                renderUploadForm={renderUploadForm}
                            />
                        ))}
                        <button 
                            className="btn-primary" 
                            style={{ alignSelf: "center", padding: "1rem 2rem", fontSize: "1.1rem" }}
                            onClick={() => setIrmCards(prev => [...prev, { id: Date.now(), results: null }])}
                        >
                            + Ajouter une nouvelle carte de comparaison
                        </button>
                    </div>
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
                        onVoxelClick={(x,y,z) => fetchSpectrum(mrsiResults.nom,x,y,z)} 
                     />
                )}

                {view === "patients" && <PatientsExplorer onOpenExam={openExamFromPatients} />}



            </div>

            <div className={`sidebar right-sidebar ${isRightSidebarCollapsed ? "collapsed" : ""}`}>
                <div className="sidebar-header">
                    <span className="emoji">⚙️</span>
                    <h1>Post-Traitement</h1>
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
                    {/* Choix type traitement */}
                    <div className="nav-dropdown">
                        <div
                            className="nav-item"
                            onClick={() => setIsTraitementOpen(!isTraitementOpen)}
                        >
                            <span className={`arrow ${isTraitementOpen ? "" : "close"}`}>▼</span>
                            <span className="label">{catalog[selectedTraitement]?.label || "Catalogue non trouvé"}</span>
                            
                        </div>

                        {isTraitementOpen && (
                            <div className="dropdown-menu">
                                {Object.entries(catalog).map(([key, val]) => (
                                    <div
                                        key={key}
                                        className="dropdown-option"
                                        onClick={() => {
                                            setSelectedTraitement(key);
                                            const defaults = {};
                                            Object.entries(val.params || {}).forEach(([k,v]) => defaults[k] = v.default);
                                            setTraitementParams(defaults);
                                            setIsTraitementOpen(false);
                                        }}
                                    >
                                        {val.label}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Bouton lancement traitement */}
                    <button
                        className="btn-primary"
                        onClick={() => {
                            // Déterminer l'instance selon le type choisi
                            const instance =
                                traitementParams.dataType === "IRM" ? irmResults :
                                traitementParams.dataType === "MRSI" ? mrsiResults :
                                null;

                            if (!instance) return;

                            runTraitement(instance, selectedTraitement, traitementParams);
                        }}
                        disabled={loading || !(
                            (traitementParams.dataType === "IRM" && irmResults?.nom_fichier) ||
                            (traitementParams.dataType === "MRSI" && mrsiResults?.nom)
                        )}
                    >
                        {loading ? "Traitement..." : "Lancer Traitement"}
                    </button>


                    {/* Formulaire parametres */}
                    <div
                        className="nav-item"
                        onClick={() => setIsParamOpen(!isParamOpen)}
                    >
                        <span className="icon">⚙️</span>
                        <span className="label">Paramètres :</span>
                    </div>
                    {isParamOpen && (
                        <div className="traitement-form">
                            {/* Bloc Type de données */}
                            <div className="param-container">
                                <label className="param-label">Type de données :</label>
                                <div style={{ display: "flex", gap: "0.5rem" }}>
                                {["IRM", "MRSI"].map((dt) => {
                                    const isPossible = catalog[selectedTraitement]?.type.includes(dt);
                                    const isSelected = traitementParams.dataType === dt;
                                    return (
                                    <div
                                        key={dt}
                                        className={`nav-item param-choice ${isSelected ? "selected" : ""} ${!isPossible ? "disabled" : ""}`}
                                        onClick={() => {
                                        if (!isPossible) return;
                                        setTraitementParams({ ...traitementParams, dataType: dt });
                                        }}
                                    >
                                        <span className="label">{dt}</span>
                                    </div>
                                    );
                                })}
                                </div>
                            </div>
                            {/* Bloc paramètres spécifiques traitement */}
                            {Object.entries(catalog[selectedTraitement]?.params || {}).map(
                                ([paramKey, paramDef]) => {
                                return (
                                    <div key={paramKey} className="param-container">
                                    <label className="param-label">{paramDef.label} :</label>

                                    {paramDef.type === "int" && (
                                        <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
                                            <input
                                            className="param-input"
                                            type="number"
                                            min={paramDef.range[0]}
                                            max={paramDef.range[1]}
                                            value={paramDef.default}
                                            onChange={(e) =>
                                                setTraitementParams({
                                                ...traitementParams,
                                                [paramKey]: parseInt(e.target.value),
                                                })
                                            }
                                            />
                                            <small className="param-range">
                                                Valeurs possibles : {paramDef.range[0]} – {paramDef.range[1]}
                                            </small>
                                        </div>
                                    )}

                                    {paramDef.type_param === "choix" && (
                                        <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
                                        <select
                                        className="param-input"
                                        value={traitementParams[paramKey] || paramDef.default}
                                        onChange={(e) =>
                                            setTraitementParams({
                                            ...traitementParams,
                                            [paramKey]: e.target.value,
                                            })
                                        }
                                        >
                                        {paramDef.select.map((opt) => (
                                            <option key={opt} value={opt}>
                                            {opt}
                                            </option>
                                        ))}
                                        </select>
                                        </div>
                                    )}

                                    {paramDef.type_param === "choix_multiple" && (
                                        <div className="checkbox-group">
                                        {paramDef.select.map((opt) => {
                                            const current = traitementParams[paramKey] || [];
                                            return (
                                            <label key={opt} className="checkbox-label">
                                                <input
                                                type="checkbox"
                                                checked={current.includes(opt)}
                                                onChange={(e) => {
                                                    let updated;
                                                    if (e.target.checked) updated = [...current, opt];
                                                    else updated = current.filter((x) => x !== opt);
                                                    setTraitementParams({
                                                    ...traitementParams,
                                                    [paramKey]: updated,
                                                    });
                                                }}
                                                />
                                                {opt}
                                            </label>
                                            );
                                        })}
                                        </div>
                                    )}

                                    <hr className="param-divider" />
                                    </div>
                                );
                                }
                            )}
                        </div>                    
                    )}                    
                </div>
            </div>
        </div>
    );
}

export default App;
