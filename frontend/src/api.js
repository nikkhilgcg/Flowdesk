const KEY = "fd_token";
export const getToken = () => localStorage.getItem(KEY);
export const setToken = (t) => (t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY));

export async function api(path, { method = "GET", body } = {}) {
  const token = getToken();
  const res = await fetch("/api" + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== "/auth/login") {
    setToken(null);
    window.location.href = "/login";
  }
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

// ---- attachments: images, PDF, Word and Excel ----
export const IMG_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
export const FILE_EXTS = ["pdf", "doc", "docx", "xls", "xlsx"];
export const ACCEPT = [...IMG_TYPES, ...FILE_EXTS.map((e) => "." + e)].join(",");
export const MAX_IMG = 8 * 1024 * 1024;
export const MAX_FILE = 10 * 1024 * 1024;
const extOf = (n = "") => (n.match(/\.([a-z0-9]+)$/i)?.[1] ?? "").toLowerCase();

// Sends the raw file (not JSON). Images keep their own type; documents go as application/octet-stream
// with the file name in a header. Returns the saved attachment.
export async function uploadFile(path, file) {
  const image = IMG_TYPES.includes(file.type);
  const res = await fetch("/api" + path, {
    method: "POST",
    headers: {
      "Content-Type": image ? file.type : "application/octet-stream",
      "X-File-Name": encodeURIComponent(file.name || (image ? "image" : "file")),
      Authorization: "Bearer " + getToken(),
    },
    body: file,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { setToken(null); window.location.href = "/login"; }
  if (!res.ok) throw new Error(data.error || "Upload failed");
  return data;
}

// Images need the login token, so they are fetched and shown from a local blob URL.
export async function fetchImageUrl(id) {
  const res = await fetch(`/api/attachments/${id}`, { headers: { Authorization: "Bearer " + getToken() } });
  if (!res.ok) throw new Error("Image not available");
  return URL.createObjectURL(await res.blob());
}

// Documents are fetched with the token too, then saved through a temporary link.
export async function downloadAttachment(id, name) {
  const res = await fetch(`/api/attachments/${id}`, { headers: { Authorization: "Bearer " + getToken() } });
  if (!res.ok) throw new Error("File not available");
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = name || "file";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const fmtSize = (n = 0) => (n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`);

// Returns an error message for a file we cannot accept, or "" when it is fine.
export const fileProblem = (f) => {
  const label = f.name || "That file";
  if (IMG_TYPES.includes(f.type)) return f.size > MAX_IMG ? `${label} is larger than 8 MB` : "";
  if (!FILE_EXTS.includes(extOf(f.name))) return `${label} can't be added. Use an image, PDF, Word or Excel file`;
  return f.size > MAX_FILE ? `${label} is larger than 10 MB` : "";
};