import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "./api";
import { useAuth } from "./auth";
import NewTicket from "./NewTicket";
import AddClient from "./AddClient";
import Dropdown from "./Dropdown";
import Loader from "./Loader";
import { dueText, fdate, fmt, PRIO, SL, STATUSES } from "./lib";
import "./filters.css";

const Prio = ({ p }) => <span className={`pc ${PRIO[p].css}`}><i />{PRIO[p].label}</span>;

// ---- month filter ----
// An open ticket belongs to the month it was created in, an approved (completed) ticket to the month it was approved in.
const monthKey = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`; };
const monthOf = (p) => monthKey(p.status === "APPROVED" && p.approvedAt ? p.approvedAt : p.createdAt);
const monthLabel = (k) => { const [y, m] = k.split("-"); return new Date(+y, +m - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" }); };

// Shown at most this many approved cards in the board until "Show all" is pressed, so the board stays short over time.
const DONE_PREVIEW = 10;

export default function Board() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const [items, setItems] = useState(null);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("all");
  const [view, setView] = useState("board");
  const [open, setOpen] = useState(false);
  const [addingClient, setAddingClient] = useState(false);
  const [allDone, setAllDone] = useState(false);
  const [toast, setToast] = useState("");
  const [err, setErr] = useState("");

  const sup = user.role === "SUPER_MANAGER";   // sees and manages everything
  const staff = user.role === "MANAGER" || sup;
  const isClient = user.role === "CLIENT";
  const cname = (p) => (sup && p.client.owner ? `${p.client.name} · ${p.client.owner}` : p.client.name);

  // Filters live in the address (?month=2026-11&person=7&client=3), so a view can be bookmarked or shared.
  const month = sp.get("month") || "all";
  const person = staff ? sp.get("person") || "all" : "all";   // "all", "none" (unassigned) or a user id
  const client = staff ? sp.get("client") || "all" : "all";
  const setFilter = (key, value) => {
    const next = new URLSearchParams(sp);
    if (value === "all") next.delete(key); else next.set(key, value);
    setSp(next, { replace: true });
  };
  const filtered = month !== "all" || person !== "all" || client !== "all";

  useEffect(() => { api("/tickets").then(setItems).catch((e) => setErr(e.message)); }, []);
  const L = useMemo(
    () => (items || []).filter((p) => (p.key + p.title + p.client.name + (p.client.owner ?? "") + (p.assignee?.name ?? "")).toLowerCase().includes(q.toLowerCase())),
    [items, q]
  );

  // The filter lists are built from the tickets this person can already see (the server decides that), nothing more.
  const months = useMemo(() => [...new Set([...(items || []).map(monthOf), monthKey(new Date())])].sort().reverse(), [items]);
  const people = useMemo(() => {
    const m = new Map();
    for (const p of items || []) if (p.assignee) m.set(p.assignee.id, p.assignee.name);
    return [...m].sort((a, b) => a[1].localeCompare(b[1]));
  }, [items]);
  const clients = useMemo(() => {
    const m = new Map();
    for (const p of items || []) m.set(p.client.id, sup && p.client.owner ? `${p.client.name} · ${p.client.owner}` : p.client.name);
    return [...m].sort((a, b) => a[1].localeCompare(b[1]));
  }, [items, sup]);

  if (err) return <main className="wrap"><div className="empty">{err}</div></main>;
  if (!items) return <main className="wrap"><Loader label="Loading your tickets" /></main>;

  const matches = (p) =>
    (month === "all" || monthOf(p) === month) &&
    (person === "all" || (person === "none" ? !p.assignee : String(p.assignee?.id) === person)) &&
    (client === "all" || String(p.client.id) === client);
  const V = L.filter(matches);   // what the board, list and the numbers above them show

  const count = (s) => V.filter((p) => p.status === s).length;
  const mentioned = L.filter((p) => p.mention).sort((a, b) => new Date(b.mention.at) - new Date(a.mention.at));
  const mentionTotal = items.filter((p) => p.mention).length;

  const monthOpts = [{ value: "all", label: "All time" }, ...(month !== "all" && !months.includes(month) ? [month] : []).concat(months).map((k) => ({ value: k, label: monthLabel(k) }))];
  const personOpts = [{ value: "all", label: "Everyone" }, ...people.map(([id, name]) => ({ value: String(id), label: name })), { value: "none", label: "Unassigned" }];
  const clientOpts = [{ value: "all", label: "All clients" }, ...clients.map(([id, name]) => ({ value: String(id), label: name }))];
  const label = (opts, v) => opts.find((o) => o.value === v)?.label;
  const summary = [
    month !== "all" && label(monthOpts, month),
    person !== "all" && label(personOpts, person),
    client !== "all" && label(clientOpts, client),
  ].filter(Boolean).join(" · ");

  const clear = () => setSp(new URLSearchParams(), { replace: true });
  return (
    <main className="wrap">
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === "all"} className={tab === "all" ? "on" : ""} onClick={() => setTab("all")}>All tickets</button>
        <button role="tab" aria-selected={tab === "mentions"} className={tab === "mentions" ? "on" : ""} onClick={() => setTab("mentions")}>
          Mentions{mentionTotal > 0 && <span className="tn">{mentionTotal}</span>}
        </button>
      </div>

      {tab === "all" && (
        <>
          <div className="fbar">
            <div className="fl"><label>Month</label><Dropdown ariaLabel="Filter by month" value={month} onChange={(v) => setFilter("month", v)} options={monthOpts} /></div>
            {staff && <div className="fl"><label>Person</label><Dropdown ariaLabel="Filter by person" value={person} onChange={(v) => setFilter("person", v)} options={personOpts} /></div>}
            {staff && <div className="fl"><label>Client</label><Dropdown ariaLabel="Filter by client" value={client} onChange={(v) => setFilter("client", v)} options={clientOpts} /></div>}
            <span className="sp" />
            {filtered && <button className="btn g" onClick={clear}>Clear filters</button>}
          </div>
          <p className="fsum">
            {summary && <>{summary} · </>}<b>{V.length}</b> ticket{V.length === 1 ? "" : "s"} · <b>{count("APPROVED")}</b> completed
            {month !== "all" && <small>Open tickets count in the month they were created, completed (approved) tickets in the month they were approved.</small>}
          </p>
          <div className="stats">
            {STATUSES.map((s) => (
              <div className="stat" key={s.key}><b>{count(s.key)}</b><span>{s.label}</span></div>
            ))}
          </div>
        </>
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
          {STATUSES.map((s) => {
            const all = V.filter((p) => p.status === s.key);
            // Newest completions first; long lists of approved tickets are cut short until asked for.
            const col = s.key === "APPROVED" ? [...all].sort((a, b) => new Date(b.approvedAt ?? b.createdAt) - new Date(a.approvedAt ?? a.createdAt)) : all;
            const shown = s.key === "APPROVED" && !allDone ? col.slice(0, DONE_PREVIEW) : col;
            return (
              <section className="col" key={s.key}>
                <div className="ch"><span>{s.label}</span><span className="n">{all.length}</span></div>
                {shown.map((p) => (
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
                {s.key === "APPROVED" && col.length > DONE_PREVIEW && (
                  <button className="btn g more" onClick={() => setAllDone(!allDone)}>{allDone ? "Show fewer" : `Show all ${col.length}`}</button>
                )}
                {all.length === 0 && <div className="empty small">Nothing here</div>}
              </section>
            );
          })}
        </div>
      ) : (
        <div className="tw">
          <table>
            <thead>
              <tr><th>ID</th><th>Title</th>{!isClient && <th>Client</th>}<th>Assignee</th><th>Priority</th><th>Due</th><th>Status</th></tr>
            </thead>
            <tbody>
              {V.map((p) => (
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
              {V.length === 0 && <tr><td colSpan={7} className="empty">No tickets</td></tr>}
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