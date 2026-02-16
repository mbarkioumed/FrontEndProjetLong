import React, { useContext, useMemo, useState } from "react";
import AuthContext from "../context/AuthContext";
import { api } from "../api/client";

/**
 * PatientsExplorer
 * Props:
 *  - onOpenExam: ({ irmFiles: File[], mrsiFile: File|null, maskFile: File|null, meta: {...} }) => Promise<void>
 */
export default function PatientsExplorer({ onOpenExam }) {
  const { token } = useContext(AuthContext);

  const [raw, setRaw] = useState(""); // debug JSON visible
  const [datasetJson, setDatasetJson] = useState(null);
  const [fileMap, setFileMap] = useState({}); // relativePath -> File
  const [patientsTree, setPatientsTree] = useState(null);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // ---------- helpers ----------
  const isNifti = (name = "") =>
    name.toLowerCase().endsWith(".nii") ||
    name.toLowerCase().endsWith(".nii.gz");

  const normalizeRelPath = (p = "") => p.replaceAll("\\", "/");

  const buildDatasetFromFolderFiles = (filesList) => {
    const files = Array.from(filesList || []);
    if (!files.length) return { dataset: null, map: {} };

    // root folder = first segment of webkitRelativePath
    const firstPath = files[0].webkitRelativePath || "";
    const rootFolder = normalizeRelPath(firstPath).split("/")[0] || "Dataset";

    const map = {};
    const entries = [];

    for (const f of files) {
      const rel = normalizeRelPath(f.webkitRelativePath || f.name);
      if (!rel) continue;
      if (!isNifti(f.name)) continue;

      map[rel] = f;
      // NEW: also map without rootFolder prefix if possible
      const parts = rel.split("/");
      if (parts.length > 1) {
        const withoutRoot = parts.slice(1).join("/");
        map[withoutRoot] = f;
      }
      entries.push({
        name: f.name,
        relativePath: rel,
      });
    }

    const dataset = { rootFolder, files: entries };
    return { dataset, map };
  };

  // backend response variants -> unify
  const normalizeBackendTree = (data) => {
    // expected: {patients:[...]} but might be direct list
    const patients = data?.patients || data?.Patients || data || [];
    if (!Array.isArray(patients)) return [];

    return patients.map((p) => {
      const patientId = p.patientId || p.patient_id || p.id || "Unknown";
      const analyses = p.analyses || p.exams || p.examens || [];
      const exams = Array.isArray(analyses) ? analyses : [];

      const normalizedExams = exams.map((ex) => {
        const date = ex.date || ex.acquisition_date || ex.day || "Unknown date";
        const files = ex.files || ex.fichiers || [];
        const normFiles = (Array.isArray(files) ? files : []).map((f) => ({
          relative_path:
            f.relative_path || f.relativePath || f.path || f.rel || "",
          type_analyse: f.type_analyse || f.type || f.modality || "",
          modalites_IRM:
            f.modalites_IRM || f.modalite || f.mri_modality || null,
          name: f.name || f.nom || "",
        }));
        return { date, files: normFiles };
      });

      return { patientId, analyses: normalizedExams };
    });
  };

  const normalizedPatients = useMemo(
    () => (patientsTree ? normalizeBackendTree(patientsTree) : []),
    [patientsTree],
  );

  // ---------- UI handlers ----------
  const handleFolderPick = (e) => {
    setErr("");
    const picked = e.target.files;

    // Note: webkitdirectory is Chrome/Edge. If missing, no relative path.
    const hasRel = picked && picked.length && picked[0].webkitRelativePath;
    if (!hasRel) {
      setErr(
        "Sélection de dossier non supportée ici. Utilise Chrome/Edge, ou colle un JSON de debug.",
      );
      return;
    }

    const { dataset, map } = buildDatasetFromFolderFiles(picked);
    if (!dataset || dataset.files.length === 0) {
      setErr("Aucun fichier NIfTI (.nii / .nii.gz) trouvé dans ce dossier.");
      return;
    }

    setDatasetJson(dataset);
    setFileMap(map);
    const pretty = JSON.stringify(dataset, null, 2);
    setRaw(pretty);
  };

  const handleSendDataset = async () => {
    setErr("");
    setLoading(true);
    try {
      let payload = datasetJson;

      // fallback debug: if user pasted json manually
      if (!payload && raw?.trim()) {
        payload = JSON.parse(raw);
      }
      if (!payload) throw new Error("Aucun dataset JSON disponible.");

      const data = await api.uploadJsonDataset(payload, token);
      setPatientsTree(data);
    } catch (e) {
      setErr(e.message || "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  };
  const pickExamFiles = (exam) => {
    // exam.files contains relative_path + type_analyse
    const irm = [];
    let mrsi = null;
    let mask = null;

    for (const f of exam.files || []) {
      const rel = f.relative_path;
      const type = (f.type_analyse || "").toUpperCase();

      if (!rel) continue;
      const fileObj = fileMap[rel];
      if (!fileObj) continue;

      if (type.includes("IRM")) irm.push(fileObj);
      else if (type.includes("MRSI")) mrsi = fileObj;
      else if (type.includes("MASK")) mask = fileObj;
    }

    // Fallback heuristique si type_analyse pas fiable
    if (irm.length === 0 || !mrsi || !mask) {
      for (const f of exam.files || []) {
        const rel = f.relative_path;
        const fileObj = fileMap[rel];
        if (!fileObj) continue;

        const n = fileObj.name.toLowerCase();

        // mask / segmentation
        const looksLikeMask =
          n.includes("mask") ||
          n.includes("seg") ||
          n.includes("label") ||
          n.includes("roi");

        if (looksLikeMask) {
          mask = mask || fileObj;
          continue;
        }

        // mrsi
        if (n.includes("mrsi")) {
          mrsi = mrsi || fileObj;
          continue;
        }

        // sinon on considère IRM
        irm.push(fileObj);
      }
    }

    return { irmFiles: irm, mrsiFile: mrsi, maskFile: mask };
  };

  const handleOpenExam = async (patientId, date, exam) => {
    setErr("");
    if (!onOpenExam) {
      setErr("onOpenExam non fourni par App.js");
      return;
    }
    if (!Object.keys(fileMap).length) {
      setErr(
        "Pour ouvrir automatiquement un examen, il faut sélectionner un dossier (sinon le front n'a pas accès aux fichiers).",
      );
      return;
    }

    const { irmFiles, mrsiFile, maskFile } = pickExamFiles(exam);

    if (!irmFiles.length && !mrsiFile) {
      setErr(
        "Impossible de retrouver les fichiers sur ton disque (fileMap vide ou chemins différents).",
      );
      return;
    }

    await onOpenExam({
      irmFiles,
      mrsiFile,
      maskFile,
      meta: { patientId, date, exam },
    });
  };

  // ---------- render ----------
  return (
    <div className="card">
      <h2>👤 Patients</h2>

      <div style={{ marginTop: "0.75rem" }}>
        <label style={{ display: "block", marginBottom: 6, fontWeight: 600 }}>
          1) Choisir un dossier dataset (Chrome/Edge)
        </label>

        <input
          type="file"
          webkitdirectory="true"
          directory="true"
          multiple
          onChange={handleFolderPick}
          style={{ display: "block", marginBottom: 10 }}
        />

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            className="btn-primary"
            onClick={handleSendDataset}
            disabled={loading || (!datasetJson && !raw.trim())}
          >
            {loading ? "Envoi..." : "2) Envoyer au backend"}
          </button>

          <button
            className="btn-primary"
            onClick={() => {
              setRaw("");
              setDatasetJson(null);
              setPatientsTree(null);
              setFileMap({});
              setErr("");
            }}
            disabled={loading}
          >
            Réinitialiser
          </button>
        </div>

        <p
          style={{
            marginTop: 10,
            color: "var(--text-muted)",
            fontSize: "0.85rem",
          }}
        >
          Debug : le JSON généré est affiché ci-dessous. Tu peux aussi coller un
          JSON ici si besoin.
        </p>

        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder="JSON dataset (debug)"
          style={{
            width: "100%",
            minHeight: 140,
            fontFamily: "monospace",
            padding: 10,
            borderRadius: 10,
            border: "1px solid var(--border-color)",
            background: "var(--card-bg)",
            color: "var(--text-color)",
          }}
        />
      </div>

      {err && (
        <div
          style={{
            marginTop: 12,
            padding: "0.75rem 1rem",
            borderRadius: 10,
            borderLeft: "4px solid var(--danger)",
            color: "var(--danger)",
          }}
        >
          {err}
        </div>
      )}

      {/* Patients tree */}
      <div style={{ marginTop: 16 }}>
        {!patientsTree && (
          <div style={{ color: "var(--text-muted)" }}>
            Aucun patient chargé pour l’instant. Sélectionne un dossier puis
            “Envoyer”.
          </div>
        )}

        {patientsTree && normalizedPatients.length === 0 && (
          <div style={{ color: "var(--text-muted)" }}>
            Réponse backend reçue, mais structure inattendue.
          </div>
        )}

        {normalizedPatients.map((p) => (
          <div
            key={p.patientId}
            style={{
              marginTop: 12,
              padding: 12,
              borderRadius: 12,
              border: "1px solid var(--border-color)",
              background: "var(--card-bg)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <strong>Patient: {p.patientId}</strong>
              <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
                {p.analyses.length} examen(s)
              </span>
            </div>

            <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
              {p.analyses.map((ex, idx) => (
                <div
                  key={`${p.patientId}-${ex.date}-${idx}`}
                  style={{
                    padding: 10,
                    borderRadius: 10,
                    background: "rgba(255,255,255,0.02)",
                    border: "1px solid var(--border-color)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <div>
                      <strong>Date: {ex.date}</strong>
                      <div
                        style={{
                          marginTop: 4,
                          color: "var(--text-muted)",
                          fontSize: "0.85rem",
                        }}
                      >
                        {ex.files.length} fichier(s)
                      </div>
                    </div>

                    <button
                      className="btn-primary"
                      onClick={() => handleOpenExam(p.patientId, ex.date, ex)}
                      disabled={loading}
                    >
                      Ouvrir cet examen
                    </button>
                  </div>

                  <div
                    style={{
                      marginTop: 8,
                      fontFamily: "monospace",
                      fontSize: "0.82rem",
                    }}
                  >
                    {ex.files.map((f, j) => (
                      <div
                        key={`${f.relative_path}-${j}`}
                        style={{ opacity: 0.95 }}
                      >
                        • {f.type_analyse || "?"}{" "}
                        {f.modalites_IRM ? `(mod: ${f.modalites_IRM})` : ""} —{" "}
                        <span style={{ color: "var(--text-muted)" }}>
                          {f.relative_path || f.name}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* warning if fileMap cannot locate */}
                  {Object.keys(fileMap).length > 0 &&
                    ex.files.some(
                      (f) => f.relative_path && !fileMap[f.relative_path],
                    ) && (
                      <div
                        style={{
                          marginTop: 8,
                          color: "var(--text-muted)",
                          fontSize: "0.8rem",
                        }}
                      >
                        ⚠️ Certains chemins renvoyés par le backend ne matchent
                        pas ceux du navigateur (relative_path). Vérifie que le
                        backend renvoie bien les mêmes `relativePath` que
                        `webkitRelativePath`.
                      </div>
                    )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
