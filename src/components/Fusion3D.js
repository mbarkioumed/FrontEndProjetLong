import React from "react";
import Plot from "react-plotly.js";

const Fusion3D = ({ irmData, cursor3D }) => {
    const generateTrace = () => {
        if (!irmData || !irmData.data) return {};

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
                    }
                }
            }
        }

        return {
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
                useResizeHandler={true}
                style={{ width: "100%", height: "100%" }}
            />
        </div>
    );
};

export default Fusion3D;
