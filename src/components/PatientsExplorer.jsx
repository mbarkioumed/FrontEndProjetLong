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

  //    Quantification UI state
  const [selectedExamKeys, setSelectedExamKeys] = useState(() => new Set());
  const [treatmentName, setTreatmentName] = useState("predict1");
  const [quant, setQuant] = useState({
    loading: false,
    error: "",
    result: null,
    info: "",
  });

  // ---------- backend base ----------
  const BASE_URL =
    api?.BASE_URL || api?.baseUrl || api?.BASE || "http://127.0.0.1:8000";

  const authHeaders = () => {
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  // ---------- helpers ----------
  const isNifti = (name = "") =>
    name.toLowerCase().endsWith(".nii") || name.toLowerCase().endsWith(".nii.gz");

  const normalizeRelPath = (p = "") => String(p).replaceAll("\\", "/");

  const buildDatasetFromFolderFiles = (filesList) => {
    const files = Array.from(filesList || []);
    if (!files.length) return { dataset: null, map: {} };

    const firstPath = files[0].webkitRelativePath || "";
    const rootFolder = normalizeRelPath(firstPath).split("/")[0] || "Dataset";

    const map = {};
    const entries = [];

    for (const f of files) {
      const rel = normalizeRelPath(f.webkitRelativePath || f.name);
      if (!rel) continue;
      if (!isNifti(f.name)) continue;

      map[rel] = f;

      // also map without root folder prefix
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
    setRaw(JSON.stringify(dataset, null, 2));

    // reset selection quantif
    setSelectedExamKeys(new Set());
    setQuant({ loading: false, error: "", result: null, info: "" });
  };

  const handleSendDataset = async () => {
    setErr("");
    setLoading(true);
    try {
      let payload = datasetJson;
      if (!payload && raw?.trim()) payload = JSON.parse(raw);
      if (!payload) throw new Error("Aucun dataset JSON disponible.");

      const data = await api.uploadJsonDataset(payload, token);
      setPatientsTree(data);

      setSelectedExamKeys(new Set());
      setQuant({ loading: false, error: "", result: null, info: "" });
    } catch (e) {
      setErr(e.message || "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  };

  const pickExamFiles = (exam) => {
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

    // fallback
    if (irm.length === 0 || !mrsi || !mask) {
      for (const f of exam.files || []) {
        const rel = f.relative_path;
        const fileObj = fileMap[rel];
        if (!fileObj) continue;

        const n = fileObj.name.toLowerCase();
        const looksLikeMask =
          n.includes("mask") ||
          n.includes("seg") ||
          n.includes("label") ||
          n.includes("roi");

        if (looksLikeMask) {
          mask = mask || fileObj;
          continue;
        }
        if (n.includes("mrsi")) {
          mrsi = mrsi || fileObj;
          continue;
        }
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

  // ---------- Quantification helpers ----------
  const examKey = (patientId, date, idx) => `${patientId}__${date}__${idx}`;

  const toggleExam = (key) => {
    setSelectedExamKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const clearSelection = () => setSelectedExamKeys(new Set());

  // classify from path (better than relying on type_analyse)
  const classifyTypeFromPath = (p = "") => {
    const s = normalizeRelPath(p).toUpperCase();
    if (s.includes("/MRSI/")) return "MRSI";
    if (s.includes("/MASKS/") || s.includes("/MASK/")) return "MASK";
    if (s.includes("/MRI/") || s.includes("/IRM/")) return "IRM";
    return "IRM";
  };

  const buildSelectedExamRequests = () => {
    const out = [];
    normalizedPatients.forEach((p) => {
      p.analyses.forEach((ex, idx) => {
        const key = examKey(p.patientId, ex.date, idx);
        if (!selectedExamKeys.has(key)) return;

        const fileNames = (ex.files || [])
          .map((f) => f.relative_path || f.name)
          .filter(Boolean);

        out.push({
          key,
          patientId: p.patientId,
          date: ex.date,
          type_traitement: treatmentName,
          fichiers: fileNames,
        });
      });
    });
    return out;
  };

  const callPredict = async (examRequests) => {
    const payload = examRequests.map((r) => ({
      type_traitement: r.type_traitement,
      fichiers: r.fichiers,
    }));

    const res = await fetch(`${BASE_URL}/predict`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
      },
      body: JSON.stringify(payload),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = json?.detail || json?.error || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return json;
  };

const callUploadMemoire = async (pairs) => {
  // pairs = [{ type:"IRM"|"MRSI"|"MASK", name:"bin_test_data/..." }]

  //  envoyer dicts (plus compatible avec .get())
  const payload = pairs.map((p) => ({
    type: p.type,
    path: p.name,
  }));

  const res = await fetch(`${BASE_URL}/storage/upload_memoire`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify(payload),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.detail || json?.error || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return json;
};
  const stripLeadingDataset = (path) => {
    const p = normalizeRelPath(path);
    const candidates = [
      p,
      p.replace(/^bin_test_data\//i, ""),
      p.replace(/^[^/]+\//, ""), // remove first folder
    ];
    return [...new Set(candidates)];
  };

  const findFileInMap = (missingPath) => {
    const p = normalizeRelPath(missingPath);
    if (fileMap[p]) return { key: p, file: fileMap[p] };

    for (const cand of stripLeadingDataset(p)) {
      if (fileMap[cand]) return { key: cand, file: fileMap[cand] };
    }

    const base = p.split("/").pop();
    const keys = Object.keys(fileMap);

    const hitBase = keys.find((k) => k.split("/").pop() === base);
    if (hitBase) return { key: hitBase, file: fileMap[hitBase] };

    const hitSuffix = keys.find((k) => k.endsWith("/" + base) || k === base);
    if (hitSuffix) return { key: hitSuffix, file: fileMap[hitSuffix] };

    return null;
  };

  const normalizePredictItems = (resp) => (Array.isArray(resp) ? resp : [resp]);

  const isAllOk = (resp) => {
    const items = normalizePredictItems(resp);
    if (!items.length) return false;
    return items.every(
      (it) =>
        String(it?.Fichiers_memoire || it?.fichiers_memoire || "")
          .toLowerCase()
          .trim() === "ok",
    );
  };

  const collectAllMissing = (resp) => {
    const items = normalizePredictItems(resp);
    const all = [];
    for (const it of items) {
      const status = String(it?.Fichiers_memoire || it?.fichiers_memoire || "")
        .toLowerCase()
        .trim();
      const miss = it?.fichiers_manquants || it?.Fichiers_manquants || it?.missing_files;
      if (status.includes("manquants") && Array.isArray(miss)) {
        all.push(...miss);
      }
    }
    return [...new Set(all)];
  };

const buildMissingPairsFromPredict = (resp) => {
  const missing = collectAllMissing(resp);
  return {
    pairs: missing.map((missingPath) => ({
      type: classifyTypeFromPath(missingPath),
      name: normalizeRelPath(missingPath),
    })),
    missingCount: missing.length,
  };
};
  const handleQuantifySelected = async () => {
    setQuant({ loading: true, error: "", result: null, info: "" });
    try {
      if (!Object.keys(fileMap).length) {
        throw new Error(
          "Pour quantifier, il faut sélectionner un dossier dataset (sinon le front ne peut pas uploader les fichiers manquants).",
        );
      }

      const selectedRequests = buildSelectedExamRequests();
      if (!selectedRequests.length) throw new Error("Aucun examen sélectionné.");

      setQuant((q) => ({ ...q, info: "Appel /predict..." }));
      const r1 = await callPredict(selectedRequests);

      if (isAllOk(r1)) {
        setQuant({ loading: false, error: "", result: r1, info: "OK   " });
        return;
      }

      const missing = collectAllMissing(r1);
      if (missing.length > 0) {
        const { pairs, missingCount } = buildMissingPairsFromPredict(r1);

        setQuant((q) => ({
          ...q,
          info: `Fichiers manquants: ${missingCount}. Upload...`,
        }));

        await callUploadMemoire(pairs);

        setQuant((q) => ({ ...q, info: "Re-appel /predict..." }));
        const r2 = await callPredict(selectedRequests);

        setQuant({ loading: false, error: "", result: r2, info: "Terminé   " });
        return;
      }

      setQuant({
        loading: false,
        error: "Réponse /predict inattendue (ni OK ni manquants).",
        result: r1,
        info: "",
      });
    } catch (e) {
      setQuant({
        loading: false,
        error: e.message || String(e),
        result: null,
        info: "",
      });
    }
  };

  // ---------- selection counts ----------
  const selectedCount = selectedExamKeys.size;

  // ---------- render ----------
  return (
    <div className="card">
      <h2>👤 Patients</h2>

      {/*    Quantification bar */}
      <div
        style={{
          marginTop: "0.75rem",
          padding: 12,
          borderRadius: 12,
          border: "1px solid var(--border-color)",
          background: "rgba(255,255,255,0.02)",
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <strong>Quantification</strong>
          <span style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
            {selectedCount} examen(s) sélectionné(s)
          </span>

          <select
            className="form-select"
            value={treatmentName}
            onChange={(e) => setTreatmentName(e.target.value)}
            style={{
              padding: "0.4rem 0.6rem",
              borderRadius: 10,
              fontSize: 12,
              width: 220,
            }}
            disabled={quant.loading || loading}
          >
            <option value="predict1">predict1</option>
            <option value="predict2">predict2</option>
          </select>

          <button
            className="btn-primary"
            onClick={handleQuantifySelected}
            disabled={quant.loading || loading || selectedCount === 0}
          >
            {quant.loading ? "Quantification..." : "Quantifier"}
          </button>

          <button
            className="btn-secondary"
            onClick={clearSelection}
            disabled={quant.loading || loading || selectedCount === 0}
          >
            Clear sélection
          </button>
        </div>

        <div style={{ minWidth: 260, textAlign: "right" }}>
          {quant.info && (
            <div style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
              {quant.info}
            </div>
          )}
          {quant.error && (
            <div style={{ color: "var(--danger)", fontSize: "0.9rem" }}>
              {quant.error}
            </div>
          )}
          {quant.result && !quant.error && (
            <div style={{ color: "var(--success)", fontSize: "0.9rem" }}>
                 Résultat reçu
            </div>
          )}
        </div>
      </div>

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
              setSelectedExamKeys(new Set());
              setQuant({ loading: false, error: "", result: null, info: "" });
            }}
            disabled={loading || quant.loading}
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
              {p.analyses.map((ex, idx) => {
                const key = examKey(p.patientId, ex.date, idx);
                const checked = selectedExamKeys.has(key);

                return (
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
                        alignItems: "center",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          gap: 10,
                          alignItems: "center",
                          flexWrap: "wrap",
                        }}
                      >
                        <label
                          style={{
                            display: "flex",
                            gap: 8,
                            alignItems: "center",
                            cursor: "pointer",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleExam(key)}
                            disabled={loading || quant.loading}
                          />
                          <strong>Date: {ex.date}</strong>
                        </label>

                        <div
                          style={{
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
                        disabled={loading || quant.loading}
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
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Debug result */}
      {quant.result && (
        <div style={{ marginTop: 16 }}>
          <h3 style={{ marginBottom: 8 }}>📦 Résultat /predict</h3>
          <pre
            style={{
              padding: 12,
              borderRadius: 12,
              border: "1px solid var(--border-color)",
              background: "rgba(255,255,255,0.02)",
              overflowX: "auto",
              fontSize: "0.85rem",
            }}
          >
            {JSON.stringify(quant.result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}