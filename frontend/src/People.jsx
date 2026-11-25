import { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import AddClient from "./AddClient";
import Dropdown from "./Dropdown";
import Loader from "./Loader";
import { useAuth } from "./auth";
import { fdate, initials, ROLE_LABEL } from "./lib";
import "./people.css";

const Icon = ({ d, size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);
const I = {
  all: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" /><path d="M16 4.6a3.5 3.5 0 010 6.8M18 14.4c2 .7 3.5 2.6 3.5 5.6" /></>,
  team: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2M3 13h18" /></>,
  client: <><path d="M3 21V8l9-5 9 5v13" /><path d="M9 21v-6h6v6M3 21h18" /></>,
  wait: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>,
  cal: <><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  check: <path d="M4.5 12.5l5 5 10-11" />,
  users: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" /></>,
};

function PersonCard({ u, clients, onSaved }) {
  const isClient = u.role === "CLIENT";
  const base = { name: u.name, clientId: u.clientId ? String(u.clientId) : "" };
  const [f, setF] = useState(base);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const dirty = f.name !== base.name || f.clientId !== base.clientId;

  const save = async () => {
    setBusy(true); setErr("");
    try {
      const r = await api(`/users/${u.id}`, { method: "PATCH", body: { name: f.name, clientId: Number(f.clientId) || null } });
      onSaved(r);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const tone = u.pending ? "pend" : isClient ? "client" : "team";
  return (
    <article className={`pc2${u.pending ? " pending" : ""}${dirty ? " dirty" : ""}`}>
      <div className="pc2-top">
        <span className={`pav ${tone}`} aria-hidden="true">{initials(u.name)}</span>
        <div className="pid">
          <div className="nm" title={u.name}>{u.name}</div>
          <div className="em" title={u.email}>{u.email}</div>
        </div>
        <span className={`rchip${isClient ? " client" : ""}`}>{ROLE_LABEL[u.role]}</span>
      </div>

      <div className="pc2-body">
        {isClient ? (
          <>
            <div className="pf">
              <label htmlFor={`pn-${u.id}`}>Name</label>
              <input id={`pn-${u.id}`} aria-label={`Name for ${u.email}`} value={f.name} maxLength={60} onChange={(e) => set("name", e.target.value)} />
            </div>
            <div className="pf">
              <label>Client</label>
              <Dropdown ariaLabel={`Client for ${u.email}`} value={f.clientId} onChange={(v) => set("clientId", v)} placeholder="Choose a client"
                options={clients.map((c) => ({ value: c.id, label: c.name, sub: c.owner ? `Managed by ${c.owner}` : undefined }))} />
            </div>
          </>
        ) : (
          <div className="pnote"><Icon d={I.team} size={18} />Works across all clients</div>
        )}
      </div>

      <div className="pc2-foot">
        {u.pending
          ? <span className="pend">Needs a client</span>
          : <span className="pdate"><Icon d={I.cal} size={14} />Registered {fdate(u.createdAt)}</span>}
        <span className="sp" />
        {isClient && dirty && <button className="btn" disabled={busy || !f.clientId || !f.name.trim()} onClick={save}>{busy ? "Saving…" : "Save changes"}</button>}
        {err && <div className="perr" role="alert">{err}</div>}
      </div>
    </article>
  );
}

// The signed-in manager's own profile (read-only).
function MyCard({ u, clients, sup }) {
  const mine = sup ? [] : clients;
  return (
    <article className="pc2 mine">
      <div className="pc2-top">
        <span className="pav mgr" aria-hidden="true">{initials(u.name)}</span>
        <div className="pid">
          <div className="nm" title={u.name}>{u.name}<span className="you">You</span></div>
          <div className="em" title={u.email}>{u.email}</div>
        </div>
        <span className="rchip">{ROLE_LABEL[u.role]}</span>
      </div>
      <div className="pc2-body">
        {sup
          ? <div className="pnote"><Icon d={I.client} size={18} />Full access to every client, ticket and team member</div>
          : (
            <div className="pf">
              <label>{mine.length === 1 ? "Manages 1 client" : `Manages ${mine.length} clients`}</label>
              <div className="pchips">{mine.length ? mine.map((c) => <span className="chip" key={c.id}>{c.name}</span>) : <span className="note">No clients yet</span>}</div>
            </div>
          )}
      </div>
      <div className="pc2-foot"><span className="pdate"><Icon d={I.cal} size={14} />Registered {fdate(u.createdAt)}</span></div>
    </article>
  );
}

const Group = ({ title, n, warn, children }) => (
  <>
    <div className={`pgh${warn ? " warn" : ""}`}>{title}<span className="n">{n}</span></div>
    <div className="pgrid">{children}</div>
  </>
);

export default function People() {
  const { user } = useAuth();
  const [list, setList] = useState(null);
  const [clients, setClients] = useState([]);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState("all");   // all | team | client | pending
  const [q, setQ] = useState("");

  useEffect(() => {
    Promise.all([api("/users"), api("/meta")]).then(([l, m]) => { setList(l); setClients(m.clients); }).catch((e) => setErr(e.message));
  }, []);

  const needle = q.trim().toLowerCase();
  const shown = useMemo(() => (list || []).filter((u) =>
    (filter === "all" || (filter === "team" && u.role === "ASSIGNEE") || (filter === "client" && u.role === "CLIENT") || (filter === "pending" && u.pending)) &&
    (!needle || (u.name + " " + u.email).toLowerCase().includes(needle))
  ), [list, filter, needle]);

  if (user.role !== "MANAGER" && user.role !== "SUPER_MANAGER") return <main className="wrap"><div className="empty">Managers only.</div></main>;
  if (err) return <main className="wrap"><div className="empty">{err}</div></main>;
  if (!list) return <main className="wrap"><Loader label="Loading people" /></main>;

  const waiting = list.filter((u) => u.pending).length;
  const teamN = list.filter((u) => u.role === "ASSIGNEE").length;
  const clientN = list.filter((u) => u.role === "CLIENT").length;
  const saved = (r) => setList((l) => l.map((x) => (x.id === r.id ? r : x)));
  const card = (u) => <PersonCard key={u.id + ":" + u.role + ":" + u.clientId + ":" + u.name} u={u} clients={clients} onSaved={saved} />;

  const tiles = [
    { k: "all", n: list.length, label: "Everyone", icon: I.all },
    { k: "team", n: teamN, label: "Team members", icon: I.team },
    { k: "client", n: clientN, label: "Client users", icon: I.client },
    { k: "pending", n: waiting, label: "Need a client", icon: I.wait, warn: true },
  ];

  const me = shown.filter((u) => u.id === user.id);
  const pending = shown.filter((u) => u.pending);
  const team = shown.filter((u) => u.role === "ASSIGNEE");
  const linked = shown.filter((u) => u.role === "CLIENT" && !u.pending);

  return (
    <main className="wrap">
      <div className="ph">
        <div>
          <h1>People</h1>
          <p className="sub">
            {waiting ? `${waiting} client ${waiting === 1 ? "user is" : "users are"} waiting to be added to a client. Choose one of your clients for them, then save.`
              : "Team members, and the client users of your clients. Add a client, then link client users to it."}
          </p>
        </div>
        <div className="ph-act">
          <AddClient onAdded={(c) => setClients((l) => [...l, c].sort((a, b) => (a.name === "In house" ? -1 : b.name === "In house" ? 1 : a.name.localeCompare(b.name))))} />
        </div>
      </div>

      <div className="pstats" role="group" aria-label="Filter people">
        {tiles.map((t) => (
          <button key={t.k} type="button" aria-pressed={filter === t.k}
            className={`pstat${t.warn ? " warn" : ""}${t.warn && t.n > 0 ? " hot" : ""}${filter === t.k ? " on" : ""}`}
            onClick={() => setFilter(filter === t.k && t.k !== "all" ? "all" : t.k)}>
            <span className="pstat-ic"><Icon d={t.icon} /></span>
            <span className="pstat-tx"><b>{t.n}</b><span>{t.label}</span></span>
          </button>
        ))}
      </div>

      <div className="pbar">
        <div className="psearch">
          <Icon d={I.search} size={16} />
          <input aria-label="Search people" placeholder="Search by name or email" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <span className="pcount"><b>{shown.length}</b> {shown.length === 1 ? "person" : "people"}</span>
        <span className="sp" />
        {(filter !== "all" || q) && <button className="btn g" onClick={() => { setFilter("all"); setQ(""); }}>Clear filters</button>}
      </div>

      {shown.length === 0 ? (
        <div className="pempty">
          <Icon d={I.users} size={34} />
          <b>No one matches</b>
          <span>Try a different name or email, or clear the filters.</span>
        </div>
      ) : (
        <>
          {me.length > 0 && <Group title="Your profile" n={me.length}>{me.map((u) => <MyCard key={u.id} u={u} clients={clients} sup={user.role === "SUPER_MANAGER"} />)}</Group>}
          {pending.length > 0 && <Group title="Waiting for a client" n={pending.length} warn>{pending.map(card)}</Group>}
          {team.length > 0 && <Group title="Team members" n={team.length}>{team.map(card)}</Group>}
          {linked.length > 0 && <Group title="Client users" n={linked.length}>{linked.map(card)}</Group>}
        </>
      )}
    </main>
  );
}