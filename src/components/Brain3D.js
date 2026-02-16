import React from "react";
import Plot from "react-plotly.js";
import { getData } from "../utils/dataCache"; // <-- adapte le chemin si besoin

const Brain3D = ({ irmData, cursor3D }) => {
  const [trace1, setTrace1] = React.useState({});
  const [isCalculating, setIsCalculating] = React.useState(false);

  const cursorTrace = () => {
    if (!cursor3D) return null;
    return {
      x: [cursor3D.x],
      y: [cursor3D.y],
      z: [cursor3D.z],
      mode: "markers",
      marker: { size: 5, color: "red", symbol: "diamond" },
      type: "scatter3d",
      name: "Cursor",
    };
  };

  React.useEffect(() => {
    setTrace1({});

    if (!irmData || !irmData.shape) return;

    // ✅ récupérer les bytes depuis le cache si data_uint8 absent
    const data = irmData.data_uint8 || (irmData.dataRef ? getData(irmData.dataRef) : null);
    if (!data) return;

    setIsCalculating(true);

    const timer = setTimeout(() => {
      const [X, Y, Z] = irmData.shape;

      const targetDim = 32;
      const strideX = Math.ceil(X / targetDim);
      const strideY = Math.ceil(Y / targetDim);
      const strideZ = Math.ceil(Z / targetDim);

      const x = [];
      const y = [];
      const z = [];
      const values = [];

      let maxVal = 0;
      for (let k = 0; k < Z; k += strideZ) {
        for (let j = 0; j < Y; j += strideY) {
          for (let i = 0; i < X; i += strideX) {
            const val = data[i * Y * Z + j * Z + k];
            x.push(i); y.push(j); z.push(k);
            values.push(val);
            if (val > maxVal) maxVal = val;
          }
        }
      }

      // ✅ évite isomin/isomax identiques (sinon surface invisible)
      const isoMin = Math.max(1, Math.floor(maxVal * 0.35));
      const isoMax = Math.max(isoMin + 1, Math.floor(maxVal * 0.85));

      setTrace1({
        x, y, z,
        value: values,
        type: "isosurface",
        isomin: isoMin,
        isomax: isoMax,
        surface: { show: true, count: 2, fill: 0.8 },
        caps: { x: { show: false }, y: { show: false }, z: { show: false } },
        colorscale: "Jet",
        name: "Brain Surface",
        hoverinfo: "none",
        showscale: false,
      });

      setIsCalculating(false);
    }, 50);

    return () => clearTimeout(timer);
  }, [irmData?.dataRef, irmData?.nom_fichier, irmData?.__versionId]);

  const trace2 = cursorTrace();
  const dataPlot = trace1.x ? [trace1] : [];
  if (trace2) dataPlot.push(trace2);

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      {isCalculating && (
        <div style={{
          position: "absolute", inset: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(0,0,0,0.5)", color: "white", zIndex: 10
        }}>
          Calcul 3D...
        </div>
      )}

      <Plot
        data={dataPlot}
        layout={{
          uirevision: irmData?.nom_fichier || "true",
          margin: { l: 0, r: 0, b: 0, t: 0 },
          scene: {
            xaxis: { visible: false },
            yaxis: { visible: false },
            zaxis: { visible: false },
            aspectmode: "data",
            bgcolor: "black",
          },
          autosize: true,
          paper_bgcolor: "black",
          plot_bgcolor: "black",
          showlegend: false,
        }}
        useResizeHandler
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
};

export default Brain3D;
