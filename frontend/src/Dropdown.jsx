import { useEffect, useId, useRef, useState } from "react";
import { initials } from "./lib";

// A styled replacement for <select>. options: [{ value, label, sub?, person?, disabled? }]
// person: true shows an initials avatar (used for assignees). Keyboard: arrows, Home/End, Enter, Esc, type to jump.
export default function Dropdown({ id, value, onChange, options, placeholder = "Select…", ariaLabel, disabled, className = "" }) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const root = useRef(null);
  const list = useRef(null);
  const uid = useId();
  const cur = options.find((o) => String(o.value) === String(value));

  useEffect(() => {
    if (!open) return;
    const away = (e) => { if (!root.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);
  useEffect(() => { list.current?.querySelector(".hi")?.scrollIntoView({ block: "nearest" }); }, [hi, open]);

  const show = () => {
    if (disabled) return;
    setHi(Math.max(0, options.findIndex((o) => String(o.value) === String(value))));
    setOpen(true);
  };
  const choose = (o) => { if (o.disabled) return; onChange(String(o.value)); setOpen(false); root.current.querySelector("button").focus(); };
  const step = (d) => {
    let i = hi;
    for (let n = 0; n < options.length; n++) { i = (i + d + options.length) % options.length; if (!options[i].disabled) break; }
    setHi(i);
  };
  const keys = (e) => {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) { e.preventDefault(); show(); }
      return;
    }
    if (e.key === "ArrowDown") { e.preventDefault(); step(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); step(-1); }
    else if (e.key === "Home") { e.preventDefault(); setHi(0); }
    else if (e.key === "End") { e.preventDefault(); setHi(options.length - 1); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(options[hi]); }
    else if (e.key === "Escape") { e.stopPropagation(); setOpen(false); }
    else if (e.key === "Tab") setOpen(false);
    else if (e.key.length === 1) {
      const i = options.findIndex((o) => String(o.label).toLowerCase().startsWith(e.key.toLowerCase()));
      if (i >= 0) setHi(i);
    }
  };

  return (
    <div className={`dd ${className}`} ref={root}>
      <button type="button" id={id} className={`dd-btn${open ? " open" : ""}`} disabled={disabled} aria-label={ariaLabel}
        aria-haspopup="listbox" aria-expanded={open} aria-controls={uid}
        onClick={() => (open ? setOpen(false) : show())} onKeyDown={keys}>
        {cur?.person && <span className="dd-av">{initials(cur.label)}</span>}
        <span className={`dd-val${cur ? "" : " ph"}`}>{cur ? cur.label : placeholder}</span>
        <svg className="dd-car" width="14" height="14" viewBox="0 0 20 20" aria-hidden="true"><path d="M5 7.5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open && (
        <ul className="dd-list" id={uid} role="listbox" ref={list}>
          {options.map((o, i) => {
            const sel = String(o.value) === String(value);
            return (
              <li key={o.value} role="option" aria-selected={sel} aria-disabled={o.disabled || undefined}
                className={`${i === hi ? "hi " : ""}${sel ? "sel " : ""}${o.disabled ? "dis" : ""}`}
                onMouseEnter={() => setHi(i)} onMouseDown={(e) => { e.preventDefault(); choose(o); }}>
                {o.person && <span className="dd-av">{initials(o.label)}</span>}
                <span className="dd-lb">{o.label}{o.sub && <small>{o.sub}</small>}</span>
                {sel && <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true"><path d="M4.5 10.5l4 4 7-8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
