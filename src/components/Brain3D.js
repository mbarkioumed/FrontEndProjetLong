import React from "react";
import Plot from "react-plotly.js";

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
            marker: {
                size: 5,
                color: "red",
                symbol: "diamond",
            },
            type: "scatter3d",
            name: "Cursor",
        };
    };

    React.useEffect(() => {
        // Clear previous state immediately to prevent rendering old heavy data
        setTrace1({});
        
        if (!irmData || !irmData.data_uint8) {
            return;
        }

        // Indicate calculation start
        setIsCalculating(true);

        // Defer calculation to next tick to allow UI update (e.g. loading spinner)
        const timer = setTimeout(() => {
            const data = irmData.data_uint8;
            const [X, Y, Z] = irmData.shape;

            // Reduce resolution further to correct freeze
            const targetDim = 32; 
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
                        
                        const val = data[(i * Y * Z) + (j * Z) + k];
                        values.push(val);
                        if (val > maxVal) maxVal = val;
                    }
                }
            }

            setTrace1({
                x: x,
                y: y,
                z: z,
                value: values,
                type: "isosurface",
                isomin: Math.min(30, maxVal),
                isomax: Math.max(maxVal, 31),
                surface: { show: true, count: 2, fill: 0.8 },
                caps: { x: { show: false }, y: { show: false }, z: { show: false } },
                colorscale: "Jet", 
                lighting: {
                    ambient: 0.6,
                    diffuse: 0.8,
                    specular: 0.2,
                    roughness: 0.5,
                    fresnel: 0.2
                },
                name: "Brain Surface",
                hoverinfo: "none",
                showscale: false,
            });
            setIsCalculating(false);
        }, 100); 

        return () => clearTimeout(timer);
    }, [irmData?.nom_fichier]); // Only re-run if file changes, ignore reference instability

    const trace2 = cursorTrace();

    const data = trace1.x ? [trace1] : [];
    if (trace2) data.push(trace2);

    return (
        <div style={{ width: "100%", height: "100%", position: "relative" }}>
            {isCalculating && (
                <div style={{
                    position: "absolute",
                    top: 0, left: 0, right: 0, bottom: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: "rgba(0,0,0,0.5)", color: "white", zIndex: 10
                }}>
                    Calcul 3D...
                </div>
            )}
            <Plot
                data={data}
                layout={{
                    uirevision: irmData ? irmData.nom_fichier : "true",
                    margin: { l: 0, r: 0, b: 0, t: 0 },
                    scene: {
                        xaxis: { title: "X", visible: false },
                        yaxis: { title: "Y", visible: false },
                        zaxis: { title: "Z", visible: false },
                        aspectmode: "data",
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

export default Brain3D;
