import { useEffect, useState } from "react";
import { fetchImageUrl } from "./api";

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
