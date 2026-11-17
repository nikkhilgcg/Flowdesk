import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "./auth";
import LoginBackground from "./LoginBackground";

export default function Login() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try { await login(email, password); nav("/"); } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };

  return (
    <div className="lw">
      <LoginBackground />
      <form className="lc" onSubmit={submit}>
        <div className="logo"><i />Flowdesk</div>
        <h1 style={{ fontSize: 24, margin: "18px 0 4px" }}>Sign in</h1>
        <p className="sub" style={{ margin: 0 }}>Use your work account to continue.</p>
        <label htmlFor="em">Email</label>
        <input id="em" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required />
        <label htmlFor="pw">Password</label>
        <input id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {err && <div className="err" role="alert">{err}</div>}
        <button className="btn" style={{ width: "100%", marginTop: 20 }} disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        <p className="alt">New to Flowdesk? <Link to="/register">Create an account</Link></p>
      </form>
    </div>
  );
}
