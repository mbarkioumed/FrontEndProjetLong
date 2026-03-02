import React, { useEffect, useRef } from "react";

export default function MetaboliteHeatmap({
  volumeData,
  dimensions,
  metabolite,
  sliceIndex = 0,
}) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!volumeData || !dimensions) return;

    const X = dimensions.X;
    const Y = dimensions.Y;
    const Z = dimensions.Z;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    let maxVal = 0;

    // First pass: find max value for normalization
    for (let i = 0; i < X; i++) {
      for (let j = 0; j < Y; j++) {
        const key = `${i}_${j}_${sliceIndex}`;
        const val = volumeData[key]?.[metabolite];

        if (typeof val === "number" && val > maxVal) {
          maxVal = val;
        }
      }
    }

    if (maxVal === 0) {
      console.warn("Max value is 0 for metabolite:", metabolite);
      return;
    }

    const cellW = width / X;
    const cellH = height / Y;

    for (let i = 0; i < X; i++) {
      for (let j = 0; j < Y; j++) {
        const key = `${i}_${j}_${sliceIndex}`;
        const rawVal = volumeData[key]?.[metabolite] ?? 0;

        const value = rawVal / maxVal;

        // === Pastel Yellow → Green → Blue colormap ===

        // Fond gris clair pour valeur très faible
        if (value < 0.02) {
          ctx.fillStyle = "#e5e7eb"; // gris clair
        } else {
          let r, g, b;

          if (value < 0.5) {
            // Jaune pastel -> Vert pastel
            const t = value / 0.5;

            r = 255 - Math.floor(100 * t);   // 255 -> 155
            g = 240;                         // vert doux constant
            b = 150 - Math.floor(50 * t);    // 150 -> 100
          } else {
            // Vert pastel -> Bleu pastel
            const t = (value - 0.5) / 0.5;

            r = 155 - Math.floor(100 * t);   // 155 -> 55
            g = 240 - Math.floor(120 * t);   // 240 -> 120
            b = 100 + Math.floor(120 * t);   // 100 -> 220
          }

          ctx.fillStyle = `rgb(${r},${g},${b})`;
        }

        ctx.fillRect(
          i * cellW,
          height - (j + 1) * cellH,
          cellW,
          cellH
        );
      }
    }

  }, [volumeData, dimensions, metabolite, sliceIndex]);

  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 12, marginBottom: 4 }}>
        {metabolite} – slice Z={sliceIndex}
      </div>
      <canvas ref={canvasRef} width={200} height={200} />
    </div>
  );
}