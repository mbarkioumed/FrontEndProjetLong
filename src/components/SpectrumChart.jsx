import React, { useEffect, useRef } from "react";

export default function SpectrumChart({ data }) {
    const canvasRef = useRef(null);

    useEffect(() => {
        if (!canvasRef.current || !data) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        const width = canvas.width;
        const height = canvas.height;
        const spectrum = data?.spectrum;
        if (!spectrum) return;

        // Clear
        ctx.clearRect(0, 0, width, height);

        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, "rgba(56, 189, 248, 0.5)");
        gradient.addColorStop(1, "rgba(56, 189, 248, 0.0)");

        ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < width; i += width / 10) {
            ctx.moveTo(i, 0);
            ctx.lineTo(i, height);
        }
        for (let i = 0; i < height; i += height / 4) {
            ctx.moveTo(0, i);
            ctx.lineTo(width, i);
        }
        ctx.stroke();

        const max = Math.max(...spectrum.map(Math.abs)) || 1;
        const step = width / (spectrum.length - 1);

        ctx.beginPath();
        spectrum.forEach((val, i) => {
            const x = i * step;
            const y = height - ((val / max) * (height * 0.8) + height * 0.1);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });

        ctx.save();
        ctx.lineTo(width, height);
        ctx.lineTo(0, height);
        ctx.closePath();
        ctx.fillStyle = gradient;
        ctx.fill();
        ctx.restore();

        ctx.strokeStyle = "#0ea5e9";
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = "#64748b";
        ctx.font = "10px sans-serif";
        ctx.fillText("0 ppm", 2, height - 2);
        ctx.fillText("4 ppm", width - 30, height - 2);

        ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
        ctx.font = "12px monospace";
        ctx.fillText(
            `Voxel [${data.voxel.x}, ${data.voxel.y}, ${data.voxel.z}]`,
            10,
            15,
        );
    }, [data]);

    return (
        <div
            className="spectrum-container"
            style={{ width: "100%", height: "100%" }}
        >
            <canvas
                ref={canvasRef}
                width={600}
                height={150} // Reduced height
                style={{ width: "100%", height: "100%", display: "block" }}
            />
        </div>
    );
}
