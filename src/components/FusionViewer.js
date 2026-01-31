import React, { useState, useEffect } from "react";
import FusionGrid from "./FusionGrid";
import SpectrumChart from "./SpectrumChart";

const FusionViewer = ({ irmData, mrsiData, fetchSpectrum }) => {
    // Current State
    const [cursor3D, setCursor3D] = useState({ x: 0, y: 0, z: 0 });
    const [opacity, setOpacity] = useState(0.5);
    const [spectrum, setSpectrum] = useState(null);
    const [loadingSpectrum, setLoadingSpectrum] = useState(false);
    
    // Snapshots: Array of full state objects
    const [snapshots, setSnapshots] = useState([]);

    // Initialize cursor
    useEffect(() => {
        if (irmData && irmData.shape) {
            setCursor3D({ 
                x: Math.floor(irmData.shape[0] / 2),
                y: Math.floor(irmData.shape[1] / 2),
                z: Math.floor(irmData.shape[2] / 2)
            });
        }
    }, [irmData]);

    const handleSelect = async (x, y, z) => {
        setCursor3D({ x, y, z });
        
        if (mrsiData && fetchSpectrum) {
            const [mX, mY, mZ] = mrsiData.shape;
            const [iX, iY, iZ] = irmData.shape;
            
            // Map MRI -> MRSI
            const mx = Math.min(Math.floor(x * (mX / iX)), mX - 1);
            const my = Math.min(Math.floor(y * (mY / iY)), mY - 1);
            const mz = Math.min(Math.floor(z * (mZ / iZ)), mZ - 1);
            
            setLoadingSpectrum(true);
            try {
                const data = await fetchSpectrum(mx, my, mz);
                setSpectrum(data);
            } catch (e) {
                console.error(e);
            } finally {
                setLoadingSpectrum(false);
            }
        }
    };

    const takeSnapshot = () => {
        const snap = {
            id: Date.now(),
            time: new Date().toLocaleTimeString(),
            cursor: { ...cursor3D },
            opacity,
            spectrum
        };
        // Add to TOP of list
        setSnapshots(prev => [snap, ...prev]);
    };

    if (!irmData || !mrsiData) return <div>Chargement...</div>;

    return (
        <div className="fusion-container" style={{ 
            padding: "1rem", 
            maxWidth: "100%", 
            boxSizing: "border-box"
        }}>
            <div className="header" style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem", alignItems:"center" }}>
                <h2 style={{ margin:0 }}>Station de Fusion</h2>
                <div style={{ display: "flex", gap: "1rem", alignItems:"center" }}>
                    <div style={{display:"flex", alignItems:"center", gap:"0.5rem"}}>
                        <span style={{fontSize:"0.9rem"}}>Transparence:</span>
                        <input 
                                type="range" min="0" max="1" step="0.1" 
                                value={opacity} 
                                onChange={(e) => setOpacity(parseFloat(e.target.value))} 
                                style={{width: "100px"}}
                        />
                    </div>
                    <button className="btn-primary" onClick={takeSnapshot} style={{
                        padding: "0.5rem 1rem", background: "#007bff", color: "white", border: "none", borderRadius: "4px", cursor: "pointer"
                    }}>
                        📸 Snapshot
                    </button>
                    {snapshots.length > 0 && (
                        <button onClick={() => setSnapshots([])} style={{
                             padding: "0.5rem 1rem", background: "#555", color: "white", border: "none", borderRadius: "4px", cursor: "pointer"
                        }}>
                            Effacer Tout
                        </button>
                    )}
                </div>
            </div>

            {/* FLOW LAYOUT: Live view first, then snapshots filling the grid */}
            <div style={{ 
                display: "flex", 
                flexWrap: "wrap", 
                gap: "1rem", 
                justifyContent: "flex-start",
                alignItems: "flex-start"
            }}>
                
                {/* 1. LIVE WORKSTATION (Always First) */}
                <div className="live-card" style={{ 
                    flex: "0 0 calc(50% - 0.5rem)", 
                    background: "#0d0d0d", 
                    border: "2px solid #007bff",
                    padding: "0.5rem",
                    borderRadius: "8px",
                    boxSizing: "border-box"
                }}>
                    <div style={{marginBottom: "0.5rem", color: "#007bff", fontWeight: "bold"}}>🔴 EXAMEN EN COURS</div>
                    <FusionGrid 
                        irmData={irmData}
                        mrsiData={mrsiData}
                        cursor3D={cursor3D}
                        opacity={opacity}
                        onSelect={handleSelect}
                        height="300px" 
                    />
                     <div className="spectrum-live" style={{ 
                        background: "#1e1e1e", 
                        padding: "0.5rem", 
                        borderRadius: "4px",
                        marginTop: "0.5rem"
                    }}>
                        <h5 style={{marginTop:0, marginBottom: "0.2rem", color: "#ccc"}}>Spectre Local [{cursor3D.x}, {cursor3D.y}, {cursor3D.z}]</h5>
                        <div style={{ height: "150px", width: "100%" }}>
                            {loadingSpectrum ? 
                                <div style={{color:"#888", fontSize:"0.8rem"}}>Chargement...</div> : 
                                (spectrum ? <SpectrumChart data={spectrum} /> : <div style={{color:"#555", fontSize:"0.8rem"}}>Sélectionnez un voxel</div>)
                            }
                        </div>
                    </div>
                </div>

                {/* 2...N. SNAPSHOTS */}
                {snapshots.map(snap => (
                    <div key={snap.id} className="snapshot-card" style={{ 
                        flex: "0 0 calc(50% - 0.5rem)", 
                        background: "#1a1a1a", 
                        border: "1px solid #444",
                        padding: "0.5rem",
                        borderRadius: "8px",
                        boxSizing: "border-box",
                        position: "relative"
                    }}>
                         <div style={{ 
                             display: "flex", justifyContent: "space-between", marginBottom: "0.5rem", color: "#aaa", fontSize: "0.9rem"
                        }}>
                            <strong>Capture {snap.time}</strong>
                            <span>Pos: [{snap.cursor.x}, {snap.cursor.y}, {snap.cursor.z}]</span>
                        </div>

                        {/* Read-Only Grid */}
                        <FusionGrid 
                            irmData={irmData}
                            mrsiData={mrsiData}
                            cursor3D={snap.cursor}
                            opacity={snap.opacity}
                            onSelect={null} 
                            height="300px" // Same size as live for exact comparison
                        />
                        
                        {/* Saved Spectrum */}
                        {snap.spectrum && (
                            <div style={{ height: "150px", marginTop: "0.5rem", background: "#222", borderRadius: "4px", padding: "0.5rem" }}>
                                <SpectrumChart data={snap.spectrum} />
                            </div>
                        )}
                    </div>
                ))}

            </div>
        </div>
    );
};

export default FusionViewer;
