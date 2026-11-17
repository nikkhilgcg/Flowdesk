import { useState } from "react";
import { api } from "./api";

// Manager-only: add a new client without leaving the page. Calls onAdded({ id, name }) when saved.
export default function AddClient({ onAdded, startOpen = false, onCancel }) {
  const [open, setOpen] = useState(startOpen);
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!name.trim()) { setErr("Enter the client name"); return; }
    setBusy(true); setErr("");
    try {
      const c = await api("/clients", { method: "POST", body: { name } });
      onAdded(c);
      setName(""); setOpen(startOpen);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  if (!open) return <button type="button" className="lnk addc-open" onClick={() => setOpen(true)}>+ Add a new client</button>;
  return (
    <div className="addc">
      <div className="addc-row">
        <input aria-label="New client name" placeholder="Client name" value={name} autoFocus maxLength={80}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); save(); } if (e.key === "Escape") { setOpen(false); onCancel?.(); } }} />
        <button type="button" className="btn" onClick={save} disabled={busy}>Add client</button>
        <button type="button" className="btn g" onClick={() => { setOpen(false); setErr(""); onCancel?.(); }}>Cancel</button>
      </div>
      {err && <div className="err" role="alert">{err}</div>}
    </div>
  );
}
