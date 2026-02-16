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

    const height = data?.length || 0;
    const width = data?.[0]?.length || 0;

    useEffect(() => {
        if (!canvasRef.current || !data) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d", { alpha: false }); // Optimization: disable alpha if not needed
        
        console.log(`[SliceCanvas] Data dims: ${width}x${height}, Canvas dims before: ${canvas.width}x${canvas.height}`);

        if (width === 0 || height === 0) return;

        if (canvas.width !== width || canvas.height !== height) {
            // Updated via props, but double check
            canvas.width = width;
            canvas.height = height;
        }

        // 1. Draw Base MRI using Uint32Array for speed
        const imgData = ctx.createImageData(width, height);
        const buf = new ArrayBuffer(imgData.data.length);
        const buf8 = new Uint8ClampedArray(buf);
        const data32 = new Uint32Array(buf);

        for (let y = 0; y < height; y++) {
            const row = data[y];
            const yOffset = y * width;
            for (let x = 0; x < width; x++) {
                const val = row[x];
                // ABGR format (little-endian: R G B A)
                data32[yOffset + x] =
                    (255 << 24) |    // Alpha
                    (val << 16) |    // Blue
                    (val << 8)  |    // Green
                    val;             // Red
            }
        }
        imgData.data.set(buf8);
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
            const oBuf = new ArrayBuffer(tempImgData.data.length);
            const oBuf8 = new Uint8ClampedArray(oBuf);
            const oData32 = new Uint32Array(oBuf);

            for (let y = 0; y < oHeight; y++) {
                const oRow = overlay[y];
                const yOffset = y * oWidth;
                for (let x = 0; x < oWidth; x++) {
                    const val = oRow[x];
                    if (val === 0) {
  oData32[yOffset + x] = 0; // Transparent only for background
} else {
                        const [r, g, b] = getJetColor(val);
                        oData32[yOffset + x] =
                            (255 << 24) |
                            (Math.floor(b) << 16) |
                            (Math.floor(g) << 8) |
                            Math.floor(r);
                    }
                }
            }
            tempImgData.data.set(oBuf8);
            tempCtx.putImageData(tempImgData, 0, 0);

            // Draw scaled
            ctx.globalAlpha = opacity;
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(tempCanvas, 0, 0, width, height);
            ctx.globalAlpha = 1.0;
        }

        // MRSI marker
        if (isMRSI && selectedVoxel) {
            ctx.fillStyle = "#ff0000";
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
                width={width}
                height={height}
                onClick={handleClick}
                style={{ 
                    cursor: onClick ? "crosshair" : "default",
                    width: "100%", 
                    height: "100%",
                    imageRendering: "pixelated"
                }}
            />
        </div>
    );
};

export default SliceCanvas;
