import React, { useState, useEffect } from "react";
import "./App.css";

const API_URL = "http://127.0.0.1:8000";

function App() {
    const [backendStatus, setBackendStatus] = useState("");
    const [irmName, setIrmName] = useState("");
    const [irmFile, setIrmFile] = useState("");
    const [uploadResult, setUploadResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    // Check backend status on load
    useEffect(() => {
        checkBackendStatus();
    }, []);

    const checkBackendStatus = async () => {
        try {
            const response = await fetch(`${API_URL}/`);
            const data = await response.json();
            setBackendStatus(data.message);
            setError("");
        } catch (err) {
            setBackendStatus("");
            setError(
                "Impossible de se connecter au backend. Vérifiez que le serveur est démarré."
            );
        }
    };

    const handleUploadIRM = async (e) => {
        e.preventDefault();
        if (!irmName || !irmFile) {
            setError("Veuillez remplir tous les champs");
            return;
        }

        setLoading(true);
        setError("");
        setUploadResult(null);

        try {
            const response = await fetch(
                `${API_URL}/upload-irm/${encodeURIComponent(
                    irmName
                )}?fichier=${encodeURIComponent(irmFile)}`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                }
            );

            if (!response.ok) {
                throw new Error(`Erreur HTTP: ${response.status}`);
            }

            const data = await response.json();
            setUploadResult(data);
            setError("");
        } catch (err) {
            setError(`Erreur lors de l'upload: ${err.message}`);
            setUploadResult(null);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="App">
            <header className="App-header">
                <h1>🏥 Plateforme Cancer</h1>
                <p className="subtitle">
                    Interface de gestion des données médicales
                </p>
            </header>

            <main className="App-main">
                {/* Backend Status Section */}
                <section className="status-section">
                    <h2>État du Backend</h2>
                    {backendStatus ? (
                        <p className="status-connected">✅ {backendStatus}</p>
                    ) : error ? (
                        <p className="status-error">❌ {error}</p>
                    ) : (
                        <p className="status-loading">
                            ⏳ Connexion en cours...
                        </p>
                    )}
                    <button
                        onClick={checkBackendStatus}
                        className="btn-secondary"
                    >
                        Rafraîchir le statut
                    </button>
                </section>

                {/* IRM Upload Section */}
                <section className="upload-section">
                    <h2>📁 Upload IRM</h2>
                    <form onSubmit={handleUploadIRM} className="upload-form">
                        <div className="form-group">
                            <label htmlFor="irmName">Nom de l'IRM:</label>
                            <input
                                type="text"
                                id="irmName"
                                value={irmName}
                                onChange={(e) => setIrmName(e.target.value)}
                                placeholder="Ex: IRM_Patient_001"
                                className="form-input"
                            />
                        </div>
                        <div className="form-group">
                            <label htmlFor="irmFile">Chemin du fichier:</label>
                            <input
                                type="text"
                                id="irmFile"
                                value={irmFile}
                                onChange={(e) => setIrmFile(e.target.value)}
                                placeholder="Ex: /path/to/file.nii"
                                className="form-input"
                            />
                        </div>
                        <button
                            type="submit"
                            className="btn-primary"
                            disabled={loading}
                        >
                            {loading
                                ? "⏳ Envoi en cours..."
                                : "📤 Envoyer l'IRM"}
                        </button>
                    </form>

                    {/* Upload Result */}
                    {uploadResult && (
                        <div className="result-section">
                            <h3>✅ Résultat de l'upload:</h3>
                            <div className="result-card">
                                <p>
                                    <strong>Type:</strong> {uploadResult.type}
                                </p>
                                <p>
                                    <strong>Nom:</strong> {uploadResult.nom}
                                </p>
                                <p>
                                    <strong>Fichier:</strong>{" "}
                                    {uploadResult.fichier}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Error Display */}
                    {error && !backendStatus && (
                        <div className="error-section">
                            <p className="error-message">⚠️ {error}</p>
                        </div>
                    )}
                </section>

                {/* Info Section */}
                <section className="info-section">
                    <h2>ℹ️ Types de données supportés</h2>
                    <div className="info-grid">
                        <div className="info-card">
                            <h3>🧠 IRM</h3>
                            <p>Imagerie par Résonance Magnétique</p>
                        </div>
                        <div className="info-card">
                            <h3>📊 MRSI</h3>
                            <p>Spectroscopie par Résonance Magnétique</p>
                        </div>
                        <div className="info-card">
                            <h3>📋 PDS</h3>
                            <p>Plan de Soins</p>
                        </div>
                    </div>
                </section>
            </main>

            <footer className="App-footer">
                <p>Plateforme Cancer - Projet Long © 2025</p>
            </footer>
        </div>
    );
}

export default App;
