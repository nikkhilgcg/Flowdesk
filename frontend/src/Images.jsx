import { useEffect, useState } from "react";
import { downloadAttachment, fetchImageUrl, fmtSize } from "./api";

// An image stored on a ticket. Loaded with the login token, shown from a blob URL.
export function AuthImage({ id, alt, className }) {
  const [src, setSrc] = useState(null);
  const [bad, setBad] = useState(false);
  useEffect(() => {
    let url, live = true;
    setSrc(null); setBad(false);
    fetchImageUrl(id).then((u) => { url = u; live ? setSrc(u) : URL.revokeObjectURL(u); }).catch(() => live && setBad(true));
    return () => { live = false; if (url) URL.revokeObjectURL(url); };
  }, [id]);
  if (bad) return <span className="imgph">Image unavailable</span>;
  if (!src) return <span className="imgph" aria-busy="true" />;
  return <img className={className} src={src} alt={alt} />;
}

// Full-size view. Click outside, press Esc, or use the close button.
export function Lightbox({ id, onClose }) {
  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="lb" role="dialog" aria-modal="true" aria-label="Image" onClick={onClose}>
      <button className="lbx" onClick={onClose} aria-label="Close image">×</button>
      <div onClick={(e) => e.stopPropagation()}><AuthImage id={id} alt="Attachment, full size" /></div>
    </div>
  );
}

// Images on the clipboard (screenshots, copied pictures). Ignores plain text paste.
export const clipboardImages = (e) => [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));

// ---- files (PDF, Word, Excel) ----
export const isImg = (a) => (a?.mime ?? "").startsWith("image/");
const kindOf = (mime = "") =>
  mime === "application/pdf" ? "pdf" :
  mime.includes("word") ? "doc" :
  mime.includes("excel") || mime.includes("spreadsheet") ? "xls" : "file";
const KIND_TAG = { pdf: "PDF", doc: "DOC", xls: "XLS", file: "FILE" };

// A document on a ticket or comment. Click it to download. `onRemove` shows a remove button.
export function FileChip({ file, onRemove }) {
  const [state, setState] = useState("");   // "", "busy" or "bad"
  const kind = kindOf(file.mime);
  const label = file.name || "File";
  const open = async () => {
    setState("busy");
    try { await downloadAttachment(file.id, file.name); setState(""); } catch { setState("bad"); }
  };
  return (
    <div className="fl">
      <button type="button" className="flb" onClick={open} title={`Download ${label}`} aria-label={`Download ${label}`}>
        <span className={`fli ${kind}`} aria-hidden="true">{KIND_TAG[kind]}</span>
        <span className="flt">
          <b>{label}</b>
          <small>{state === "bad" ? "Download failed. Try again" : state === "busy" ? "Downloading…" : fmtSize(file.size)}</small>
        </span>
      </button>
      {onRemove && <button type="button" className="flx" onClick={onRemove} aria-label={`Remove ${label}`}>×</button>}
    </div>
  );
}