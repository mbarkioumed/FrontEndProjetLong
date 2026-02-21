// src/App.js
import React, { useState, useEffect, useMemo } from "react";
import { useContext } from "react";
import "./App.css";
import AuthContext from "./context/AuthContext";
import Login from "./components/Login";
import PatientsExplorer from "./components/PatientsExplorer";
import IrmCard from "./components/IrmCard";

import { storeData } from "./utils/dataCache";

const worker = new Worker(new URL("./dataProcessor.worker.js", import.meta.url));

const workerService = {
  requestId: 0,
  callbacks: new Map(),

  postMessage: (message) => {
    const id = ++workerService.requestId;
    return new Promise((resolve, reject) => {
      workerService.callbacks.set(id, { resolve, reject });
      worker.postMessage({ ...message, id });
    });
  },
};

worker.onmessage = (e) => {
  const { id, success, data, error } = e.data;
  const callback = workerService.callbacks.get(id);

  if (!callback) return;

  if (success) {
    // Intercept and cache large data BEFORE it hits React
    if (data) {
      const processNode = (node) => {
        if (!node) return;

        // If worker returned heavy bytes, cache them and remove them
        if (node.data_uint8) {
          node.dataRef = storeData(node.data_uint8);
          node.data_uint8 = null;
          delete node.data_uint8;
        }

        // Defensive: recurse through object values (nested results)
        if (typeof node === "object" && node !== null) {
          Object.values(node).forEach((child) => {
            if (typeof child === "object" && child !== null) {
              if (child.data_uint8) processNode(child);
            }
          });
        }
      };
      processNode(data);
    }
    callback.resolve(data);
  } else {
    callback.reject(new Error(error));
  }

  workerService.callbacks.delete(id);
};

const API_URL = "http://127.0.0.1:8000";

function App() {
  const { user, token, logout, loading: authLoading } = useContext(AuthContext);

  const [view, setView] = useState("home");
  const [backendStatus, setBackendStatus] = useState(false);

  // Global UI (upload, general messages)
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // { [cardId]: { loading: boolean, error: string|null } }
  const [cardJobs, setCardJobs] = useState({});

  // (Legacy global results kept to avoid breaking other parts)
  const [irmResults, setIrmResults] = useState(null);
  const [reference3DData, setReference3DData] = useState(null);
  const [mrsiResults, setMrsiResults] = useState(null);

  const [isTraitementOpen, setIsTraitementOpen] = useState(false);
  const [isParamOpen, setIsParamOpen] = useState(true);

  const [irmCards, setIrmCards] = useState([
    {
      id: Date.now(),
      irmData: null,
      mrsiData: null,
      maskData: null,
      irmHistory: [],
      mrsiHistory: [],
    },
  ]);

  const [activeCardId, setActiveCardId] = useState(null);

  useEffect(() => {
    if (!activeCardId && irmCards.length > 0) {
      setActiveCardId(irmCards[0].id);
      return;
    }
    if (activeCardId && !irmCards.some((c) => c.id === activeCardId)) {
      setActiveCardId(irmCards[0]?.id ?? null);
    }
  }, [irmCards, activeCardId]);

  const activeCard = useMemo(() => {
    return irmCards.find((c) => c.id === activeCardId) || irmCards[0] || null;
  }, [irmCards, activeCardId]);

  // Per-card helpers
  const setCardLoading = (cardId, value) => {
    setCardJobs((prev) => ({
      ...prev,
      [cardId]: { ...(prev[cardId] || {}), loading: value },
    }));
  };

  useEffect(() => {
    if (user) {
      setView("home");
    }
  }, [user]);

  const setCardError = (cardId, msg) => {
    setCardJobs((prev) => ({
      ...prev,
      [cardId]: { ...(prev[cardId] || {}), error: msg },
    }));
  };

  const [examModalOpen, setExamModalOpen] = useState(false);
  const [examModalCardIds, setExamModalCardIds] = useState([]);

  // ===============================
  // Version history helpers
  // ===============================
  const ensureHistoryInit = (card) => ({
    ...card,
    irmHistory:
      card.irmHistory ||
      (card.irmData
        ? [
            {
              id: "base",
              label: "Original",
              data: { ...card.irmData, __versionId: "base" },
              createdAt: Date.now(),
            },
          ]
        : []),
    mrsiHistory:
      card.mrsiHistory ||
      (card.mrsiData
        ? [
            {
              id: "base",
              label: "Original",
              data: { ...card.mrsiData, __versionId: "base" },
              createdAt: Date.now(),
            },
          ]
        : []),
  });

  const pushVersionToCard = (
    cardId,
    type,
    versionLabel,
    nextData,
    params = {},
  ) => {
    const versionId = `t_${Date.now()}_${Math.random().toString(16).slice(2)}`;

    setIrmCards((prev) =>
      prev.map((c) => {
        if (c.id !== cardId) return c;

        const current = type === "IRM" ? c.irmData : c.mrsiData;
        const backendKey = current?.__backendKey;

        const tagged = {
          ...nextData,
          __versionId: versionId,
          __backendKey: backendKey,
          _version_params: params,
        };

        if (type === "IRM") {
          const irmHistory = [
            ...(c.irmHistory || []),
            {
              id: versionId,
              params,
              label: versionLabel,
              data: tagged,
              createdAt: Date.now(),
            },
          ];
          return { ...c, irmHistory, irmData: tagged };
        }

        const mrsiHistory = [
          ...(c.mrsiHistory || []),
          {
            id: versionId,
            params,
            label: versionLabel,
            data: tagged,
            createdAt: Date.now(),
          },
        ];
        return { ...c, mrsiHistory, mrsiData: tagged };
      }),
    );
  };

  const selectIrmVersion = (cardId, versionId) => {
    setIrmCards((prev) =>
      prev.map((c) => {
        if (c.id !== cardId) return c;
        const card = ensureHistoryInit(c);
        const found = (card.irmHistory || []).find((v) => v.id === versionId);
        if (!found) return card;
        const tagged = { ...found.data, __versionId: found.id };
        return { ...card, irmData: tagged };
      }),
    );
  };

  const selectMrsiVersion = (cardId, versionId) => {
    setIrmCards((prev) =>
      prev.map((c) => {
        if (c.id !== cardId) return c;
        const card = ensureHistoryInit(c);
        const found = (card.mrsiHistory || []).find((v) => v.id === versionId);
        if (!found) return card;
        const tagged = { ...found.data, __versionId: found.id };
        return { ...card, mrsiData: tagged };
      }),
    );
  };

  // ===============================
  // Theme / Layout
  // ===============================
  const [theme, setTheme] = useState(
    () => localStorage.getItem("theme") || "light",
  );
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(
    () => localStorage.getItem("sidebarCollapsed") === "true",
  );

  //     Right sidebar: now "contextual"
  const [isRightSidebarCollapsed, setIsRightSidebarCollapsed] = useState(
    () => localStorage.getItem("rightSidebarCollapsed") === "true",
  );

  //     Auto-hide (collapse) right sidebar on Patients by default (but still toggleable)
  useEffect(() => {
    if (view === "patients") {
      setIsRightSidebarCollapsed(true);
    }
  }, [view]);

  useEffect(() => {
    localStorage.setItem("sidebarCollapsed", isSidebarCollapsed);
  }, [isSidebarCollapsed]);

  useEffect(() => {
    localStorage.setItem("rightSidebarCollapsed", isRightSidebarCollapsed);
  }, [isRightSidebarCollapsed]);

  // ===============================
  // Post-traitement catalogue
  // ===============================
  const [catalog, setCatalog] = useState({});
  const [selectedTraitement, setSelectedTraitement] = useState("");
  const [traitementParams, setTraitementParams] = useState({});

  useEffect(() => {
    const fetchCatalog = async () => {
      try {
        const response = await fetch(`${API_URL}/traitements/catalog`);
        const data = await response.json();
        setCatalog(data);

        const firstKey = Object.keys(data)[0] || "";
        setSelectedTraitement(firstKey);

        const defaults = {};
        Object.entries(data[firstKey]?.params || {}).forEach(
          ([k, v]) => (defaults[k] = v.default),
        );
        const allowedTypes = data[firstKey]?.type || [];
        defaults.dataType = allowedTypes[0] || null;

        setTraitementParams(defaults);
      } catch (err) {
        console.error("Impossible de charger le catalogue :", err);
      }
    };
    fetchCatalog();
  }, []);

  useEffect(() => {
    if (!selectedTraitement) return;
    const allowedTypes = catalog[selectedTraitement]?.type || [];
    const defaults = {};
    Object.entries(catalog[selectedTraitement]?.params || {}).forEach(
      ([k, v]) => (defaults[k] = v.default),
    );
    defaults.dataType = allowedTypes[0] || null;
    setTraitementParams((prev) => ({ ...prev, ...defaults }));
  }, [selectedTraitement, catalog]);

  // ===============================
  // Status / Theme
  // ===============================
  useEffect(() => {
    if (user) {
      checkStatus();
      const interval = setInterval(checkStatus, 10000);
      return () => clearInterval(interval);
    }
  }, [user]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  const checkStatus = async () => {
    try {
      const res = await fetch(`${API_URL}/`);
      setBackendStatus(!!res.ok);
    } catch {
      setBackendStatus(false);
    }
  };

  // ===============================
  // Upload (IRM / MRSI)
  // ===============================
  const handleUpload = async (e, type, cardId = null) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const file = formData.get("fichier");

    if (!file || file.size === 0) {
      setError("Veuillez sélectionner un fichier.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const endpoint = type === "IRM" ? "/upload-irm/" : "/upload-mrsi/";

      const response = await fetch(`${API_URL}${endpoint}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!response.ok) throw new Error(`Erreur ${response.status}`);

      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);

      const data = await workerService.postMessage({
        url: blobUrl,
        options: {},
        type: "process",
      });

      URL.revokeObjectURL(blobUrl);

      // Worker returns { type: "IRM" | "MRSI", ... }
      if (data?.type === "IRM") {
        const tagged = {
          ...data,
          __versionId: "base",
          __backendKey: data.nom_fichier,
        };

        setIrmResults(tagged);
        setReference3DData(tagged);

        setIrmCards((prev) =>
          prev.map((c) => {
            // target card: either provided or first empty IRM
            const targetId = cardId || prev.find((x) => !x.irmData)?.id || null;
            if (c.id !== targetId) return c;

            const card = ensureHistoryInit(c);
            return {
              ...card,
              irmData: tagged,
              irmHistory: [
                {
                  id: "base",
                  label: "Original",
                  data: tagged,
                  createdAt: Date.now(),
                },
              ],
            };
          }),
        );

        // if no empty card existed and cardId not provided => append new card
        setIrmCards((prev) => {
          const hasTarget = cardId
            ? prev.some((c) => c.id === cardId)
            : prev.some((c) => !c.irmData);
          if (hasTarget) return prev;

          const newId = Date.now();
          const newCard = {
            id: newId,
            irmData: tagged,
            mrsiData: null,
            irmHistory: [
              {
                id: "base",
                label: "Original",
                data: tagged,
                createdAt: Date.now(),
              },
            ],
            mrsiHistory: [],
          };
          return [...prev, newCard];
        });

        // active card
        if (cardId) setActiveCardId(cardId);
        else {
          const firstEmpty = irmCards.find((c) => !c.irmData);
          setActiveCardId(firstEmpty?.id ?? null);
        }

        setView("irm");
        return;
      }

      if (data?.type === "MRSI") {
        const tagged = { ...data, __versionId: "base", __backendKey: data.nom };

        setMrsiResults(tagged);

        setIrmCards((prev) =>
          prev.map((c) => {
            const targetId =
              cardId || prev.find((x) => !x.mrsiData)?.id || null;
            if (c.id !== targetId) return c;

            const card = ensureHistoryInit(c);
            return {
              ...card,
              mrsiData: tagged,
              mrsiHistory: [
                {
                  id: "base",
                  label: "Original",
                  data: tagged,
                  createdAt: Date.now(),
                },
              ],
            };
          }),
        );

        setIrmCards((prev) => {
          const hasTarget = cardId
            ? prev.some((c) => c.id === cardId)
            : prev.some((c) => !c.mrsiData);
          if (hasTarget) return prev;

          const newId = Date.now();
          const newCard = {
            id: newId,
            irmData: null,
            mrsiData: tagged,
            irmHistory: [],
            mrsiHistory: [
              {
                id: "base",
                label: "Original",
                data: tagged,
                createdAt: Date.now(),
              },
            ],
          };
          return [...prev, newCard];
        });

        if (cardId) setActiveCardId(cardId);
        else {
          const firstEmpty = irmCards.find((c) => !c.mrsiData);
          setActiveCardId(firstEmpty?.id ?? null);
        }

        setView("irm");
        return;
      }

      throw new Error("Type de donnée inconnu (worker).");
    } catch (err) {
      setError(`Erreur lors de l'envoi : ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // ===============================
  // Patients -> Open Exam
  // ===============================
  const openExamFromPatients = async ({ irmFiles, mrsiFile, maskFile }) => {
    setLoading(true);
    setError("");

    try {
      const irmFile = irmFiles && irmFiles.length ? irmFiles[0] : null;

      // Create a fresh card that becomes active
      const baseCardId = Date.now();

      setIrmCards((prev) => [
        ...prev,
        {
          id: baseCardId,
          irmData: null,
          mrsiData: null,
          maskData: null,
          irmHistory: [],
          mrsiHistory: [],
        },
      ]);
      setActiveCardId(baseCardId);
      setExamModalCardIds([baseCardId]);
      setExamModalOpen(true);

      // -----------------
      // IRM
      // -----------------
      if (irmFile) {
        const formData = new FormData();
        formData.append("fichier", irmFile);

        const response = await fetch(`${API_URL}/upload-irm/`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
        if (!response.ok) throw new Error("Erreur upload IRM");

        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);

        const irmData = await workerService.postMessage({
          url: blobUrl,
          options: {},
          type: "process",
        });

        URL.revokeObjectURL(blobUrl);

        const tagged = {
          ...irmData,
          __versionId: "base",
          __backendKey: irmData?.nom_fichier, // pour post-traitements
        };

        setIrmResults(tagged);
        setReference3DData(tagged);

        setIrmCards((prev) =>
          prev.map((c) =>
            c.id === baseCardId
              ? {
                  ...c,
                  irmData: tagged,
                  irmHistory: [
                    {
                      id: "base",
                      label: "Original",
                      data: tagged,
                      createdAt: Date.now(),
                    },
                  ],
                }
              : c,
          ),
        );
      }

      // -----------------
      // MRSI
      // -----------------
      if (mrsiFile) {
        const formData = new FormData();
        formData.append("fichier", mrsiFile);

        const response = await fetch(`${API_URL}/upload-mrsi/`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
        if (!response.ok) throw new Error("Erreur upload MRSI");

        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);

        const mrsiData = await workerService.postMessage({
          url: blobUrl,
          options: {},
          type: "process",
        });

        URL.revokeObjectURL(blobUrl);

        const tagged = {
          ...mrsiData,
          __versionId: "base",
          __backendKey: mrsiData?.nom, //  pour post-traitements
        };

        setMrsiResults(tagged);

        setIrmCards((prev) =>
          prev.map((c) =>
            c.id === baseCardId
              ? {
                  ...c,
                  mrsiData: tagged,
                  mrsiHistory: [
                    {
                      id: "base",
                      label: "Original",
                      data: tagged,
                      createdAt: Date.now(),
                    },
                  ],
                }
              : c,
          ),
        );
      }

      // -----------------
      // MASK (temp: via upload-irm)
      // -----------------
      if (maskFile) {
        const formData = new FormData();
        formData.append("fichier", maskFile);

        // ⚠️ TEMPORAIRE : on passe par upload-irm pour récupérer un volume exploitable côté front.
        // Idéal : endpoint /upload-mask/ côté backend pour préserver les labels.
        const response = await fetch(`${API_URL}/upload-irm/`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
        if (!response.ok) throw new Error("Erreur upload MASK");

        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);

        const maskData = await workerService.postMessage({
          url: blobUrl,
          options: {},
          type: "process",
        });

        URL.revokeObjectURL(blobUrl);

        const taggedMask = {
          ...maskData,
          __versionId: "base",
          __isMask: true,
          __backendKey: maskData?.nom_fichier,
        };

        setIrmCards((prev) =>
          prev.map((c) =>
            c.id === baseCardId
              ? {
                  ...c,
                  maskData: taggedMask,
                }
              : c,
          ),
        );
      }

      setView("patients"); // on reste sur Patients
      setExamModalOpen(true);
    } catch (e) {
      setError(`Ouverture examen impossible : ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  // ===============================
  // Spectrum (returns data; IrmCard stores it locally)
  // ===============================
  const fetchSpectrum = async (name, x, y, z) => {
    if (x == null || y == null || z == null) return null;
    try {
      const res = await fetch(`${API_URL}/spectrum/${name}/${x}/${y}/${z}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Erreur affichage spectre");
      return await res.json();
    } catch (err) {
      console.error(err);
      setError("Impossible de charger le spectre.");
      return null;
    }
  };

  // ===============================
  // Post-Traitement per card (parallel-safe + versions)
  // ===============================
  const runTraitement = async (
    dataInstance,
    cardId,
    typeTraitement = selectedTraitement,
    params = {},
  ) => {
    if (!dataInstance?.nom_fichier && !dataInstance?.nom) return;

    setCardLoading(cardId, true);
    setCardError(cardId, null);

    try {
      const key =
        dataInstance.__backendKey || dataInstance.nom_fichier || dataInstance.nom;

      // Keep only params defined by selected traitement
      const paramDefs = catalog[typeTraitement]?.params || {};
      const validParams = {};
      Object.keys(paramDefs).forEach((k) => {
        if (params[k] !== undefined) validParams[k] = params[k];
      });

      // PATCH: backend expects "metabolites" (not "meta")
      if ("meta" in validParams) {
        validParams.metabolites = validParams.meta;
        delete validParams.meta;
      }

      const bodyPayload = {
        [key]: { type_traitement: typeTraitement, params: validParams },
      };

      const response = await fetch(`${API_URL}/traitements`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(bodyPayload),
      });

      if (!response.ok) throw new Error(`Erreur ${response.status}`);

      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);

      const data = await workerService.postMessage({
        url: blobUrl,
        options: {},
        type: "process",
      });

      URL.revokeObjectURL(blobUrl);

      const next = data?.[key];
      if (!next) throw new Error("Réponse traitement inattendue.");
      if (next?.error) throw new Error(next.error);

      const label = catalog[typeTraitement]?.label || typeTraitement;

      if (next.type === "IRM") {
        setIrmResults(next);
        pushVersionToCard(cardId, "IRM", label, next, validParams);
      } else if (next.type === "MRSI") {
        setMrsiResults(next);
        pushVersionToCard(cardId, "MRSI", label, next, validParams);
      } else {
        throw new Error("Type traitement inconnu.");
      }

      setView("irm");
    } catch (err) {
      setCardError(cardId, `Erreur Post-Traitement : ${err.message}`);
    } finally {
      setCardLoading(cardId, false);
    }
  };

  const runTraitementOnAllCards = async () => {
    const dt = traitementParams.dataType;

    const tasks = irmCards.map(async (card) => {
      const instance =
        dt === "IRM" ? card.irmData : dt === "MRSI" ? card.mrsiData : null;
      if (!instance) return;
      return runTraitement(instance, card.id, selectedTraitement, traitementParams);
    });

    await Promise.allSettled(tasks);
  };

  // ===============================
  // UI Pieces
  // ===============================
  const renderHome = () => (
    <div className="card">
      <h2>Bienvenue sur Plateforme Cancer</h2>
      <p>
        Cette application permet de visualiser et d'analyser des données médicales IRM et
        MRSI.
      </p>
      <div className="info-grid" style={{ marginTop: "2rem" }}>
        <div className="info-card">
          <h3>🧠 IRM</h3>
          <p>Visualisation de coupes sagittales, coronales et axiales.</p>
        </div>
        <div className="info-card">
          <h3>📊 MRSI</h3>
          <p>Analyse spectrographique et cartes de voxels.</p>
        </div>
      </div>
    </div>
  );

  const renderUploadForm = (type, cardId = null) => (
    <div className="card">
      <h2>Upload {type}</h2>
      <form onSubmit={(e) => handleUpload(e, type, cardId)}>
        <div className="form-group">
          <label>Fichier NIfTI (.nii, .nii.gz)</label>
          <input type="file" name="fichier" accept=".nii,.gz" required />
        </div>
        <button type="submit" className="btn-primary" disabled={loading || !backendStatus}>
          {loading ? "Traitement..." : `Analyser ${type}`}
        </button>
        {!backendStatus && (
          <p className="status-error" style={{ fontSize: "0.8rem", marginTop: "0.5rem" }}>
            Backend hors ligne
          </p>
        )}
      </form>
    </div>
  );

  if (authLoading) return <div className="loading-screen">Chargement...</div>;
  if (!user) return <Login />;

  const activeJob = activeCardId ? cardJobs[activeCardId] : null;

  const canRunActive =
    !!activeCard &&
    ((traitementParams.dataType === "IRM" && !!activeCard?.irmData?.nom_fichier) ||
      (traitementParams.dataType === "MRSI" && !!activeCard?.mrsiData?.nom)) &&
    !activeJob?.loading;

  const canRunAll =
    irmCards.some((c) =>
      traitementParams.dataType === "IRM" ? !!c.irmData?.nom_fichier : !!c.mrsiData?.nom,
    ) && !loading;

  //     Contextual right sidebar header/title
  const rightSidebarTitle =
    view === "irm" ? "Post-Traitement" : view === "patients" ? "Patients • Aide" : "Outils";
  const rightSidebarEmoji = view === "irm" ? "⚙️" : view === "patients" ? "🧩" : "🧰";

  return (
    <div className="App">
      {/* LEFT SIDEBAR */}
      <div className={`sidebar ${isSidebarCollapsed ? "collapsed" : ""}`}>
        <div className="sidebar-header">
          <span className="emoji">🏥</span>
          <h1>Cancer Platform</h1>
        </div>

        <button
          className="sidebar-toggle"
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          title={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          {isSidebarCollapsed ? "→" : "←"}
        </button>

        <nav className="nav-links">
          <div
            className={`nav-item ${view === "home" ? "active" : ""}`}
            onClick={() => setView("home")}
          >
            <span className="icon">🏠</span>
            <span className="label">Accueil</span>
          </div>

          <div
            className={`nav-item ${view === "irm" ? "active" : ""}`}
            onClick={() => setView("irm")}
          >
            <span className="icon">🧠</span>
            <span className="label">Upload IRM</span>
          </div>

          <div
            className={`nav-item ${view === "patients" ? "active" : ""}`}
            onClick={() => setView("patients")}
          >
            <span className="icon">👤</span>
            <span className="label">Patients</span>
          </div>
        </nav>

        <div className="sidebar-footer">
          <button className="btn-logout" onClick={logout}>
            {isSidebarCollapsed ? "🚪" : "Déconnexion"}
          </button>
        </div>
      </div>

      {/* MAIN */}
      <div
        className={`main-area ${isSidebarCollapsed ? "sidebar-collapsed" : ""} ${
          isRightSidebarCollapsed ? "right-sidebar-collapsed" : ""
        }`}
      >
        <div className="top-bar">
          <div className="status-indicator">
            <div className={`dot ${backendStatus ? "connected" : "disconnected"}`}></div>
            <span>Backend {backendStatus ? "Connecté" : "Déconnecté"}</span>
          </div>
          <div className="user-info" style={{ display: "flex", gap: 12 }}>
            <button
              className="theme-toggle"
              onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
            >
              {theme === "dark" ? "☀️ Light" : "🌙 Dark"}
            </button>
            <span style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
              {user.username}
            </span>
          </div>
        </div>

        {error && (
          <div
            className="card"
            style={{
              borderLeft: "4px solid var(--danger)",
              color: "var(--danger)",
            }}
          >
            {error}
          </div>
        )}

        {view === "home" && renderHome()}

        {view === "irm" && (
          <div
            className="irm-comparison-container"
            style={{ display: "flex", flexDirection: "column", gap: "2rem" }}
          >
            {irmCards.map((card) => (
              <IrmCard
                key={card.id}
                cardId={card.id}
                irmData={card.irmData}
                mrsiData={card.mrsiData}
                irmHistory={card.irmHistory || []}
                mrsiHistory={card.mrsiHistory || []}
                maskData={card.maskData}
                onSelectIrmVersion={(versionId) => selectIrmVersion(card.id, versionId)}
                onSelectMrsiVersion={(versionId) => selectMrsiVersion(card.id, versionId)}
                onDeleteVersion={(type, versionId) => {
                  setIrmCards((prev) =>
                    prev.map((c) => {
                      if (c.id !== card.id) return c;

                      if (type === "IRM") {
                        const nextHistory = (c.irmHistory || []).filter((v) => v.id !== versionId);
                        const nextData =
                          c.irmData?.__versionId === versionId
                            ? nextHistory.length
                              ? nextHistory[nextHistory.length - 1].data
                              : null
                            : c.irmData;
                        return { ...c, irmHistory: nextHistory, irmData: nextData };
                      }

                      if (type === "MRSI") {
                        const nextHistory = (c.mrsiHistory || []).filter((v) => v.id !== versionId);
                        const nextData =
                          c.mrsiData?.__versionId === versionId
                            ? nextHistory.length
                              ? nextHistory[nextHistory.length - 1].data
                              : null
                            : c.mrsiData;
                        return { ...c, mrsiHistory: nextHistory, mrsiData: nextData };
                      }

                      return c;
                    }),
                  );
                }}
                isActive={card.id === activeCardId}
                onSelect={() => setActiveCardId(card.id)}
                job={cardJobs[card.id] || { loading: false, error: null }}
                onDuplicate={() => {
                  const newId = Date.now();
                  setIrmCards((prev) => {
                    const index = prev.findIndex((c) => c.id === card.id);
                    const newCard = {
                      id: newId,
                      irmData: card.irmData ? { ...card.irmData } : null,
                      mrsiData: card.mrsiData ? { ...card.mrsiData } : null,
                      maskData: card.maskData ? { ...card.maskData } : null,
                      irmHistory: (card.irmHistory || []).map((v) => ({ ...v, data: { ...v.data } })),
                      mrsiHistory: (card.mrsiHistory || []).map((v) => ({
                        ...v,
                        data: { ...v.data },
                      })),
                    };
                    const copy = [...prev];
                    copy.splice(index + 1, 0, newCard);
                    return copy;
                  });
                  setActiveCardId(newId);
                }}
                onDelete={(id) => {
                  setIrmCards((prev) => {
                    const next = prev.filter((c) => c.id !== id);
                    if (next.length === 0) {
                      const newId = Date.now();
                      setActiveCardId(newId);
                      return [
                        {
                          id: newId,
                          irmData: null,
                          mrsiData: null,
                          maskData: null,
                          irmHistory: [],
                          mrsiHistory: [],
                        },
                      ];
                    }
                    if (id === activeCardId) setActiveCardId(next[0].id);
                    return next;
                  });

                  // clean job state for deleted card
                  setCardJobs((prev) => {
                    const copy = { ...prev };
                    delete copy[id];
                    return copy;
                  });
                }}
                renderUploadForm={renderUploadForm}
                onFetchSpectrum={fetchSpectrum}
              />
            ))}

            <button
              className="btn-primary"
              style={{
                alignSelf: "center",
                padding: "1rem 2rem",
                fontSize: "1.1rem",
              }}
              onClick={() => {
                const newId = Date.now();
                setIrmCards((prev) => [
                  ...prev,
                  {
                    id: newId,
                    irmData: null,
                    mrsiData: null,
                    maskData: null,
                    irmHistory: [],
                    mrsiHistory: [],
                  },
                ]);
                setActiveCardId(newId);
              }}
            >
              + Ajouter une nouvelle carte de comparaison
            </button>
          </div>
        )}

        {view === "patients" && <PatientsExplorer onOpenExam={openExamFromPatients} />}

        {examModalOpen && (
          <div className="modal-overlay" onClick={() => setExamModalOpen(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              {/* Header du modal */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 10,
                }}
              >
                <strong>Vue Examen</strong>
                <button
                  className="btn-secondary"
                  onClick={() => setExamModalOpen(false)}
                  style={{ color: "var(--danger)" }}
                  aria-label="Fermer"
                >
                  ✕
                </button>
              </div>

              {/* Contenu : tes IrmCards */}
              {irmCards
                .filter((c) => examModalCardIds.includes(c.id))
                .map((card) => (
                  <IrmCard
                    key={card.id}
                    cardId={card.id}
                    irmData={card.irmData}
                    mrsiData={card.mrsiData}
                    maskData={card.maskData}
                    irmHistory={card.irmHistory || []}
                    mrsiHistory={card.mrsiHistory || []}
                    onSelectIrmVersion={(versionId) => selectIrmVersion(card.id, versionId)}
                    onSelectMrsiVersion={(versionId) => selectMrsiVersion(card.id, versionId)}
                    onFetchSpectrum={fetchSpectrum}
                    renderUploadForm={renderUploadForm}
                    job={cardJobs[card.id] || { loading: false, error: null }}
                    isActive={card.id === activeCardId}
                    onSelect={() => setActiveCardId(card.id)}
                    onDuplicate={() => {}}
                    onDelete={() => {}}
                    onDeleteVersion={() => {}}
                  />
                ))}
            </div>
          </div>
        )}
      </div>

      {/* RIGHT SIDEBAR (contextual) */}
      <div className={`sidebar right-sidebar ${isRightSidebarCollapsed ? "collapsed" : ""}`}>
        <div className="sidebar-header">
          <span className="emoji">{rightSidebarEmoji}</span>
          <h1>{rightSidebarTitle}</h1>
        </div>

        <button
          className="sidebar-toggle right"
          onClick={() => setIsRightSidebarCollapsed(!isRightSidebarCollapsed)}
          title={isRightSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          {isRightSidebarCollapsed ? "←" : "→"}
        </button>

        {/*     IRM view: keep Post-Traitement UI */}
        {view === "irm" && (
          <div className="nav-links">
            {/* Traitement choice */}
            <div className="nav-dropdown">
              <div className="nav-item" onClick={() => setIsTraitementOpen(!isTraitementOpen)}>
                <span className={`arrow ${isTraitementOpen ? "" : "close"}`}>▼</span>
                <span className="label">
                  {catalog[selectedTraitement]?.label || "Catalogue non trouvé"}
                </span>
              </div>

              {isTraitementOpen && (
                <div className="dropdown-menu">
                  {Object.entries(catalog).map(([key, val]) => (
                    <div
                      key={key}
                      className="dropdown-option"
                      onClick={() => {
                        setSelectedTraitement(key);
                        const defaults = {};
                        Object.entries(val.params || {}).forEach(([k, v]) => (defaults[k] = v.default));
                        const allowedTypes = val.type || [];
                        defaults.dataType = allowedTypes[0] || null;
                        setTraitementParams(defaults);
                        setIsTraitementOpen(false);
                      }}
                    >
                      {val.label}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Run traitement (ACTIVE CARD) */}
            <button
              className="btn-primary"
              onClick={() => {
                if (!activeCard) return;

                const instance =
                  traitementParams.dataType === "IRM"
                    ? activeCard?.irmData
                    : traitementParams.dataType === "MRSI"
                      ? activeCard?.mrsiData
                      : null;

                if (!instance) return;

                runTraitement(instance, activeCard.id, selectedTraitement, traitementParams);
              }}
              disabled={!canRunActive}
            >
              {activeJob?.loading ? "Traitement..." : "Lancer sur la carte active"}
            </button>

            {/* Run traitement (ALL CARDS) */}
            <button className="btn-secondary" onClick={runTraitementOnAllCards} disabled={!canRunAll}>
              Lancer sur toutes les cartes
            </button>

            {/* Params */}
            <div className="nav-item" onClick={() => setIsParamOpen(!isParamOpen)}>
              <span className="icon">⚙️</span>
              <span className="label">Paramètres :</span>
            </div>

            {isParamOpen && (
              <div className="traitement-form">
                {/* DataType */}
                <div className="param-container">
                  <label className="param-label">Type de données :</label>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    {["IRM", "MRSI"].map((dt) => {
                      const isPossible = catalog[selectedTraitement]?.type?.includes(dt);
                      const isSelected = traitementParams.dataType === dt;
                      return (
                        <div
                          key={dt}
                          className={`nav-item param-choice ${isSelected ? "selected" : ""} ${
                            !isPossible ? "disabled" : ""
                          }`}
                          onClick={() => {
                            if (!isPossible) return;
                            setTraitementParams({ ...traitementParams, dataType: dt });
                          }}
                        >
                          <span className="label">{dt}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Specific params */}
                {Object.entries(catalog[selectedTraitement]?.params || {}).map(([paramKey, paramDef]) => (
                  <div key={paramKey} className="param-container">
                    <label className="param-label">{paramDef.label} :</label>

                    {paramDef.type === "int" && (
                      <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
                        <input
                          className="param-input"
                          type="number"
                          min={paramDef.range[0]}
                          max={paramDef.range[1]}
                          value={traitementParams[paramKey] ?? paramDef.default}
                          onChange={(e) =>
                            setTraitementParams({
                              ...traitementParams,
                              [paramKey]: parseInt(e.target.value, 10),
                            })
                          }
                        />
                        <small className="param-range">
                          Valeurs possibles : {paramDef.range[0]} – {paramDef.range[1]}
                        </small>
                      </div>
                    )}

                    {paramDef.type_param === "choix" && (
                      <select
                        className="param-input"
                        value={traitementParams[paramKey] ?? paramDef.default}
                        onChange={(e) =>
                          setTraitementParams({
                            ...traitementParams,
                            [paramKey]: e.target.value,
                          })
                        }
                      >
                        {paramDef.select.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    )}

                    {paramDef.type_param === "choix_multiple" && (
                      <div className="checkbox-group">
                        {paramDef.select.map((opt) => {
                          const current = traitementParams[paramKey] || [];
                          return (
                            <label key={opt} className="checkbox-label">
                              <input
                                type="checkbox"
                                checked={current.includes(opt)}
                                onChange={(e) => {
                                  const updated = e.target.checked
                                    ? [...current, opt]
                                    : current.filter((x) => x !== opt);
                                  setTraitementParams({
                                    ...traitementParams,
                                    [paramKey]: updated,
                                  });
                                }}
                              />
                              {opt}
                            </label>
                          );
                        })}
                      </div>
                    )}

                    <hr className="param-divider" />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/*     Patients view: make the right sidebar useful (context + guidance) */}
        {view === "patients" && (
          <div className="nav-links">
            <div className="card" style={{ margin: 12 }}>
              <h3 style={{ marginTop: 0 }}>🧭 Workflow (Patients)</h3>
              <ol style={{ paddingLeft: 18, marginBottom: 10, color: "var(--text-muted)" }}>
                <li>Choisir un dossier dataset (Chrome/Edge)</li>
                <li>Envoyer le JSON au backend → affichage patients/exams</li>
                <li>Sélectionner des examens + lancer la quantification</li>
              </ol>

              <div
                style={{
                  padding: 10,
                  borderRadius: 10,
                  border: "1px solid var(--border-color)",
                  background: "rgba(255,255,255,0.02)",
                  color: "var(--text-muted)",
                  fontSize: "0.9rem",
                }}
              >
                <strong>Note “predict1 / predict2”</strong>
                <div style={{ marginTop: 6 }}>
                  Côté backend actuel, seule <b>predict1</b> est déclarée (PREDICTION_MAP). <br />
                  <b>predict2</b> sert de placeholder : si tu la choisis et que le backend ne la gère pas,
                  tu auras “Type de traitement inconnu”.
                </div>
              </div>

              <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                <button className="btn-secondary" onClick={() => setView("irm")}>
                  Aller à l’onglet IRM (post-traitement)
                </button>
                <button
                  className="btn-secondary"
                  onClick={() => setIsRightSidebarCollapsed(true)}
                >
                  Masquer ce panneau
                </button>
              </div>
            </div>


          </div>
        )}

        {/*  Home/Other: minimal content */}
        {view !== "irm" && view !== "patients" && (
          <div className="nav-links">
            <div className="card" style={{ margin: 12, color: "var(--text-muted)" }}>
              <h3 style={{ marginTop: 0 }}>👋 Astuce</h3>
              <p style={{ marginBottom: 0 }}>
                Va sur <b>Upload IRM</b> pour accéder au post-traitement, ou <b>Patients</b> pour explorer
                le dataset.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;