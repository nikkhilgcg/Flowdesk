export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Wraps an async route so thrown errors reach the error handler.
export const h = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// A person who registered themselves and has not been given a role and client yet.
// They are CLIENT users with no client, so the visibility rules show them nothing until a manager sets them up.
export const isPending = (u) => u.role === "CLIENT" && !u.clientId;

export const publicUser = (u) => ({
  id: u.id, name: u.name, email: u.email, role: u.role, client: u.client?.name ?? null, pending: isPending(u),
});

// Small in-memory limiter per IP (fine for one server; use a shared store if you run several).
export const limit = (max, windowMs) => {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const recent = (hits.get(req.ip) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= max) return res.status(429).json({ error: "Too many attempts. Please try again in a few minutes" });
    recent.push(now);
    hits.set(req.ip, recent);
    if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
    next();
  };
};
