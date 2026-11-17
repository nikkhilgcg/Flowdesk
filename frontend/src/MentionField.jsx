import { useRef, useState } from "react";
import { ROLE_LABEL, initials } from "./lib";

// A textarea where typing "@" opens a list of people to mention. people: [{ id, name, role }]
export default function MentionField({ id, value, onChange, people, rows = 4, onPaste }) {
  const ref = useRef(null);
  const [q, setQ] = useState(null);
  const [idx, setIdx] = useState(0);
  const matches = q === null ? [] : people.filter((p) => p.name.toLowerCase().includes(q.toLowerCase())).slice(0, 6);

  const track = (el) => {
    const m = /(^|\s)@([^\s@]*)$/.exec(el.value.slice(0, el.selectionStart));
    setQ(m ? m[2] : null);
    setIdx(0);
  };
  const pick = (p) => {
    const pos = ref.current.selectionStart;
    const before = value.slice(0, pos).replace(/@([^\s@]*)$/, "@" + p.name + " ");
    onChange(before + value.slice(pos));
    setQ(null);
    setTimeout(() => { ref.current.focus(); ref.current.setSelectionRange(before.length, before.length); }, 0);
  };
  const keys = (e) => {
    if (!matches.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => (i + 1) % matches.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => (i - 1 + matches.length) % matches.length); }
    else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pick(matches[idx]); }
    else if (e.key === "Escape") { e.stopPropagation(); setQ(null); }
  };

  return (
    <div className="mw">
      <textarea ref={ref} id={id} rows={rows} value={value} onPaste={onPaste} onKeyDown={keys}
        placeholder="Describe the work. Type @ to mention someone"
        onChange={(e) => { onChange(e.target.value); track(e.target); }}
        onClick={(e) => track(e.target)} onBlur={() => setQ(null)} />
      {matches.length > 0 && (
        <div className="mp" role="listbox" aria-label="People you can mention">
          {matches.map((p, i) => (
            <button type="button" key={p.id} role="option" aria-selected={i === idx} className={i === idx ? "on" : ""}
              onMouseDown={(e) => { e.preventDefault(); pick(p); }}>
              <span className="dd-av">{initials(p.name)}</span><span className="mpn">{p.name}</span><small>{ROLE_LABEL[p.role]}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
