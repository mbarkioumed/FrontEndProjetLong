import React, { useState, useEffect, useMemo } from "react";
import { useContext } from "react";
import "./App.css";
import AuthContext from "./context/AuthContext";
import Login from "./components/Login";
import SliceCanvas from "./components/SliceCanvas";

import SpectrumChart from "./components/SpectrumChart";
import PatientsExplorer from "./components/PatientsExplorer";
import IrmCard from "./components/IrmCard";

import { api } from "./api/client";

import { storeData } from "./utils/dataCache";

const worker = new Worker(new URL("./dataProcessor.worker.js", import.meta.url));

const workerService = {
    requestId: 0,
    callbacks: new Map(),

    postMessage: (message) => {
        const id = ++workerService.requestId;
        return new Promise((resolve, reject) => {
            workerService.callbacks.set(id, { resolve, reject });
            worker.postMessage({ ...message, id });
        });
    }
};

worker.onmessage = (e) => {
    const { id, success, data, error } = e.data;
    const callback = workerService.callbacks.get(id);

    if (callback) {
        if (success) {
            // Intercept and cache large data BEFORE it hits React
            if (data) {
                 const processNode = (node) => {
                    if (!node) return;
                    if (node.data_uint8) {
                        node.dataRef = storeData(node.data_uint8);
                        node.data_uint8 = null; // Remove heavy data
                        delete node.data_uint8;
                    }
                    // Recursive check not strictly needed if structure is flat, 
                    // but results might be nested in 'irmcards' or similar? 
                    // The worker returns 'data' which is usually the result object directly or { [filename]: result }.
                    // Let's iterate object values to be safe
                    if (typeof node === 'object') {
                        Object.values(node).forEach(child => {
                            if (typeof child === 'object' && child !== null) {
                                // Depth-1 check is usually enough for our structure
                                if (child.data_uint8) processNode(child); 
                            }
                        });
                    }
                 };
                 processNode(data);
            }
            callback.resolve(data);
        } else {
            callback.reject(new Error(error));
        }
        workerService.callbacks.delete(id);
    }
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
        { id: Date.now(), irmData: null, mrsiData: null }
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
            
            // Get as Blob/Text to avoid parsing JSON on main thread
            const blob = await response.blob();
            
            // Now send to worker for parsing/processing
            // I need to update the worker to accept "raw data" processing requests too, 
            // OR I just use a data url? No that's for small things.
            
            // I should have made the worker more flexible.
            // Let's RE-WRITE the worker to be more flexible first? 
            // No, I can just use the `url` param in worker to be a Blob URL? 
            // `fetch(blobUrl)` works! 
            
            // Brilliant. I will create a Blob URL for the response blob.
            const blobUrl = URL.createObjectURL(blob);
            
            const data = await workerService.postMessage({
                url: blobUrl,
                options: {}, 
                type: "process" // effectively just fetch and process
            });
            
            URL.revokeObjectURL(blobUrl);

            // ... rest of logic
            
            if (data.type === "IRM") {
                 setIrmResults(data); // cleaning up this legacy state later?
                 setReference3DData(data);
                 if (cardId) {
                     setIrmCards(prev => prev.map(c => c.id === cardId ? { ...c, irmData: data } : c));
                 } else {
                     setIrmCards(prev => {
                         const firstEmpty = prev.find(c => !c.irmData);
                         if (firstEmpty) {
                             return prev.map(c => c.id === firstEmpty.id ? { ...c, irmData: data } : c);
                         } else {
                             return [...prev, { id: Date.now(), irmData: data, mrsiData: null }];
                         }
                     });
                 }
                 setView("irm");
            } else if (data.type === "MRSI") {
                // setMrsiResults(data); // Legacy state removed
                if (cardId) {
                    setIrmCards(prev => prev.map(c => c.id === cardId ? { ...c, mrsiData: data } : c));
                } else {
                     setIrmCards(prev => {
                         const firstEmpty = prev.find(c => !c.mrsiData);
                         if (firstEmpty) {
                             return prev.map(c => c.id === firstEmpty.id ? { ...c, mrsiData: data } : c);
                         } else {
                             return [...prev, { id: Date.now(), irmData: null, mrsiData: data }];
                         }
                     });
                }
                setView("irm"); // MRSI stays in IRM view now
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
            let irmData = null;

            if (irmFile) {
                const formData = new FormData();
                formData.append("fichier", irmFile);
                
                const response = await fetch(`${API_URL}/upload-irm/`, {
                    method: "POST",
                    headers: { Authorization: `Bearer ${token}` },
                    body: formData
                });
                
                if (!response.ok) throw new Error("Erreur upload IRM");
                
                const blob = await response.blob();
                const blobUrl = URL.createObjectURL(blob);
                
                irmData = await workerService.postMessage({
                    url: blobUrl,
                    options: {},
                    type: "process"
                });
                URL.revokeObjectURL(blobUrl);

                setIrmResults(irmData);
                setReference3DData(irmData);
                setIrmCards([{ id: Date.now(), irmData: irmData, mrsiData: null }]);
            }

            if (mrsiFile) {
                const formData = new FormData();
                formData.append("fichier", mrsiFile);
                
                const response = await fetch(`${API_URL}/upload-mrsi/`, {
                    method: "POST",
                    headers: { Authorization: `Bearer ${token}` },
                    body: formData
                });

                if (!response.ok) throw new Error("Erreur upload MRSI");

                const blob = await response.blob();
                const blobUrl = URL.createObjectURL(blob);
                
                const mrsiData = await workerService.postMessage({
                    url: blobUrl,
                    options: {},
                    type: "process"
                });
                URL.revokeObjectURL(blobUrl);

                // If we also loaded IRM, update that card, otherwise new card
                if (irmFile && irmData) {
                     setIrmCards(prev => {
                         // assume it's the last one we just added
                         const last = prev[prev.length - 1];
                         return prev.map(c => c.id === last.id ? { ...c, mrsiData: mrsiData } : c);
                     });
                } else {
                     setIrmCards([{ id: Date.now(), irmData: null, mrsiData: mrsiData }]);
                }
            }

            // 2) Always go to IRM view
            if (irmFile || mrsiFile) setView("irm");
            else setView("patients");
        } catch (e) {
            setError(`Ouverture examen impossible : ${e.message}`);
        } finally {
            setLoading(false);
        }
    };





    const fetchSpectrum = async (name, x, y, z) => {
        if (x == null || y == null || z == null) return null;
        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/spectrum/${name}/${x}/${y}/${z}`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });
            if (!res.ok) throw new Error("Erreur affichage spectre");
            const data = await res.json();
            return data;
        } catch (err) {
            console.error(err);
            setError("Impossible de charger le spectre.");
            return null;
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

            console.time("Worker Request");
            const data = await workerService.postMessage({
                url: `${API_URL}/traitements`,
                options: {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    },
                    body: JSON.stringify(bodyPayload)
                }
            });
            console.timeEnd("Worker Request");

            const next = data?.[key];
            if (!next) throw new Error("Réponse traitement inattendue.");
            if (next?.error) throw new Error(next.error);

            // Data processing (base64 -> Uint8Array) is already done by worker!

            console.time("State Update");
            if (next.type === "IRM") {
                setIrmResults(next);
                setIrmCards(prev => {
                    console.time("SetIrmCards Callback");
                    const newCards = prev.map((c, i) => i === 0 ? { ...c, irmData: next } : c);
                    console.timeEnd("SetIrmCards Callback");
                    return newCards;
                });
                setView("irm");
            } else if (next.type === "MRSI") {
                // setMrsiResults(next);
                 setIrmCards(prev => {
                    // Update first card for now, or find card matching this MRSI? 
                    // Post-traitement context might need to know which card triggered it. 
                    // For now, default to first card update if generic.
                    return prev.map((c, i) => i === 0 ? { ...c, mrsiData: next } : c);
                });
                setView("irm");
            }
            else {
                setIrmResults(next);
            }
            console.timeEnd("State Update");
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
        return null; // Logic moved to IrmCard
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
                                irmData={card.irmData}
                                mrsiData={card.mrsiData}
                                onDuplicate={(data) => {
                                    setIrmCards(prev => {
                                        const index = prev.findIndex(c => c.id === card.id);
                                        const newCard = { 
                                            id: Date.now(), 
                                            irmData: card.irmData ? { ...card.irmData } : null, 
                                            mrsiData: card.mrsiData ? { ...card.mrsiData } : null 
                                        };
                                        const newCards = [...prev];
                                        newCards.splice(index + 1, 0, newCard);
                                        return newCards;
                                    });
                                }}
                                onDelete={(id) => {
                                    setIrmCards(prev => {
                                        if (prev.length === 1) return [{ id: Date.now(), irmData: null, mrsiData: null }];
                                        return prev.filter(c => c.id !== id);
                                    });
                                }}
                                renderUploadForm={renderUploadForm}
                                onFetchSpectrum={fetchSpectrum}
                            />
                        ))}
                        <button 
                            className="btn-primary" 
                            style={{ alignSelf: "center", padding: "1rem 2rem", fontSize: "1.1rem" }}
                            onClick={() => setIrmCards(prev => [...prev, { id: Date.now(), irmData: null, mrsiData: null }])}
                        >
                            + Ajouter une nouvelle carte de comparaison
                        </button>
                    </div>
                )}
                {view === "mrsi" && (
                    <>
                         {renderUploadForm("MRSI")}
                         {/* Removed renderResults call */}
                    </>
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
