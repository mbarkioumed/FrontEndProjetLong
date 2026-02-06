import React, { useEffect, useRef } from "react";

function drawCrosshair(ctx, x, y, w, h) {
    if (x == null || y == null) return;
    ctx.save();
    ctx.strokeStyle = "#ff0000";
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, h);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(w, y + 0.5);
    ctx.stroke();

    ctx.restore();
}

const SliceCanvas = ({
    data,
    title,
    onClick,
    selectedVoxel,
    isMRSI,
    // Overlay data
    overlay,
    opacity = 0.5,
    crosshair,
}) => {
    const canvasRef = useRef(null);

    // Simple Jet colormap
    const getJetColor = (v) => {
        const x = v / 255;
        let r, g, b;
        if (x < 0.35) {
            b = 1; g = x / 0.35; r = 0;
        } else if (x < 0.66) {
            b = (0.66 - x) / 0.31; g = 1; r = (x - 0.35) / 0.31;
        } else {
            b = 0; g = (1 - x) / 0.34; r = 1;
        }
        return [r * 255, g * 255, b * 255];
    };

    useEffect(() => {
        if (!canvasRef.current || !data) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        const height = data.length;
        const width = data[0].length;

        canvas.width = width;
        canvas.height = height;

        // 1. Draw Base MRI
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

        // 2. Draw Overlay if present
        if (overlay && overlay.length > 0) {
            const oHeight = overlay.length;
            const oWidth = overlay[0].length;
            
            const tempCanvas = document.createElement("canvas");
            tempCanvas.width = oWidth;
            tempCanvas.height = oHeight;
            const tempCtx = tempCanvas.getContext("2d");
            const tempImgData = tempCtx.createImageData(oWidth, oHeight);

            for (let y = 0; y < oHeight; y++) {
                for (let x = 0; x < oWidth; x++) {
                    const val = overlay[y][x];
                    const idx = (y * oWidth + x) * 4;
                    // Apply threshold for transparency (e.g. low values are transparent)
                    if (val < 15) { 
                        tempImgData.data[idx + 3] = 0; 
                    } else {
                        const [r, g, b] = getJetColor(val);
                        tempImgData.data[idx] = r;
                        tempImgData.data[idx + 1] = g;
                        tempImgData.data[idx + 2] = b;
                        tempImgData.data[idx + 3] = 255;
                    }
                }
            }
            tempCtx.putImageData(tempImgData, 0, 0);

            // Draw scaled
            ctx.globalAlpha = opacity;
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = "high";
            ctx.drawImage(tempCanvas, 0, 0, width, height);
            ctx.globalAlpha = 1.0;
        }

        // MRSI marker (single voxel)
        if (isMRSI && selectedVoxel) {
            ctx.fillStyle = "#ff0000";
            // Check if selectedVoxel matches THIS slice (handled by parent usually, but if standard 2D view)
            // The markers logic in App.js usually relies on global coords. 
            // Here, we just draw if generic coordinates match? 
            // Actually, SliceCanvas is dumb. It draws where told.
            // But if we want to support markers, we need logical coords. 
            // For now, keep existing behavior:
             ctx.fillRect(selectedVoxel.x, selectedVoxel.y, 1, 1);
        }

        // IRM crosshair
        if (!isMRSI && crosshair) {
            drawCrosshair(ctx, crosshair.x, crosshair.y, width, height);
        }
    }, [data, overlay, opacity, selectedVoxel, isMRSI, crosshair]);

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

export default SliceCanvas;
