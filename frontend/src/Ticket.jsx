import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, imageProblem, uploadImage } from "./api";
import { AuthImage, Lightbox, clipboardImages } from "./Images";
import { useAuth } from "./auth";
import Dropdown from "./Dropdown";
import MentionField from "./MentionField";
import { fdate, fmt, PRIO, ROLE_LABEL, SL, STATUSES } from "./lib";

function eventText(e) {
  if (e.type === "CREATED") return "created this process";
  if (e.type === "ASSIGNED") return e.body ?? "changed the assignee";
  if (e.type === "DESCRIPTION") return "edited the description";
  if (e.type === "STATUS") {
    if (e.fromStatus === "IN_REVIEW" && e.toStatus === "TODO") return "rejected this process and sent it back to To Do";
    if (e.toStatus === "APPROVED") return "approved this process";
    return `moved it from ${SL[e.fromStatus].label} to ${SL[e.toStatus].label}`;
  }
  return "";
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Comment text with @mentions highlighted.
function Body({ text, ids, people, meId }) {
  const named = (ids || []).map((id) => people.find((x) => x.id === id)).filter(Boolean);
  if (!named.length) return text;
  const re = new RegExp("(" + named.map((n) => escapeRe("@" + n.name)).join("|") + ")", "gi");
  return text.split(re).map((part, i) => {
    const n = named.find((x) => ("@" + x.name).toLowerCase() === part.toLowerCase());
    return n ? <span key={i} className={`mn${n.id === meId ? " me" : ""}`}>{part}</span> : part;
  });
}

// Comment box: typing @ opens a list of people who can see this process.
function CommentBox({ pkey, people, onSend }) {
  const [text, setText] = useState("");
  const [imgs, setImgs] = useState([]);       // images uploaded for this comment: { id, name }
  const [uploading, setUploading] = useState(0);
  const [drag, setDrag] = useState(false);
  const [msg, setMsg] = useState("");
  const file = useRef(null);
  const [q, setQ] = useState(null);
  const [idx, setIdx] = useState(0);
  const ref = useRef(null);
  const matches = q === null ? [] : people.filter((p) => p.name.toLowerCase().includes(q.toLowerCase())).slice(0, 6);

  const change = (e) => {
    const v = e.target.value;
    setText(v);
    const m = /(^|\s)@([^\s@]*)$/.exec(v.slice(0, e.target.selectionStart));
    setQ(m ? m[2] : null);
    setIdx(0);
  };
  const pick = (p) => {
    const pos = ref.current.selectionStart;
    const before = text.slice(0, pos).replace(/@([^\s@]*)$/, "@" + p.name + " ");
    setText(before + text.slice(pos));
    setQ(null);
    setTimeout(() => { ref.current.focus(); ref.current.setSelectionRange(before.length, before.length); }, 0);
  };
  const keys = (e) => {
    if (!matches.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => (i + 1) % matches.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => (i - 1 + matches.length) % matches.length); }
    else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pick(matches[idx]); }
    else if (e.key === "Escape") setQ(null);
  };
  const addFiles = async (files) => {
    setMsg("");
    for (const f of files) {
      const bad = imageProblem(f);
      if (bad) { setMsg(bad); continue; }
      setUploading((n) => n + 1);
      try {
        const a = await uploadImage(`/processes/${pkey}/comment-images`, f);
        setImgs((l) => [...l, { id: a.id, name: f.name || "Pasted image" }]);
      } catch (x) { setMsg(x.message); }
      setUploading((n) => n - 1);
    }
  };
  const removeImg = (id) => {
    setImgs((l) => l.filter((x) => x.id !== id));
    api(`/attachments/${id}`, { method: "DELETE" }).catch(() => {});
  };
  const onPaste = (e) => {
    const files = clipboardImages(e);
    if (!files.length) return;
    if (!e.clipboardData.types.includes("text/plain")) e.preventDefault();
    addFiles(files);
  };
  const submit = async (e) => {
    e.preventDefault();
    if ((!text.trim() && !imgs.length) || uploading) return;
    if (await onSend(text, imgs.map((x) => x.id))) { setText(""); setImgs([]); setQ(null); }
  };

  return (
    <div
      className={`cwrap${drag ? " dz on" : ""}`}
      onDragOver={(e) => { if ([...e.dataTransfer.types].includes("Files")) { e.preventDefault(); setDrag(true); } }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles([...e.dataTransfer.files]); }}
    >
    <form className="cform" onSubmit={submit}>
      <div className="mw">
        <input ref={ref} aria-label="Add a comment" placeholder="Add a comment. Type @ to mention someone" value={text} onChange={change} onKeyDown={keys} onPaste={onPaste} autoComplete="off" />
        {matches.length > 0 && (
          <div className="mp" role="listbox">
            {matches.map((p, i) => (
              <button type="button" key={p.id} className={i === idx ? "on" : ""} onMouseDown={(e) => { e.preventDefault(); pick(p); }}>
                <span>{p.name}</span><small>{ROLE_LABEL[p.role]}</small>
              </button>
            ))}
          </div>
        )}
      </div>
      <button type="button" className="btn g" onClick={() => file.current.click()} disabled={imgs.length + uploading >= 5}>Add image</button>
      <input ref={file} type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple hidden
        onChange={(e) => { addFiles([...e.target.files]); e.target.value = ""; }} />
      <button className="btn" disabled={uploading > 0}>Send</button>
    </form>
    {(imgs.length > 0 || uploading > 0) && (
      <div className="gal sm">
        {imgs.map((x, i) => (
          <div className="gi" key={x.id}>
            <AuthImage id={x.id} alt={`Image ${i + 1} for this comment: ${x.name}`} />
            <button type="button" className="gx" onClick={() => removeImg(x.id)} aria-label={`Remove image ${i + 1}`}>×</button>
          </div>
        ))}
        {Array.from({ length: uploading }, (_, i) => <div className="gi up" key={"u" + i}><span className="imgph" aria-busy="true">Uploading…</span></div>)}
      </div>
    )}
    {msg && <div className="err" role="alert">{msg}</div>}
    </div>
  );
}

export default function Ticket() {
  const { key } = useParams();
  const nav = useNavigate();
  const [confirmDel, setConfirmDel] = useState(false);
  const { user } = useAuth();
  const [p, setP] = useState(null);
  const [meta, setMeta] = useState(null);
  const [missing, setMissing] = useState(false);
  const [rej, setRej] = useState(false);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const [view, setView] = useState(null);       // id of the image open full size
  const [adding, setAdding] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const pick = useRef(null);

  const load = useCallback(() => {
    api(`/processes/${key}`).then((d) => { setP(d); setMissing(false); }).catch(() => setMissing(true));
  }, [key]);
  useEffect(() => { setRej(false); setEditing(false); setErr(""); load(); }, [load]);
  useEffect(() => { if (user.role === "MANAGER") api("/meta").then(setMeta); }, [user]);

  const addImages = useCallback(async (files) => {
    setErr("");
    for (const f of files) {
      const bad = imageProblem(f);
      if (bad) { setErr(bad); continue; }
      setAdding((n) => n + 1);
      try { await uploadImage(`/processes/${key}/attachments`, f); load(); } catch (e) { setErr(e.message); }
      setAdding((n) => n - 1);
    }
  }, [key, load]);
  // Pasting a screenshot anywhere on this page adds it to the ticket (text pastes are left alone).
  useEffect(() => {
    const onPaste = (e) => {
      if (user.role === "SUPER_MANAGER") return;   // view only
      if (e.target.closest?.(".cwrap")) return;   // pasting into the comment box adds to the comment instead
      const fs = clipboardImages(e);
      if (fs.length) { e.preventDefault(); addImages(fs); }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addImages, user.role]);

  if (missing)
    return (
      <main className="wrap"><div className="empty">
        <h1>Not found</h1>
        <p className="sub">This process doesn’t exist or isn’t available to your account.</p>
        <Link className="btn" to="/">Back to board</Link>
      </div></main>
    );
  if (!p) return <main className="wrap"><div className="empty">Loading…</div></main>;

  const mgr = user.role === "MANAGER";
  const ro = user.role === "SUPER_MANAGER";   // super manager: can see everything, change nothing
  const run = async (fn) => {
    setErr("");
    try { await fn(); load(); return true; } catch (e) { setErr(e.message); return false; }
  };
  const move = (to, why) => run(() => api(`/processes/${p.key}/transition`, { method: "POST", body: { to, reason: why } }));
  const pickStatus = (v) => {
    if (v === p.status) return;
    if (p.status === "IN_REVIEW" && v === "TODO") { setRej(true); return; }
    move(v);
  };

  // Approving and rejecting are decisions for a manager or the client.
  const decider = mgr || user.role === "CLIENT";
  const pickDecision = (v) => {
    if (v === "APPROVE") move("APPROVED");
    else if (v === "REJECT") setRej(true);
  };
  const decision = p.status === "APPROVED" ? "APPROVE" : rej ? "REJECT" : "NONE";

  return (
    <main className="wrap">
      <nav className="crumb"><Link to="/">Processes</Link> <span>/</span> {p.key}</nav>
      {ro && <div className="note lock" style={{ marginBottom: 12 }}>View only. As a super manager you can see this process but not edit it. You can still delete it.</div>}
      <div className="dg">
        <div>
          <section className="pn">
            <div className="id">{p.key}</div>
            <h1 className="tt">{p.title}</h1>
            {editing ? (
              <div className="descedit">
                <label htmlFor="de">Description</label>
                <MentionField id="de" rows={6} value={draft} onChange={setDraft} people={p.people} />
                <div className="acts">
                  <button className="btn" disabled={saving || draft.trim() === p.description}
                    onClick={async () => {
                      setSaving(true);
                      const ok = await run(() => api(`/processes/${p.key}/description`, { method: "PUT", body: { description: draft } }));
                      setSaving(false);
                      if (ok) setEditing(false);
                    }}>{saving ? "Saving…" : "Save changes"}</button>
                  <button className="btn g" disabled={saving} onClick={() => { setEditing(false); setErr(""); }}>Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <p className="desc">{p.description
                  ? <Body text={p.description}
                      ids={p.events.filter((e) => e.type === "CREATED" || e.type === "DESCRIPTION").flatMap((e) => e.mentions ?? [])}
                      people={p.people} meId={user.id} />
                  : "No description."}</p>
                {!ro && !(p.status === "APPROVED" && user.role === "ASSIGNEE") && (
                  <button className="lnk descbtn" onClick={() => { setDraft(p.description ?? ""); setErr(""); setEditing(true); }}>
                    {p.description ? "Edit description" : "Add a description"}
                  </button>
                )}
              </>
            )}
            {p.attachments.length > 0 && (
              <div className="gal">
                {p.attachments.map((a, i) => (
                  <div className="gi" key={a.id}>
                    <button className="gb" onClick={() => setView(a.id)} aria-label={`Open image ${i + 1} full size`}>
                      <AuthImage id={a.id} alt={`Attachment ${i + 1}, added by ${a.by}`} />
                    </button>
                    {(mgr || a.uploaderId === user.id) && (
                      <button className="gx" aria-label={`Remove image ${i + 1}`}
                        onClick={() => run(() => api(`/attachments/${a.id}`, { method: "DELETE" }))}>×</button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {!ro && !(p.status === "APPROVED" && user.role === "ASSIGNEE") && p.attachments.length < 10 && (
              <div className="attbar">
                <button className="lnk" onClick={() => pick.current.click()} disabled={adding > 0}>{adding ? "Uploading…" : "Add image"}</button>
                <span>or paste a screenshot</span>
                <input ref={pick} type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple hidden
                  onChange={(e) => { addImages([...e.target.files]); e.target.value = ""; }} />
              </div>
            )}
            {view && <Lightbox id={view} onClose={() => setView(null)} />}
            {decider && (
              <div className="decide">
                <label htmlFor="dc">Decision</label>
                <Dropdown id="dc" value={decision} disabled={p.status !== "IN_REVIEW" && p.status !== "APPROVED"} onChange={pickDecision}
                  options={[{ value: "NONE", label: "Not selected" }, { value: "APPROVE", label: "Approve", disabled: p.status === "APPROVED" }, { value: "REJECT", label: "Reject", disabled: p.status === "APPROVED" }]} />
                {p.status === "APPROVED" ? <span className="note">Approved. Change the status on the right to reopen it.</span>
                  : p.status !== "IN_REVIEW" && <span className="note">Available when the process is In Review.</span>}
              </div>
            )}
            {rej && (
              <div className="rejbox">
                <label htmlFor="rr">Reason for rejection</label>
                <textarea id="rr" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Explain what needs to change (required)" />
                <div className="acts">
                  <button className="btn er" disabled={!reason.trim()} onClick={async () => { if (await move("TODO", reason)) { setRej(false); setReason(""); } }}>Confirm reject</button>
                  <button className="btn g" onClick={() => setRej(false)}>Cancel</button>
                </div>
              </div>
            )}
            {err && <div className="err" role="alert">{err}</div>}
          </section>

          <section className="pn">
            <h3>Activity</h3>
            {!ro && <CommentBox pkey={p.key} people={p.people} onSend={(body, attachmentIds) => run(() => api(`/processes/${p.key}/comments`, { method: "POST", body: { body, attachmentIds } }))} />}
            <div className="tl">
              {[...p.events].reverse().map((e) => (
                <div className={`ev ${e.type === "COMMENT" ? "c" : ""}`} key={e.id}>
                  <b>{e.actor.name}</b> {e.type === "COMMENT" ? "commented" : eventText(e)} <small>· {fmt(e.createdAt)}</small>
                  {e.body && e.type !== "ASSIGNED" && e.type !== "DESCRIPTION" && (
                    <div className="bx">
                      {e.type === "STATUS" ? `Reason: ${e.body}` : <Body text={e.body} ids={e.mentions} people={p.people} meId={user.id} />}
                    </div>
                  )}
                  {e.attachments?.length > 0 && (
                    <div className="gal sm">
                      {e.attachments.map((a, i) => (
                        <div className="gi" key={a.id}>
                          <button className="gb" onClick={() => setView(a.id)} aria-label={`Open image ${i + 1} from ${e.actor.name}'s comment`}>
                            <AuthImage id={a.id} alt={`Image ${i + 1} in ${e.actor.name}'s comment`} />
                          </button>
                          {(mgr || a.uploaderId === user.id) && (
                            <button className="gx" aria-label={`Remove image ${i + 1}`} onClick={() => run(() => api(`/attachments/${a.id}`, { method: "DELETE" }))}>×</button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="pn">
          <h3>Details</h3>
          <dl>
            <dt>Status</dt>
            <dd>
              <Dropdown ariaLabel="Change status" value={p.status} disabled={ro || (p.status === "APPROVED" && !decider)} onChange={pickStatus}
                options={STATUSES.map((s) => ({
                  value: s.key, label: s.label,
                  disabled: s.key === "APPROVED" ? p.status !== "APPROVED" : s.key === "TODO" && p.status === "IN_REVIEW" && !decider,
                }))} />
              {p.status === "APPROVED" && !decider && !ro && <div className="note lock">Approved and locked. A manager or the client can reopen it.</div>}
            </dd>
            <dt>Client</dt><dd>{p.client.name}</dd>
            <dt>Assignee</dt>
            <dd>{mgr ? (
              <Dropdown ariaLabel="Assignee" value={p.assignee?.id ?? ""} placeholder="Unassigned"
                onChange={(v) => run(() => api(`/processes/${p.key}`, { method: "PATCH", body: { assigneeId: v ? Number(v) : null } }))}
                options={[{ value: "", label: "Unassigned" }, ...(meta?.assignees ?? []).map((a) => ({ value: a.id, label: a.name, person: true }))]} />) : (p.assignee?.name ?? "Unassigned")}</dd>
            <dt>Priority</dt><dd><span className={`pc ${PRIO[p.priority].css}`}><i />{PRIO[p.priority].label}</span></dd>
            <dt>Due</dt><dd>{fdate(p.dueDate)}</dd>
            <dt>Created</dt><dd>{fmt(p.createdAt)}</dd>
            <dt>Rework</dt><dd>{p.reworkCount ? `${p.reworkCount} time${p.reworkCount > 1 ? "s" : ""}` : "None"}</dd>
            <dt>Last status change by</dt><dd>{p.statusBy ?? "—"}</dd>
          </dl>
          {p.canDelete && (
            <div style={{ marginTop: 16 }}>
              {!confirmDel ? (
                <button className="lnk" onClick={() => { setErr(""); setConfirmDel(true); }}>Delete process</button>
              ) : (
                <div className="rejbox">
                  <p>Delete {p.key} for good? Its comments, activity and images will be removed too.</p>
                  <div className="acts">
                    <button className="btn er" onClick={async () => { if (await run(async () => { await api(`/processes/${p.key}`, { method: "DELETE" }); nav("/"); })) setConfirmDel(false); }}>Yes, delete</button>
                    <button className="btn g" onClick={() => setConfirmDel(false)}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}
