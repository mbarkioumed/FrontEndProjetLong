import React from "react";
import Plot from "react-plotly.js";

const Fusion3D = ({ irmData, cursor3D }) => {
    const generateTrace = () => {
        if (!irmData || !irmData.data) return {};

<<<<<<< HEAD
        const data = irmData.data;
        const [X, Y, Z] = irmData.shape;

        // Target grid size for performance (e.g. max 64 points per axis)
        // This keeps the total points manageable (< 260k points)
        const targetDim = 64; 
        const strideX = Math.ceil(X / targetDim);
        const strideY = Math.ceil(Y / targetDim);
        const strideZ = Math.ceil(Z / targetDim);

        const x = [];
        const y = [];
        const z = [];
        const values = [];

        // Build the dense grid
        let maxVal = 0;
        for (let k = 0; k < Z; k += strideZ) {
            for (let j = 0; j < Y; j += strideY) {
                for (let i = 0; i < X; i += strideX) {
                    x.push(i);
                    y.push(j);
                    z.push(k);
                    // Handle potential out-of-bounds due to stride
                    if (i < X && j < Y && k < Z) {
                        // Robust access + type check
                        const row = data[i];
                        const col = row ? row[j] : null;
                        const rawVal = col ? col[k] : 0;
                        const val = (typeof rawVal === 'number' && !isNaN(rawVal)) ? rawVal : 0;
                        
                        values.push(val);
                        if (val > maxVal) maxVal = val;
                    } else {
                        values.push(0);
=======
        const x = [];
        const y = [];
        const z = [];
        const intensity = [];

        const [X, Y, Z] = irmData.shape;
        const data = irmData.data;

        const stride = Math.max(Math.floor(X / 15), 6);

        const threshold = 30;

        for (let k = 0; k < Z; k += stride) {
            for (let j = 0; j < Y; j += stride) {
                for (let i = 0; i < X; i += stride) {
                    const val = data[i][j][k];
                    if (val > threshold) {
                        x.push(i);
                        y.push(j);
                        z.push(k);
                        intensity.push(val);
>>>>>>> 653ddbd (Frontend: fixes FFT  + fetch handling)
                    }
                }
            }
        }

        return {
<<<<<<< HEAD
            x: x,
            y: y,
            z: z,
            value: values,
            type: "isosurface",
            isomin: Math.min(30, maxVal), // Threshold adapts if signal is low
            isomax: Math.max(maxVal, 31), // Ensure max > min
            surface: { show: true, count: 2, fill: 0.8 },
            caps: { x: { show: false }, y: { show: false }, z: { show: false } }, // Open boundaries
            colorscale: "Jet", // Better medical look
            lighting: {
                ambient: 0.6,
                diffuse: 0.8,
                specular: 0.2,
                roughness: 0.5,
                fresnel: 0.2
            },
            name: "Brain Surface",
=======
            x,
            y,
            z,
            mode: "markers",
            marker: {
                size: 2,
                color: intensity,
                colorscale: "Gray",
                opacity: 0.3,
            },
            type: "scatter3d",
            name: "Brain MRI",
>>>>>>> 653ddbd (Frontend: fixes FFT  + fetch handling)
            hoverinfo: "none",
        };
    };

    const cursorTrace = () => {
        if (!cursor3D) return null;
        return {
            x: [cursor3D.x],
            y: [cursor3D.y],
            z: [cursor3D.z],
            mode: "markers",
            marker: {
                size: 5,
                color: "red",
                symbol: "diamond",
            },
            type: "scatter3d",
            name: "Cursor",
        };
    };

    const trace1 = React.useMemo(() => generateTrace(), [irmData]);
    const trace2 = cursorTrace();

    const data = trace1.x ? [trace1] : [];
    if (trace2) data.push(trace2);

    return (
        <div style={{ width: "100%", height: "100%" }}>
            <Plot
                data={data}
<<<<<<< HEAD
                    layout={{
                        uirevision: irmData ? irmData.nom_fichier : "true", // Keep state unless file changes
                        margin: { l: 0, r: 0, b: 0, t: 0 },
                        scene: {
                            xaxis: { title: "X", visible: false },
                            yaxis: { title: "Y", visible: false },
                            zaxis: { title: "Z", visible: false },
                            aspectmode: "data", // Maintain true aspect ratio
                            bgcolor: "black",
                        },
                        autosize: true,
                        paper_bgcolor: "black",
                        plot_bgcolor: "black",
                        showlegend: false,
                    }}
=======
                layout={{
                    margin: { l: 0, r: 0, b: 0, t: 0 },
                    scene: {
                        xaxis: { title: "X", visible: false },
                        yaxis: { title: "Y", visible: false },
                        zaxis: { title: "Z", visible: false },
                        aspectmode: "data", // Maintain true aspect ratio
                        bgcolor: "black",
                    },
                    autosize: true,
                    paper_bgcolor: "black",
                    plot_bgcolor: "black",
                    showlegend: false,
                }}
>>>>>>> 653ddbd (Frontend: fixes FFT  + fetch handling)
                useResizeHandler={true}
                style={{ width: "100%", height: "100%" }}
            />
        </div>
    );
};

export default Fusion3D;
