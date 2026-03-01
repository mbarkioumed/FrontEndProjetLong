import React from "react";
import SpectrumChart from "./SpectrumChart";

export default function SpectrumModal({ data, onClose }) {
    if (!data) return null;

    return (
        <div style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 1000
        }} onClick={onClose}>
            <div style={{
                background: "var(--card-bg)",
                padding: "20px",
                borderRadius: "12px",
                width: "80%",
                maxWidth: "800px",
                height: "400px",
                position: "relative",
                display: "flex", 
                flexDirection: "column"
            }} onClick={e => e.stopPropagation()}>
                <button 
                    onClick={onClose}
                    style={{
                        position: "absolute",
                        top: "10px",
                        right: "10px",
                        background: "none",
                        border: "none",
                        fontSize: "20px",
                        cursor: "pointer",
                        color: "var(--text-main)"
                    }}
                >
                    &times;
                </button>
                <h3 style={{marginBottom: "10px"}}>Analyses Spectrale</h3>
                <div style={{flex: 1, minHeight: 0}}>
                    <SpectrumChart data={data} />
                </div>
            </div>
        </div>
    );
}
