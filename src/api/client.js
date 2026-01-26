const API_URL = "http://127.0.0.1:8000";

export const api = {
  health: async () => {
    const r = await fetch(`${API_URL}/`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  },

  spectrum: async (x, y, z) => {
    const r = await fetch(`${API_URL}/spectrum/${x}/${y}/${z}`);
    const data = await r.json();
    if (!r.ok || data?.error) throw new Error(data?.error || `HTTP ${r.status}`);
    return data;
  },

  // ✅ NOUVEAU: envoie un JSON dataset au backend
  uploadJsonDataset: async (datasetJson) => {
    const r = await fetch(`${API_URL}/upload-json-dataset/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(datasetJson),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.detail || `HTTP ${r.status}`);
    return data;
  },
};