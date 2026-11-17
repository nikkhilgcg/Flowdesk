import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "./api";
import { initials } from "./lib";

function ago(d) {
  const s = Math.max(1, Math.floor((Date.now() - new Date(d).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function Bell() {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState({ unread: 0, items: [] });
  const box = useRef(null);

  const load = useCallback(() => { api("/notifications").then(setData).catch(() => {}); }, []);
  useEffect(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, [load]);
  useEffect(() => {
    if (!open) return;
    load();
    const onDoc = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open, load]);

  const go = async (n) => {
    setOpen(false);
    if (!n.readAt) await api(`/notifications/${n.id}/read`, { method: "POST" }).catch(() => {});
    load();
    nav(`/${n.key}`);
  };
  const readAll = async () => { await api("/notifications/read-all", { method: "POST" }).catch(() => {}); load(); };

  return (
    <div className="bellw" ref={box}>
      <button className="bell" onClick={() => setOpen(!open)} aria-label={`Notifications, ${data.unread} unread`} aria-expanded={open}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {data.unread > 0 && <span className="cnt">{data.unread > 9 ? "9+" : data.unread}</span>}
      </button>
      {open && (
        <div className="np" role="dialog" aria-label="Notifications">
          <div className="nph">
            <b>Notifications</b>
            <button className="lnk" onClick={readAll} disabled={data.unread === 0}>Mark all as read</button>
          </div>
          {data.items.length === 0 && <div className="empty small">You’re all caught up.</div>}
          <div className="nl">
            {data.items.map((n) => (
              <button key={n.id} className={`ni${n.readAt ? "" : " un"}`} onClick={() => go(n)}>
                <span className="av">{initials(n.actor)}</span>
                <span className="nb">
                  <span><b>{n.actor}</b> mentioned you in <b>{n.key}</b></span>
                  {n.text && <span className="nt">“{n.text}”</span>}
                  <small>{ago(n.createdAt)}</small>
                </span>
                {!n.readAt && <i className="dot" aria-label="Unread" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
