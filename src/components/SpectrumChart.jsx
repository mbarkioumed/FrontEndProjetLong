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
    if (!spectrum || spectrum.length < 2) return;

    // Clear
    ctx.clearRect(0, 0, width, height);

    // Background subtle grid
    ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
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

    const values = spectrum.map(Number).filter(Number.isFinite);
    const max = Math.max(...values.map(Math.abs)) || 1;
    const step = width / (values.length - 1);

    // Fill gradient under curve
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "rgba(56, 189, 248, 0.45)");
    gradient.addColorStop(1, "rgba(56, 189, 248, 0.0)");

    // Draw path
    ctx.beginPath();
    values.forEach((val, i) => {
      const x = i * step;
      const y = height - ((val / max) * (height * 0.78) + height * 0.1);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });

    // Fill
    ctx.save();
    const lastX = (values.length - 1) * step;
    ctx.lineTo(lastX, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.restore();

    // Stroke line
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    values.forEach((val, i) => {
      const x = i * step;
      const y = height - ((val / max) * (height * 0.78) + height * 0.1);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Baseline
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height - 4);
    ctx.lineTo(width, height - 4);
    ctx.stroke();

    // ppm labels
    ctx.fillStyle = "rgba(148,163,184,0.8)";
    ctx.font = "9px monospace";
    ctx.fillText("0 ppm", 3, height - 6);
    ctx.fillText("4 ppm", width - 32, height - 6);

    // Voxel label — safe guard
    const voxel = data?.voxel;
    if (voxel && voxel.x != null && voxel.y != null && voxel.z != null) {
      ctx.fillStyle = "rgba(56,189,248,0.9)";
      ctx.font = "bold 11px monospace";
      ctx.fillText(
        `Voxel (${voxel.x}, ${voxel.y}, ${voxel.z})`,
        8,
        14,
      );
    }
  }, [data]);

  return (
    <div
      className="spectrum-container"
      style={{ width: "100%", height: "100%" }}
    >
      <canvas
        ref={canvasRef}
        width={400}
        height={110}
        style={{ width: "100%", height: "100%", display: "block" }}
      />
    </div>
  );
}