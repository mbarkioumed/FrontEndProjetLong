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
    crosshair,
}) => {
    const canvasRef = useRef(null);

    useEffect(() => {
        if (!canvasRef.current || !data) return;

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

        // MRSI marker (single voxel)
        if (isMRSI && selectedVoxel) {
            ctx.fillStyle = "#ff0000";
            ctx.fillRect(selectedVoxel.x, selectedVoxel.y, 1, 1);
        }

        // IRM crosshair
        if (!isMRSI && crosshair) {
            drawCrosshair(ctx, crosshair.x, crosshair.y, width, height);
        }
    }, [data, selectedVoxel, isMRSI, crosshair]);

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
