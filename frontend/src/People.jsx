import { useEffect, useState } from "react";
import { api } from "./api";
import AddClient from "./AddClient";
import Dropdown from "./Dropdown";
import { useAuth } from "./auth";
import { fmt, ROLE_LABEL } from "./lib";

function Row({ u, clients, me, onSaved }) {
  const isClient = u.role === "CLIENT";
  const [f, setF] = useState({ name: u.name, clientId: u.clientId ? String(u.clientId) : "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const dirty = f.name !== u.name || f.clientId !== (u.clientId ? String(u.clientId) : "");

  const save = async () => {
    setBusy(true); setErr("");
    try {
      const r = await api(`/users/${u.id}`, { method: "PATCH", body: { name: f.name, clientId: Number(f.clientId) || null } });
      onSaved(r);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <tr>
      <td>
        {isClient
          ? <input aria-label={`Name for ${u.email}`} value={f.name} onChange={(e) => set("name", e.target.value)} />
          : <div className="strong">{u.name}</div>}
        <div className="mq">{u.email}</div>
      </td>
      <td>{ROLE_LABEL[u.role]}</td>
      <td>
        {isClient ? (
          <Dropdown ariaLabel={`Client for ${u.email}`} value={f.clientId} onChange={(v) => set("clientId", v)} placeholder="Choose a client"
            options={clients.map((c) => ({ value: c.id, label: c.name }))} />
        ) : <span className="note">Not needed</span>}
      </td>
      <td>{u.pending && <span className="pend">Needs a client</span>}<div className="mq">{fmt(u.createdAt)}</div></td>
      <td>
        {isClient && <button className="btn" disabled={busy || !dirty || !f.clientId} onClick={save}>Save</button>}
        {err && <div className="err" role="alert">{err}</div>}
      </td>
    </tr>
  );
}

export default function People() {
  const { user } = useAuth();
  const [list, setList] = useState(null);
  const [clients, setClients] = useState([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    Promise.all([api("/users"), api("/meta")]).then(([l, m]) => { setList(l); setClients(m.clients); }).catch((e) => setErr(e.message));
  }, []);
  if (user.role !== "MANAGER") return <main className="wrap"><div className="empty">Managers only.</div></main>;
  if (err) return <main className="wrap"><div className="empty">{err}</div></main>;
  if (!list) return <main className="wrap"><div className="empty">Loading…</div></main>;

  const waiting = list.filter((u) => u.pending).length;
  const saved = (r) => setList((l) => l.map((x) => (x.id === r.id ? r : x)));

  return (
    <main className="wrap">
      <h1>People</h1>
      <p className="sub">
        {waiting ? `${waiting} client ${waiting === 1 ? "user is" : "users are"} waiting to be added to a client. Choose one of your clients for them, then save.`
          : "Employees, and the client users of your clients. Add a client below, then link client users to it."}
      </p>
      <div className="addc-bar"><AddClient onAdded={(c) => setClients((l) => [...l, c].sort((a, b) => (a.name === "In house" ? -1 : b.name === "In house" ? 1 : a.name.localeCompare(b.name))))} /></div>
      <div className="tw">
        <table>
          <thead><tr><th>Name and email</th><th>Role</th><th>Client</th><th>Registered</th><th /></tr></thead>
          <tbody>{list.map((u) => <Row key={u.id + ":" + u.role + ":" + u.clientId + ":" + u.name} u={u} clients={clients} me={user.id} onSaved={saved} />)}</tbody>
        </table>
      </div>
    </main>
  );
}
