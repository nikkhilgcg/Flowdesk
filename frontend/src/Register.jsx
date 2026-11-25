import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "./auth";
import LoginBackground from "./LoginBackground";

export default function Register() {
  const { user, register } = useAuth();
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/" replace />;

  const mismatch = confirm.length > 0 && password !== confirm;

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    if (!name.trim()) {
      setErr("Enter your full name");
      return;
    }
    if (!role) {
      setErr("Choose how you will use Flowdesk");
      return;
    }
    if (password.length < 8) {
      setErr("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      setErr("Passwords don’t match");
      return;
    }
    setBusy(true);
    try {
      await register({ name, role, email, password, confirmPassword: confirm });
      nav("/");
    } catch (x) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="lw">
      <LoginBackground />
      <form className="lc wide" onSubmit={submit} noValidate>
        <div className="logo">
          <i />
          Flowdesk
        </div>
        <h1 style={{ fontSize: 24, margin: "14px 0 4px" }}>
          Create your account
        </h1>
        <p className="sub" style={{ margin: 0 }}>
          Tell us who you are and choose a password.
        </p>
        <div className="g2">
          <div>
            <label htmlFor="nm">Full name</label>
            <input
              id="nm"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              placeholder="e.g. Dhruv Patel"
              maxLength={60}
              autoFocus
              required
            />
          </div>
          <div>
            <label id="rl">I am a</label>
            <div className="roles" role="radiogroup" aria-labelledby="rl">
              {[
                ["ASSIGNEE", "Team Member", "I work on tickets"],
                ["MANAGER", "Manager", "I manage clients"],
                ["CLIENT", "Client", "I raise requests"],
              ].map(([k, t, d]) => (
                <button
                  type="button"
                  key={k}
                  role="radio"
                  aria-checked={role === k}
                  title={d}
                  className={role === k ? "on" : ""}
                  onClick={() => setRole(k)}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>
        {role && (
          <div className="fh">
            {
              {
                ASSIGNEE:
                  "Team Member: you work on the tickets assigned to you.",
                MANAGER:
                  "Manager: you manage your own clients and their tickets.",
                CLIENT:
                  "Client: after you sign up, a manager has to add you to your company before you can see anything.",
              }[role]
            }
          </div>
        )}
        <label htmlFor="em">Email</label>
        <input
          id="em"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
        <div className="g2">
          <div>
            <label htmlFor="pw">Password</label>
            <input
              id="pw"
              type={show ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              aria-describedby="pwh"
              required
            />
          </div>
          <div>
            <label htmlFor="pc">Confirm password</label>
            <input
              id="pc"
              type={show ? "text" : "password"}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              aria-invalid={mismatch}
              required
            />
          </div>
        </div>
        {mismatch ? (
          <div id="pwh" className="fh bad">
            Passwords don’t match yet.
          </div>
        ) : (
          <div id="pwh" className="fh">
            Password: at least 8 characters.
          </div>
        )}
        <label className="shw">
          <input
            type="checkbox"
            checked={show}
            onChange={(e) => setShow(e.target.checked)}
          />{" "}
          Show passwords
        </label>
        {err && (
          <div className="err" role="alert">
            {err}
          </div>
        )}
        <button
          className="btn"
          style={{ width: "100%", marginTop: 18 }}
          disabled={busy}
        >
          {busy ? "Creating account…" : "Create account"}
        </button>
        <p className="alt">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
