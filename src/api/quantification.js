// src/api/quantification.js
const BASE = "http://127.0.0.1:8000";

// à adapter selon ton auth (si tu utilises un token)
const authHeaders = () => {
  const token = localStorage.getItem("token"); // ou "access_token" selon ton app
  return token ? { Authorization: `Bearer ${token}` } : {};
};

/**
 * Route1: lance la quantification sur un ou plusieurs examens.
 * payload attendu (proposition):
 * {
 *   treatment_name: "predict1",
 *   exams: [
 *     { exam_id: "MsrGB01_PUI_20110324", files: [{name, kind}] }
 *   ]
 * }
 */
export async function runQuantification({ treatmentName, exams }) {
  const res = await fetch(`${BASE}/quantification/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify({ treatment_name: treatmentName, exams }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.detail || json?.error || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return json;
}

/**
 * Route2: upload seulement les fichiers manquants
 * payload attendu (proposition):
 * FormData:
 * - files[]: UploadFile
 * - meta: JSON string: [{name, kind, exam_id}, ...]
 */
export async function uploadMissingFiles({ missing }) {
  const fd = new FormData();

  // missing = [{ file: File, name: string, kind: "IRM"|"MRSI", exam_id: string }]
  missing.forEach((m) => {
    fd.append("files", m.file, m.name);
  });
  fd.append(
    "meta",
    JSON.stringify(missing.map(({ name, kind, exam_id }) => ({ name, kind, exam_id })))
  );

  const res = await fetch(`${BASE}/quantification/upload-missing`, {
    method: "POST",
    headers: {
      ...authHeaders(),
      // surtout PAS de Content-Type ici (FormData le gère)
    },
    body: fd,
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.detail || json?.error || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return json;
}