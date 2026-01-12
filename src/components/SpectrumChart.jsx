import React, { useEffect, useRef } from "react";

export default function SpectrumChart({ data }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !data) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    const spectrum = data.spectrum;

    ctx.clearRect(0, 0, width, height);

    // Background
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(0, 0, width, height);

    // Grid
    ctx.strokeStyle = "#334155";
    ctx.beginPath();
    for (let i = 0; i < width; i += 50) {
      ctx.moveTo(i, 0);
      ctx.lineTo(i, height);
    }
    for (let i = 0; i < height; i += 30) {
      ctx.moveTo(0, i);
      ctx.lineTo(width, i);
    }
    ctx.stroke();

    // Data
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 2;
    ctx.beginPath();

    const max = Math.max(...spectrum.map(Math.abs)) || 1;
    const step = width / spectrum.length;

    spectrum.forEach((val, i) => {
      const x = i * step;
      const y = height / 2 - (val / max) * (height / 2.5);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Info text
    ctx.fillStyle = "white";
    ctx.font = "10px sans-serif";
    ctx.fillText(
      `Voxel: (${data.voxel.x}, ${data.voxel.y}, ${data.voxel.z})`,
      10,
      20
    );
  }, [data]);

  return (
    <div className="spectrum-container">
      <h3>Spectre du Voxel</h3>
      <canvas
        ref={canvasRef}
        width={600}
        height={200}
        style={{ borderRadius: "8px", width: "100%" }}
      />
    </div>
  );
}
