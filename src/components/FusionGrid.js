import React from "react";
import FusionSlice from "./FusionSlice";
import Fusion3D from "./Fusion3D";

const FusionGrid = ({ 
    irmData, 
    mrsiData, 
    cursor3D, 
    opacity, 
    onSelect, // If present, interactive. If null, read-only
    height = "300px" // Compact height per row
}) => {
    // Helper to handle selection only if interactive
    const handleSelect = (axis, c1, c2) => {
        if (!onSelect) return;
        // Map 2D click to 3D update
        if (axis === "axial") onSelect(c1, c2, cursor3D.z);
        if (axis === "coronal") onSelect(c1, cursor3D.y, c2); 
        if (axis === "sagittal") onSelect(cursor3D.x, c1, c2);
    };

    return (
        <div className="view-grid" style={{ 
            display: "grid", 
            gridTemplateColumns: "1fr 1fr", 
            gridTemplateRows: `${height} ${height}`, 
            gap: "4px",
            background: "#000",
            border: "1px solid #333",
            marginBottom: "1rem"
        }}>
            {/* 1. AXIAL (Top Left) - X vs Y */}
            <FusionSlice 
                orientation="axial"
                irmData={irmData.data}
                mrsiData={mrsiData}
                sliceIndex={cursor3D.z}
                cursor={{ x: cursor3D.x, y: cursor3D.y }}
                shape={irmData.shape}
                onSelect={(x, y) => handleSelect("axial", x, y, )}
                opacity={opacity}
            />

            {/* 2. CORONAL (Top Right) - X vs Z */}
            <FusionSlice 
                orientation="coronal"
                irmData={irmData.data}
                mrsiData={mrsiData}
                sliceIndex={cursor3D.y}
                cursor={{ x: cursor3D.x, y: cursor3D.z }}
                shape={irmData.shape}
                onSelect={(x, z) => handleSelect("coronal", x, z)}
                opacity={opacity}
            />

            {/* 3. SAGITTAL (Bottom Left) - Y vs Z */}
            <FusionSlice 
                orientation="sagittal"
                irmData={irmData.data}
                mrsiData={mrsiData}
                sliceIndex={cursor3D.x}
                cursor={{ x: cursor3D.y, y: cursor3D.z }}
                shape={irmData.shape}
                onSelect={(y, z) => handleSelect("sagittal", y, z)}
                opacity={opacity}
            />

            {/* 4. 3D Model (Bottom Right) */}
            <div style={{ border: "1px solid #222", background: "#000", position: "relative" }}>
               <Fusion3D 
                    irmData={irmData}     // Changed: Pass IRM instead of MRSI for brain structure
                    cursor3D={cursor3D}
               />
               {!onSelect && <div style={{position:"absolute", top:0, left:0, right:0, bottom:0, zIndex:10}} />} 
               {/* Block interaction on snapshots if desired, or let them rotate? User said "snapshots... copy everything". 
                   Usually snapshots are static images, but fully interactive copies are cooler. Let's keep interaction. 
               */}
            </div>
        </div>
    );
};

export default FusionGrid;
