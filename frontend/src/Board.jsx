import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "./api";
import { useAuth } from "./auth";
import NewTicket from "./NewTicket";
import AddClient from "./AddClient";
import { dueText, fdate, fmt, PRIO, SL, STATUSES } from "./lib";

const Prio = ({ p }) => <span className={`pc ${PRIO[p].css}`}><i />{PRIO[p].label}</span>;

export default function Board() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [items, setItems] = useState(null);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("all");
  const [view, setView] = useState("board");
  const [open, setOpen] = useState(false);
  const [addingClient, setAddingClient] = useState(false);
  const [toast, setToast] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => { api("/tickets").then(setItems).catch((e) => setErr(e.message)); }, []);
  const L = useMemo(
    () => (items || []).filter((p) => (p.key + p.title + p.client.name + (p.client.owner ?? "") + (p.assignee?.name ?? "")).toLowerCase().includes(q.toLowerCase())),
    [items, q]
  );
  if (err) return <main className="wrap"><div className="empty">{err}</div></main>;
  if (!items) return <main className="wrap"><div className="empty">Loading…</div></main>;

  const isClient = user.role === "CLIENT";
  const sup = user.role === "SUPER_MANAGER";   // sees and manages everything
  const cname = (p) => (sup && p.client.owner ? `${p.client.name} · ${p.client.owner}` : p.client.name);
  const count = (s) => L.filter((p) => p.status === s).length;
  const mentioned = L.filter((p) => p.mention).sort((a, b) => new Date(b.mention.at) - new Date(a.mention.at));
  const mentionTotal = items.filter((p) => p.mention).length;

  return (
    <main className="wrap">
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === "all"} className={tab === "all" ? "on" : ""} onClick={() => setTab("all")}>All tickets</button>
        <button role="tab" aria-selected={tab === "mentions"} className={tab === "mentions" ? "on" : ""} onClick={() => setTab("mentions")}>
          Mentions{mentionTotal > 0 && <span className="tn">{mentionTotal}</span>}
        </button>
      </div>

      {tab === "all" && (
        <div className="stats">
          {STATUSES.map((s) => (
            <div className="stat" key={s.key}><b>{count(s.key)}</b><span>{s.label}</span></div>
          ))}
        </div>
      )}

      <div className="bar">
        {tab === "all" && (
          <div className="seg" role="group" aria-label="View">
            <button className={view === "board" ? "on" : ""} onClick={() => setView("board")}>Board</button>
            <button className={view === "list" ? "on" : ""} onClick={() => setView("list")}>List</button>
          </div>
        )}
        <input className="search" aria-label="Search tickets" placeholder="Search by ID, title, client or assignee" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="sp" />
        {(user.role === "MANAGER" || sup) && <button className="btn g" onClick={() => setAddingClient(true)}>+ Add client</button>}
        <button className="btn" onClick={() => setOpen(true)}>+ New ticket</button>
      </div>

      {tab === "mentions" ? (
        <div className="mlist">
          {mentioned.map((p) => (
            <Link className="card mrow" to={`/${p.key}`} key={p.key}>
              <div className="row">
                <span className="id">{p.key}{!isClient && <> · {cname(p)}</>}</span>
                <span className={`st ${SL[p.status].css}`}>{SL[p.status].label}</span>
              </div>
              <div className="ct">{p.title}</div>
              <div className="mq"><b>{p.mention.by}</b> mentioned you · {fmt(p.mention.at)}</div>
              {p.mention.text && <div className="mx">“{p.mention.text}”</div>}
            </Link>
          ))}
          {mentioned.length === 0 && <div className="empty">{mentionTotal > 0 ? "No mentions match your search." : "Nobody has mentioned you yet."}</div>}
        </div>
      ) : view === "board" ? (
        <div className="board">
          {STATUSES.map((s) => (
            <section className="col" key={s.key}>
              <div className="ch"><span>{s.label}</span><span className="n">{count(s.key)}</span></div>
              {L.filter((p) => p.status === s.key).map((p) => (
                <Link className="card" to={`/${p.key}`} key={p.key}>
                  <div className="row">
                    <span className="id">{p.key}</span>
                    {!isClient && <span className="chip">{cname(p)}</span>}
                  </div>
                  <div className="ct">{p.title}</div>
                  {p.mention && <div className="mt">@ Mentions you</div>}
                  {p.reworkCount > 0 && <div className="rw">↺ Rework ×{p.reworkCount}</div>}
                  <div className="row foot">
                    <Prio p={p.priority} />
                    {p.assignee && <span className="an" title={p.assignee.name}>{p.assignee.name}</span>}
                  </div>
                  {(() => { const d = dueText(p.dueDate, p.status === "APPROVED"); return <div className={`due ${d.css}`}>{d.text}</div>; })()}
                </Link>
              ))}
              {count(s.key) === 0 && <div className="empty small">Nothing here</div>}
            </section>
          ))}
        </div>
      ) : (
        <div className="tw">
          <table>
            <thead>
              <tr><th>ID</th><th>Title</th>{!isClient && <th>Client</th>}<th>Assignee</th><th>Priority</th><th>Due</th><th>Status</th></tr>
            </thead>
            <tbody>
              {L.map((p) => (
                <tr key={p.key} onClick={() => nav(`/${p.key}`)}>
                  <td className="id">{p.key}</td>
                  <td className="strong">{p.title}</td>
                  {!isClient && <td>{cname(p)}</td>}
                  <td>{p.assignee?.name ?? "Unassigned"}</td>
                  <td><Prio p={p.priority} /></td>
                  <td>{fdate(p.dueDate)}</td>
                  <td><span className={`st ${SL[p.status].css}`}>{SL[p.status].label}</span></td>
                </tr>
              ))}
              {L.length === 0 && <tr><td colSpan={7} className="empty">No tickets</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {toast && <div className="ok-note" role="status">{toast}</div>}
      {addingClient && (
        <div className="ov" onClick={(e) => e.target === e.currentTarget && setAddingClient(false)} onKeyDown={(e) => e.key === "Escape" && setAddingClient(false)}>
          <div className="md sm" role="dialog" aria-modal="true" aria-label="Add client">
            <h2>Add client</h2>
            <p className="hint" style={{ marginTop: 0 }}>The client appears in the client list when creating a ticket, and on the People page.</p>
            <AddClient startOpen onAdded={(c) => { setAddingClient(false); setToast(`Client “${c.name}” added`); setTimeout(() => setToast(""), 4000); }} onCancel={() => setAddingClient(false)} />
          </div>
        </div>
      )}
      {open && <NewTicket onClose={() => setOpen(false)} onCreated={(key) => nav(`/${key}`)} />}
    </main>
  );
}