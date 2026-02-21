import React, { useEffect, useRef, useState } from "react";

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

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

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
  // (optionnel) pour activer un "focus mode" côté card quand zoom>1
  onZoomChange,
  //      (optionnel) agrandir la vue
  onFocus,
}) => {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  //      Zoom/Pan state
  const [zoom, setZoom] = useState(1); // 1..8
  const [pan, setPan] = useState({ x: 0, y: 0 });

  // drag: on distingue pan vs click (moved)
  const dragRef = useRef({
    dragging: false,
    moved: false,
    startX: 0,
    startY: 0,
    panX: 0,
    panY: 0,
  });

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Simple Jet colormap
  const getJetColor = (v) => {
    const x = v / 255;
    let r, g, b;
    if (x < 0.35) {
      b = 1;
      g = x / 0.35;
      r = 0;
    } else if (x < 0.66) {
      b = (0.66 - x) / 0.31;
      g = 1;
      r = (x - 0.35) / 0.31;
    } else {
      b = 0;
      g = (1 - x) / 0.34;
      r = 1;
    }
    return [r * 255, g * 255, b * 255];
  };

  const height = data?.length || 0;
  const width = data?.[0]?.length || 0;

  useEffect(() => {
    if (!canvasRef.current || !data) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d", { alpha: false });

    if (width === 0 || height === 0) return;

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    // 1) Base MRI
    const imgData = ctx.createImageData(width, height);
    const buf = new ArrayBuffer(imgData.data.length);
    const buf8 = new Uint8ClampedArray(buf);
    const data32 = new Uint32Array(buf);

    for (let y = 0; y < height; y++) {
      const row = data[y];
      const yOffset = y * width;
      for (let x = 0; x < width; x++) {
        const val = row[x];
        data32[yOffset + x] =
          (255 << 24) | (val << 16) | (val << 8) | val;
      }
    }
    imgData.data.set(buf8);
    ctx.putImageData(imgData, 0, 0);

    // 2) Overlay
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
          if (val < 15) {
            oData32[yOffset + x] = 0;
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

      ctx.globalAlpha = opacity;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(tempCanvas, 0, 0, width, height);
      ctx.globalAlpha = 1.0;
    }

    // 3) MRSI marker
    if (isMRSI && selectedVoxel) {
      ctx.fillStyle = "#ff0000";
      ctx.fillRect(selectedVoxel.x, selectedVoxel.y, 1, 1);
    }

    // 4) IRM crosshair
    if (!isMRSI && crosshair) {
      drawCrosshair(ctx, crosshair.x, crosshair.y, width, height);
    }
  }, [data, overlay, opacity, selectedVoxel, isMRSI, crosshair, width, height]);

  // 🔔 remonte info zoom vers la card (optionnel)
  useEffect(() => {
    onZoomChange?.(zoom);
  }, [zoom, onZoomChange]);

  //      Zoom à la molette (SANS Ctrl) centré souris
  const handleWheel = (e) => {
    e.preventDefault();

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    setZoom((z0) => {
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      const z1 = clamp(Number((z0 * factor).toFixed(3)), 1, 8);

      setPan((p0) => {
        const k = z1 / z0;
        return {
          x: mx - (mx - p0.x) * k,
          y: my - (my - p0.y) * k,
        };
      });

      return z1;
    });
  };

  //      Pan au drag gauche seulement quand zoom>1
  const handleMouseDown = (e) => {
    if (e.button !== 0) return; // clic gauche
    if (zoom <= 1) return; // si pas zoomé, on laisse le click voxel

    e.preventDefault();
    dragRef.current = {
      dragging: true,
      moved: false,
      startX: e.clientX,
      startY: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };
  };

  const handleMouseMove = (e) => {
    if (!dragRef.current.dragging) return;
    e.preventDefault();

    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;

    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragRef.current.moved = true;

    setPan({ x: dragRef.current.panX + dx, y: dragRef.current.panY + dy });
  };

  const stopDrag = () => {
    dragRef.current.dragging = false;
  };

  const handleDoubleClick = (e) => {
    e.preventDefault();
    resetView();
  };

  //      Click voxel (si pas de pan)
  const handleClick = (e) => {
    if (!onClick || !canvasRef.current || !containerRef.current) return;

    // si on a déplacé => c'était un pan, pas un click voxel
    if (dragRef.current.moved) {
      dragRef.current.moved = false;
      return;
    }

    const rect = containerRef.current.getBoundingClientRect();

    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;

    const xLocal = (px - pan.x) / zoom;
    const yLocal = (py - pan.y) / zoom;

    const sx = canvasRef.current.width / rect.width;
    const sy = canvasRef.current.height / rect.height;

    const x = Math.floor(xLocal * sx);
    const y = Math.floor(yLocal * sy);

    onClick(x, y);
  };

  return (
    <div className="viz-container" style={{ position: "relative" }}>
      <span className="slice-label">{title}</span>

      {/*      bouton agrandir */}
      {onFocus && (
        <button
          type="button"
          className="btn-secondary"
          style={{ position: "absolute", top: 8, left: 8, zIndex: 6 }}
          onClick={(e) => {
            e.stopPropagation();
            onFocus();
          }}
          title="Agrandir"
        >
          ⤢
        </button>
      )}

      {/*      toolbar */}
      <div
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          zIndex: 5,
          display: "flex",
          gap: 6,
        }}
      >
        <button
          className="btn-secondary"
          onClick={(e) => {
            e.stopPropagation();
            setZoom((z) => clamp(z + 0.25, 1, 8));
          }}
        >
          +
        </button>
        <button
          className="btn-secondary"
          onClick={(e) => {
            e.stopPropagation();
            setZoom((z) => clamp(z - 0.25, 1, 8));
          }}
        >
          -
        </button>
        <button
          className="btn-secondary"
          onClick={(e) => {
            e.stopPropagation();
            resetView();
          }}
        >
          Reset
        </button>
      </div>

      <div
        ref={containerRef}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={stopDrag}
        onMouseLeave={stopDrag}
        onDoubleClick={handleDoubleClick}
        style={{
          width: "100%",
          height: "100%",
          overflow: "hidden",
          position: "relative",
          userSelect: "none",
        }}
      >
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          onClick={handleClick}
          style={{
            cursor: onClick ? (zoom > 1 ? "grab" : "crosshair") : "default",
            width: "100%",
            height: "100%",
            imageRendering: "pixelated",
            transformOrigin: "0 0",
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          }}
        />
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 6,
          left: 8,
          fontSize: 12,
          opacity: 0.7,
          pointerEvents: "none",
        }}
      >
        Molette: zoom · Drag (quand zoomé): déplacer · Double-clic: reset
      </div>
    </div>
  );
};

export default SliceCanvas;