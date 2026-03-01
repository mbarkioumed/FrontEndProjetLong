import React, { useState, useContext } from "react";
import AuthContext from "../context/AuthContext";
import "./Login.css";

const Login = () => {
    const { login } = useContext(AuthContext);
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");
        setLoading(true);
        try {
            await login(username, password);
        } catch (err) {
            setError("Identifiants incorrects ou erreur serveur");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-container">
            <div className="login-card">
                <h2>Connexion</h2>
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label>Identifiant</label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required
                        />
                    </div>
                    <div className="form-group">
                        <label>Mot de passe</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                    </div>
                    {error && <p className="error-msg">{error}</p>}
                    <button type="submit" disabled={loading}>
                        {loading ? "Chargement..." : "Se connecter"}
                    </button>
                    {/* Default credentials hint for demo */}
                    <div className="demo-hint">
                        <small>Demo: admin / admin</small>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default Login;
