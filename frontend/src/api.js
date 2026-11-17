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

// ---- images ----
export const IMG_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
export const MAX_IMG = 8 * 1024 * 1024;

// Sends the raw image (not JSON). Returns the saved attachment.
export async function uploadImage(path, file) {
  const res = await fetch("/api" + path, {
    method: "POST",
    headers: { "Content-Type": file.type, Authorization: "Bearer " + getToken() },
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

// Returns an error message for a file we cannot accept, or "" when it is fine.
export const imageProblem = (f) =>
  !IMG_TYPES.includes(f.type) ? `${f.name || "That file"} is not a PNG, JPEG, GIF or WebP image` :
  f.size > MAX_IMG ? `${f.name || "That image"} is larger than 8 MB` : "";
