import React, { useEffect, useRef } from "react";

const FusionSlice = ({ 
    irmData, mrsiData, orientation, sliceIndex, cursor, onSelect, opacity = 0.5, shape
}) => {
    // Two layers: Background (Image + Heatmap) and Foreground (Cursor)
    const bgCanvasRef = useRef(null);
    const fgCanvasRef = useRef(null);

    // 1. RENDER IMAGE (Heavy, only when data/slice changes)
    useEffect(() => {
        if (!irmData || !bgCanvasRef.current || !shape) return;

        const ctx = bgCanvasRef.current.getContext("2d");
        const [X, Y, Z] = shape;
        
        let width, height;
        if (orientation === "axial") { width = X; height = Y; } 
        else if (orientation === "coronal") { width = X; height = Z; } 
        else if (orientation === "sagittal") { width = Y; height = Z; }

        bgCanvasRef.current.width = width;
        bgCanvasRef.current.height = height;

        // DYNAMIC NORMALIZATION
        const imgData = ctx.createImageData(width, height);

        // 1. First Pass: Find Min/Max of this slice to determine range
        let minVal = Infinity;
        let maxVal = -Infinity;

        // We need to iterate the source data coords that match this slice
        // It's computationally cheaper to just loop the canvas w/h mapping again or do it in one pass?
        // Let's do a temporary buffer for the slice data to avoid re-mapping coords twice if complex.
        // Actually, let's just do it in one pass with a buffer, or 2 passes. 2 passes is fine for 256x256.
        
        const pixelBuffer = new Float32Array(width * height);
        
        for (let h = 0; h < height; h++) {
            for (let w = 0; w < width; w++) {
                let dx, dy, dz;
                if (orientation === "axial") {
                    dx = (X - 1) - w; dy = h; dz = sliceIndex;
                } else if (orientation === "coronal") {
                    dx = (X - 1) - w; dy = sliceIndex; dz = (Z - 1) - h;
                } else if (orientation === "sagittal") {
                    dx = sliceIndex; dy = w; dz = (Z - 1) - h;
                }
                
                let val = 0;
                if (dx >= 0 && dx < X && dy >= 0 && dy < Y && dz >= 0 && dz < Z) {
                    val = irmData[dx][dy][dz] || 0;
                }
                
                pixelBuffer[h * width + w] = val;
                if (val < minVal) minVal = val;
                if (val > maxVal) maxVal = val;
            }
        }
        
        // Prevent divide by zero if empty slice
        if (maxVal === minVal) maxVal = minVal + 1;
        
        // 2. Second Pass: Render normalized pixels
        // Scale factor
        const range = maxVal - minVal;
        
        for (let i = 0; i < pixelBuffer.length; i++) {
             let raw = pixelBuffer[i];
             // Normalize to 0..255
             // Apply linear scaling
             let norm = ((raw - minVal) / range) * 255;
             
             // Simple Contrast/Brightness curve could happen here
             // But strict linear normalization guarantees visibility.
             
             const val = Math.floor(norm);
             
             const idx = i * 4;
             imgData.data[idx] = val;
             imgData.data[idx+1] = val;
             imgData.data[idx+2] = val;
             imgData.data[idx+3] = 255;
        }

        ctx.putImageData(imgData, 0, 0);

        // --- MRSI OVERLAY ---
        if (mrsiData && mrsiData.voxel_map_all) {
            const [mX, mY, mZ] = mrsiData.shape;
            const hCanvas = document.createElement("canvas");
            hCanvas.width = width;
            hCanvas.height = height;
            const hCtx = hCanvas.getContext("2d");
            const hImg = hCtx.createImageData(width, height);
            
            const ratioX = mX / X;
            const ratioY = mY / Y;
            const ratioZ = mZ / Z;
            let hasData = false;

            for (let h = 0; h < height; h++) {
                for (let w = 0; w < width; w++) {
                    let mx, my, mz;

                    if (orientation === "axial") {
                        const flippedW = (X - 1) - w;
                        mx = Math.floor(flippedW * ratioX);
                        my = Math.floor(h * ratioY);
                        mz = Math.floor(sliceIndex * ratioZ);
                    } else if (orientation === "coronal") {
                        const flippedW = (X - 1) - w;
                        mx = Math.floor(flippedW * ratioX);
                        my = Math.floor(sliceIndex * ratioY);
                        const dz = (Z - 1) - h;
                        mz = Math.floor(dz * ratioZ);
                    } else if (orientation === "sagittal") {
                        mx = Math.floor(sliceIndex * ratioX);
                        my = Math.floor(w * ratioY);
                        const dz = (Z - 1) - h;
                        mz = Math.floor(dz * ratioZ);
                    }

                    if (mx>=0 && mx<mX && my>=0 && my<mY && mz>=0 && mz<mZ) {
                         const val = mrsiData.voxel_map_all[mz][my][mx];
                         if (val > 1000) { 
                             hasData = true;
                             const norm = Math.min(Math.max((val - 1000) / 500000, 0), 1);
                             let r=0, g=0, b=0;
                             if (norm < 0.5) {
                                 const n2 = norm * 2;
                                 r = Math.floor(255 * n2); g = 255; b = 0;
                             } else {
                                 const n2 = (norm - 0.5) * 2;
                                 r = 255; g = Math.floor(255 * (1 - n2)); b = 0;
                             }
                             const idx = (h * width + w) * 4;
                             hImg.data[idx] = r; hImg.data[idx+1] = g; hImg.data[idx+2] = b; hImg.data[idx+3] = 255; 
                         }
                    }
                }
            }
            if (hasData) {
                hCtx.putImageData(hImg, 0, 0);
                ctx.globalAlpha = opacity;
                ctx.drawImage(hCanvas, 0, 0);
                ctx.globalAlpha = 1.0;
            }
        }
    }, [irmData, mrsiData, orientation, sliceIndex, opacity, shape]);


    // 2. RENDER CURSOR (Fast, separated)
    useEffect(() => {
        if (!fgCanvasRef.current || !cursor || !shape) return;
        const ctx = fgCanvasRef.current.getContext("2d");
        const [X, Y, Z] = shape;
        
        let width, height;
        if (orientation === "axial") { width = X; height = Y; } 
        else if (orientation === "coronal") { width = X; height = Z; } 
        else if (orientation === "sagittal") { width = Y; height = Z; }

        fgCanvasRef.current.width = width;
        fgCanvasRef.current.height = height;

        ctx.clearRect(0, 0, width, height);

        let cx, cy;
        if (orientation === "axial") {
            // Apply flip to cursor X too
            // dx = (X-1) - w => w = (X-1) - dx
            cx = (X - 1) - cursor.x; 
            cy = cursor.y;
        } else if (orientation === "coronal") {
            cx = (X - 1) - cursor.x;
            cy = (Z - 1) - cursor.y;
        } else if (orientation === "sagittal") {
            cx = cursor.x; 
            cy = (Z - 1) - cursor.y; 
        }

        ctx.strokeStyle = "rgba(0, 255, 0, 0.9)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx, 0); ctx.lineTo(cx, height);
        ctx.moveTo(0, cy); ctx.lineTo(width, cy);
        ctx.stroke();
            
        ctx.fillStyle = "lime";
        ctx.font = "12px monospace";
        ctx.fillText(`${orientation.toUpperCase()} [${sliceIndex}]`, 4, 12);

    }, [cursor, orientation, sliceIndex, shape]);


    const handleClick = (e) => {
        if (!fgCanvasRef.current || !onSelect) return;
        const rect = fgCanvasRef.current.getBoundingClientRect();
        const scaleX = fgCanvasRef.current.width / rect.width;
        const scaleY = fgCanvasRef.current.height / rect.height;
        
        const cx = Math.floor((e.clientX - rect.left) * scaleX);
        const cy = Math.floor((e.clientY - rect.top) * scaleY);
        
        const [X, Y, Z] = shape;
        let dx, dy;

        if (orientation === "axial") {
            // w = (X-1) - dx => dx = (X-1) - w
            dx = (X - 1) - cx;
            dy = cy;
        } else if (orientation === "coronal") {
            dx = (X - 1) - cx;
            dy = (Z - 1) - cy; 
        } else if (orientation === "sagittal") {
            dx = cx; 
            dy = (Z - 1) - cy; 
        }
        
        onSelect(dx, dy);
    };

    return (
        <div style={{ width: "100%", height: "100%", overflow: "hidden", background: "#000", position: "relative" }}>
            {/* Layer 1: Image (Bottom) */}
            <canvas 
                ref={bgCanvasRef}
                style={{ 
                    position: "absolute",
                    top:0, left:0,
                    width: "100%", height: "100%", 
                    objectFit: "contain"
                }}
            />
            {/* Layer 2: Cursor (Top) */}
            <canvas 
                ref={fgCanvasRef}
                onClick={handleClick}
                style={{ 
                    position: "absolute",
                    top:0, left:0,
                    width: "100%", height: "100%", 
                    objectFit: "contain", 
                    cursor: onSelect ? "crosshair" : "default"
                }}
            />
        </div>
    );
};

export default FusionSlice;
