import React, { useMemo, useState } from "react";
import { api } from "../api/client";

export default function PatientsExplorer() {
  // ===============================
  // State
  // ===============================
  const [raw, setRaw] = useState(""); // textarea JSON
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [result, setResult] = useState(null); // JSON retour backend
  const [query, setQuery] = useState("");
  const [fileQuery, setFileQuery] = useState("");
  const [selectedPatientId, setSelectedPatientId] = useState(null);
  const [selectedExamIdx, setSelectedExamIdx] = useState(0);
  const [showRawExam, setShowRawExam] = useState(false);

  // ===============================
  // Helpers robustes
  // ===============================
  const getPatientId = (p) => p?.patient_id ?? p?.patientId ?? p?.id ?? "";
  const getExams = (p) => p?.analyses ?? p?.exams ?? p?.examens ?? [];
  const getExamLabel = (ex, idx) =>
    ex?.date ??
    ex?.exam_date ??
    ex?.analysisDate ??
    ex?.examDate ??
    `Examen #${idx + 1}`;

  const getFilesByModality = (exam) => {
    if (!exam) return {};
    const fbm = exam.files_by_modality || exam.filesByModality;
    if (fbm && typeof fbm === "object") return fbm;

    // fallback: exam.files = [{name, relativePath, modality?}] ou liste de strings
    const files = exam.files || [];
    const out = {};
    (Array.isArray(files) ? files : [files]).forEach((f) => {
      const mod = (f?.modality || f?.type || "FILES").toString().toUpperCase();
      const item = f?.relativePath || f?.path || f?.name || String(f);
      out[mod] = out[mod] || [];
      out[mod].push(item);
    });
    return out;
  };

  const countAllFiles = (filesByModality) =>
    Object.values(filesByModality || {}).reduce(
      (acc, v) => acc + (Array.isArray(v) ? v.length : 1),
      0
    );

  // Stats patient (petit résumé “pro” dans la liste)
  const patientStats = (p) => {
    const exams = getExams(p);
    let files = 0;
    exams.forEach((ex) => {
      files += countAllFiles(getFilesByModality(ex));
    });
    return { exams: exams.length, files };
  };

  // ===============================
  // Derived data
  // ===============================
  const patients = useMemo(() => {
    const p = result?.patients ?? result;
    return Array.isArray(p) ? p : [];
  }, [result]);

  const filteredPatients = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter((p) =>
      String(getPatientId(p)).toLowerCase().includes(q)
    );
  }, [patients, query]);

  const selectedPatient = useMemo(() => {
    if (!selectedPatientId) return null;
    return (
      patients.find((p) => getPatientId(p) === selectedPatientId) || null
    );
  }, [patients, selectedPatientId]);

  const exams = useMemo(() => getExams(selectedPatient), [selectedPatient]);

  const selectedExam = useMemo(() => {
    if (!selectedPatient) return null;
    if (!exams.length) return null;
    const idx = Math.max(0, Math.min(selectedExamIdx ?? 0, exams.length - 1));
    return exams[idx] || null;
  }, [selectedPatient, exams, selectedExamIdx]);

  const filesByModality = useMemo(
    () => getFilesByModality(selectedExam),
    [selectedExam]
  );

  const totalFiles = useMemo(
    () => countAllFiles(filesByModality),
    [filesByModality]
  );

  const modalities = useMemo(
    () => Object.keys(filesByModality || {}),
    [filesByModality]
  );

  // ===============================
  // Actions
  // ===============================
  const tryParseJson = () => {
    setError("");
    if (!raw.trim()) throw new Error("Colle un JSON dataset dans la zone de texte.");
    try {
      return JSON.parse(raw);
    } catch {
      throw new Error("JSON invalide. Vérifie les virgules / guillemets / accolades.");
    }
  };

  const onSend = async () => {
    setError("");
    setShowRawExam(false);
    setSelectedPatientId(null);
    setSelectedExamIdx(0);

    let payload;
    try {
      payload = tryParseJson();
    } catch (e) {
      setError(e.message);
      return;
    }

    setLoading(true);
    try {
      const res = await api.uploadJsonDataset(payload);
      setResult(res);

      const p = res?.patients ?? res;
      if (Array.isArray(p) && p.length > 0) {
        setSelectedPatientId(getPatientId(p[0]));
        setSelectedExamIdx(0);
      }
    } catch (e) {
      setError(e.message || "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  };

  const onUploadFile = async (file) => {
    setError("");
    if (!file) return;
    try {
      const txt = await file.text();
      setRaw(txt);
    } catch {
      setError("Impossible de lire le fichier JSON.");
    }
  };

  // ===============================
  // UI small styles (inline)
  // ===============================
  const pillStyle = {
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid #e2e8f0",
    background: "#f8fafc",
    fontSize: 12,
    color: "var(--text-muted)",
    display: "inline-flex",
    gap: 8,
    alignItems: "center",
  };

  // ===============================
  // Render
  // ===============================
  return (
    <div className="card">
      <h2>👤 Patients / Dataset Tool</h2>
      <p style={{ color: "var(--text-muted)" }}>
        Importe un JSON dataset, envoie-le au backend (POST /upload-json-dataset/),
        puis explore la structure <strong>patient → examens → fichiers</strong>.
      </p>

      {/* Upload / textarea */}
      <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input
            type="file"
            accept="application/json,.json"
            onChange={(e) => onUploadFile(e.target.files?.[0])}
          />
          <button className="btn-primary" disabled={loading} onClick={onSend}>
            {loading ? "Traitement..." : "Envoyer au backend"}
          </button>
          {error && <span style={{ color: "crimson" }}>❌ {error}</span>}
        </div>

        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder='Colle ici ton JSON dataset'
          style={{
            width: "100%",
            minHeight: 160,
            fontFamily: "monospace",
            fontSize: 12,
            padding: 12,
            borderRadius: 10,
            border: "1px solid #e2e8f0",
          }}
        />
      </div>

      {/* Résultats */}
      {patients.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 2fr",
            gap: 16,
            marginTop: 16,
          }}
        >
          {/* Col gauche : liste patients */}
          <div
            style={{
              border: "1px solid #e2e8f0",
              borderRadius: 12,
              padding: 12,
              background: "white",
            }}
          >
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
              <strong>Patients</strong>
              <span style={{ color: "var(--text-muted)" }}>({filteredPatients.length})</span>
            </div>

            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher patient id..."
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid #e2e8f0",
                marginBottom: 10,
              }}
            />

            <div style={{ maxHeight: 380, overflow: "auto", display: "grid", gap: 8 }}>
              {filteredPatients.map((p, idx) => {
                const pid = getPatientId(p) || `patient_${idx + 1}`;
                const active = pid === selectedPatientId;
                const stats = patientStats(p);

                return (
                  <div
                    key={pid}
                    onClick={() => {
                      setSelectedPatientId(pid);
                      setSelectedExamIdx(0);
                      setFileQuery("");
                      setShowRawExam(false);
                    }}
                    style={{
                      cursor: "pointer",
                      padding: "10px 10px",
                      borderRadius: 12,
                      border: active ? "1px solid #94a3b8" : "1px solid #e2e8f0",
                      background: active ? "#f8fafc" : "white",
                      display: "grid",
                      gap: 4,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <strong style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{pid}</strong>
                      <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
                        {stats.exams} ex.
                      </span>
                    </div>
                    <div style={{ color: "var(--text-muted)", fontSize: 12 }}>
                      {stats.files} fichiers
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Col droite : détails */}
          <div
            style={{
              border: "1px solid #e2e8f0",
              borderRadius: 12,
              padding: 12,
              background: "white",
            }}
          >
            {!selectedPatient ? (
              <p style={{ color: "var(--text-muted)" }}>
                Sélectionne un patient pour voir ses examens.
              </p>
            ) : exams.length === 0 ? (
              <p style={{ color: "var(--text-muted)" }}>
                Aucun examen détecté pour ce patient.
              </p>
            ) : (
              <>
                {/* Header patient + choix examen */}
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <h3 style={{ margin: 0 }}>Patient: {getPatientId(selectedPatient)}</h3>
                    <p style={{ margin: "6px 0 0", color: "var(--text-muted)" }}>
                      Examens: {exams.length}
                    </p>
                  </div>

                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ color: "var(--text-muted)" }}>Examen:</span>
                    <select
                      value={selectedExamIdx ?? 0}
                      onChange={(e) => {
                        setSelectedExamIdx(parseInt(e.target.value, 10));
                        setFileQuery("");
                        setShowRawExam(false);
                      }}
                      className="form-select"
                    >
                      {exams.map((ex, idx) => (
                        <option key={idx} value={idx}>
                          {getExamLabel(ex, idx)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Résumé */}
                <div style={{ marginTop: 12 }}>
                  <strong>Résumé</strong>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
                    <div style={pillStyle}>📅 {getExamLabel(selectedExam, selectedExamIdx ?? 0)}</div>
                    <div style={pillStyle}>🧾 {totalFiles} fichiers</div>
                    <div style={pillStyle}>🧠 {modalities.length} modalités</div>
                  </div>
                </div>

                {/* Fichiers */}
                <div style={{ marginTop: 14 }}>
                  <strong>Fichiers</strong>

                  <input
                    value={fileQuery}
                    onChange={(e) => setFileQuery(e.target.value)}
                    placeholder="Filtrer par nom / path..."
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: "1px solid #e2e8f0",
                      marginTop: 8,
                      marginBottom: 10,
                    }}
                  />

                  <div style={{ display: "grid", gap: 10 }}>
                    {Object.entries(filesByModality).map(([mod, files]) => {
                      const list = (Array.isArray(files) ? files : [files]).map(String);
                      const q = fileQuery.trim().toLowerCase();
                      const filtered = q ? list.filter((s) => s.toLowerCase().includes(q)) : list;

                      if (filtered.length === 0) return null;

                      return (
                        <div
                          key={mod}
                          style={{
                            border: "1px solid #e2e8f0",
                            borderRadius: 12,
                            padding: 10,
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                            <strong>{mod}</strong>
                            <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
                              {filtered.length} fichier(s)
                            </span>
                          </div>

                          <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                            {filtered.map((s, i) => (
                              <div
                                key={i}
                                style={{
                                  padding: "6px 8px",
                                  borderRadius: 10,
                                  background: "#f8fafc",
                                  border: "1px solid #e2e8f0",
                                  fontFamily: "monospace",
                                  fontSize: 12,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                }}
                                title={s}
                              >
                                {s}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}

                    {modalities.length === 0 && (
                      <p style={{ color: "var(--text-muted)", margin: 0 }}>
                        Aucune modalité / fichier détecté pour cet examen.
                      </p>
                    )}
                  </div>
                </div>

                {/* JSON brut (optionnel) */}
                <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button className="btn-primary" onClick={() => setShowRawExam((v) => !v)}>
                    {showRawExam ? "Masquer JSON brut" : "Afficher JSON brut"}
                  </button>
                </div>

                {showRawExam && (
                  <pre
                    style={{
                      marginTop: 10,
                      background: "#fafafa",
                      padding: 10,
                      borderRadius: 12,
                      border: "1px solid #e2e8f0",
                      overflow: "auto",
                      fontSize: 12,
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {JSON.stringify(selectedExam, null, 2)}
                  </pre>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {result && patients.length === 0 && (
        <div style={{ marginTop: 12, color: "crimson" }}>
          Le backend a répondu, mais je ne reconnais pas la structure `patients`.
          Voici la réponse brute :
          <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}