const API_URL = "http://127.0.0.1:8000";

async function safeJson(r) {
  try {
    return await r.json();
  } catch {
    return {};
  }
}

export const api = {
  health: async () => {
    const r = await fetch(`${API_URL}/`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  },

  spectrum: async (x, y, z, token) => {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    const r = await fetch(`${API_URL}/spectrum/${x}/${y}/${z}`, { headers });
    const data = await safeJson(r);
    if (!r.ok || data?.error) throw new Error(data?.error || `HTTP ${r.status}`);
    return data;
  },

  // ✅ Dataset patients -> tri patient/date
  uploadJsonDataset: async (datasetJson, token) => {
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;

    const r = await fetch(`${API_URL}/upload-json-dataset/`, {
      method: "POST",
      headers,
      body: JSON.stringify(datasetJson),
    });

    const data = await safeJson(r);
    if (!r.ok) throw new Error(data?.detail || `HTTP ${r.status}`);
    return data;
  },

  // ✅ Upload IRM depuis un objet File (utile pour Patients)
  uploadIRMFile: async (file, token) => {
    const formData = new FormData();
    formData.append("fichier", file);

    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    const r = await fetch(`${API_URL}/upload-irm/`, {
      method: "POST",
      headers,
      body: formData,
    });

    const data = await safeJson(r);
    if (!r.ok) throw new Error(data?.detail || `HTTP ${r.status}`);
    if (data?.error) throw new Error(data.error);
    return data;
  },

  // ✅ Upload MRSI depuis un objet File (utile pour Patients)
  uploadMRSIFile: async (file, token) => {
    const formData = new FormData();
    formData.append("fichier", file);

    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    const r = await fetch(`${API_URL}/upload-mrsi/`, {
      method: "POST",
      headers,
      body: formData,
    });

    const data = await safeJson(r);
    if (!r.ok) throw new Error(data?.detail || `HTTP ${r.status}`);
    if (data?.error) throw new Error(data.error);
    return data;
  },

  // FFT test (déjà chez toi)
  runTreatment: async (catalog, token) => {
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;

    const r = await fetch(`${API_URL}/traitement/test_fft/`, {
      method: "POST",
      headers,
      body: JSON.stringify(catalog),
    });
    const data = await safeJson(r);
    if (!r.ok) throw new Error(data?.detail || `HTTP ${r.status}`);
    return data;
  },
};
