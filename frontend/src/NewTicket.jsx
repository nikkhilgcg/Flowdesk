import { useEffect, useRef, useState } from "react";
import { api, imageProblem, uploadImage } from "./api";
import { AuthImage, clipboardImages } from "./Images";
import AddClient from "./AddClient";
import Dropdown from "./Dropdown";
import MentionField from "./MentionField";
import { useAuth } from "./auth";
import { defaultDueInfo } from "./lib";

export default function NewTicket({ onClose, onCreated }) {
  const { user } = useAuth();
  const mgr = user.role === "MANAGER" || user.role === "SUPER_MANAGER";   // managers and super managers pick the assignee and can add clients
  const staff = user.role !== "CLIENT";          // managers and assignees choose the client
  const [meta, setMeta] = useState(null);
  const [f, setF] = useState({ title: "", description: "", priority: "MEDIUM", dueDate: "", clientId: "", assigneeId: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [imgs, setImgs] = useState([]);        // images already uploaded: { id, name }
  const [uploading, setUploading] = useState(0);
  const [drag, setDrag] = useState(false);
  const pick = useRef(null);
  const [people, setPeople] = useState([]);       // who can be @mentioned in the description
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const autoDue = defaultDueInfo(f.priority);   // what the due date becomes if it is left empty

  useEffect(() => {
    if (staff) api("/meta").then((m) => { setMeta(m); setF((s) => ({ ...s, clientId: String(m.clients[0]?.id ?? "") })); });
  }, [staff]);

  useEffect(() => {
    if (staff && !f.clientId) return;
    api(`/mentionable?clientId=${f.clientId}`).then(setPeople).catch(() => setPeople([]));
  }, [staff, f.clientId]);

  // Used by the file picker, paste and drag and drop.
  const addFiles = async (files) => {
    setErr("");
    for (const f of files) {
      const bad = imageProblem(f);
      if (bad) { setErr(bad); continue; }
      if (imgs.length + uploading >= 10) { setErr("A ticket can have up to 10 images"); break; }
      setUploading((n) => n + 1);
      try {
        const a = await uploadImage("/attachments", f);
        setImgs((l) => [...l, { id: a.id, name: f.name || "Pasted image" }]);
      } catch (e) { setErr(e.message); }
      setUploading((n) => n - 1);
    }
  };
  const removeImg = (id) => {
    setImgs((l) => l.filter((x) => x.id !== id));
    api(`/attachments/${id}`, { method: "DELETE" }).catch(() => {});
  };
  const cancel = () => { imgs.forEach((x) => api(`/attachments/${x.id}`, { method: "DELETE" }).catch(() => {})); onClose(); };
  const onPaste = (e) => {
    const files = clipboardImages(e);
    if (!files.length) return;
    if (!e.clipboardData.types.includes("text/plain")) e.preventDefault();   // a screenshot has no text to paste
    addFiles(files);
  };

  const submit = async () => {
    if (!f.title.trim()) { setErr("Title is required"); return; }
    setBusy(true); setErr("");
    try {
      const p = await api("/tickets", {
        method: "POST",
        body: {
          title: f.title, description: f.description, priority: f.priority, dueDate: f.dueDate, attachmentIds: imgs.map((x) => x.id),
          ...(staff ? { clientId: Number(f.clientId) } : {}),
          ...(mgr ? { assigneeId: f.assigneeId ? Number(f.assigneeId) : null } : {}),
        },
      });
      onCreated(p.key);
    } catch (e) { setErr(e.message); setBusy(false); }
  };

  return (
    <div className="ov" onClick={(e) => e.target === e.currentTarget && cancel()}>
      <div className="md" role="dialog" aria-modal="true" aria-label="New ticket">
        <h2>New ticket</h2>
        <label htmlFor="c">Client</label>
        {staff ? (
          <Dropdown id="c" value={f.clientId} onChange={(v) => set("clientId", v)} placeholder="Loading…"
            options={(meta?.clients ?? []).map((c) => ({ value: c.id, label: c.name, sub: c.name === "In house" ? (c.owner ? `Internal work · ${c.owner}` : "Internal work") : c.owner ? `Managed by ${c.owner}` : undefined }))} />
        ) : (<input id="c" value={user.client ?? ""} disabled />)}
        {mgr && (
          <AddClient onAdded={(c) => {
            setMeta((m) => ({ ...m, clients: [...m.clients, c].sort((a, b) => (a.name === "In house" ? -1 : b.name === "In house" ? 1 : a.name.localeCompare(b.name))) }));
            set("clientId", String(c.id));
          }} />
        )}
        <label htmlFor="t">Title</label>
        <input id="t" value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Quarterly filing preparation" autoFocus />
        <label htmlFor="d">Description</label>
        <div
          className={`dz${drag ? " on" : ""}`}
          onDragOver={(e) => { if ([...e.dataTransfer.types].includes("Files")) { e.preventDefault(); setDrag(true); } }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles([...e.dataTransfer.files]); }}
        >
          <MentionField id="d" value={f.description} onChange={(v) => set("description", v)} people={people} onPaste={onPaste} />
          {(imgs.length > 0 || uploading > 0) && (
            <div className="gal sm">
              {imgs.map((x, i) => (
                <div className="gi" key={x.id}>
                  <AuthImage id={x.id} alt={`Image ${i + 1}: ${x.name}`} />
                  <button type="button" className="gx" onClick={() => removeImg(x.id)} aria-label={`Remove image ${i + 1}`}>×</button>
                </div>
              ))}
              {Array.from({ length: uploading }, (_, i) => <div className="gi up" key={"u" + i}><span className="imgph" aria-busy="true">Uploading…</span></div>)}
            </div>
          )}
          <div className="attbar">
            <button type="button" className="lnk" onClick={() => pick.current.click()}>Add image</button>
            <span>or paste a screenshot, or drop a file here</span>
            <input ref={pick} type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple hidden
              onChange={(e) => { addFiles([...e.target.files]); e.target.value = ""; }} />
          </div>
        </div>
        <div className="two">
          <div>
            <label htmlFor="p">Priority</label>
            <Dropdown id="p" value={f.priority} onChange={(v) => set("priority", v)}
              options={[{ value: "HIGH", label: "High" }, { value: "MEDIUM", label: "Medium" }, { value: "LOW", label: "Low" }]} />
          </div>
          <div>
            <label htmlFor="du">Due date <span className="opt">(optional)</span></label>
            <input id="du" type="date" value={f.dueDate} onChange={(e) => set("dueDate", e.target.value)} />
            {!f.dueDate && <div className="fh">Not set: it will be due {autoDue.text}.</div>}
          </div>
        </div>
        {mgr && (
          <>
            <label htmlFor="a">Assignee</label>
            <Dropdown id="a" value={f.assigneeId} onChange={(v) => set("assigneeId", v)}
              options={[{ value: "", label: "Unassigned" }, ...(meta?.assignees ?? []).map((a) => ({ value: a.id, label: a.name, person: true }))]} />
          </>
        )}
        <p className="hint">The ID and created time are generated automatically. You can change the due date later from the ticket.{user.role === "ASSIGNEE" && " The ticket is assigned to you."}</p>
        {err && <div className="err" role="alert">{err}</div>}
        <div className="acts end">
          <button className="btn g" onClick={cancel}>Cancel</button>
          <button className="btn" onClick={submit} disabled={busy || uploading > 0}>Create ticket</button>
        </div>
      </div>
    </div>
  );
}