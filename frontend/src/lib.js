export const STATUSES = [
  { key: "TODO", label: "To Do", css: "todo" },
  { key: "IN_PROGRESS", label: "In Progress", css: "prog" },
  { key: "IN_REVIEW", label: "In Review", css: "review" },
  { key: "APPROVED", label: "Approved", css: "done" },
];
export const SL = Object.fromEntries(STATUSES.map((s) => [s.key, s]));
export const PRIO = {
  HIGH: { label: "High", css: "high" },
  MEDIUM: { label: "Medium", css: "med" },
  LOW: { label: "Low", css: "low" },
};
export const ROLE_LABEL = { SUPER_MANAGER: "Super Manager", MANAGER: "Manager", ASSIGNEE: "Employee", CLIENT: "Client" };

export const fmt = (d) =>
  new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
export const fdate = (d) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "No due date";
export function dueText(d, done) {
  if (!d) return { text: "No due date", css: "" };
  if (done) return { text: `Completed · was due ${fdate(d)}`, css: "" };
  const a = new Date(d), b = new Date();
  const days = Math.round((new Date(a.getFullYear(), a.getMonth(), a.getDate()) - new Date(b.getFullYear(), b.getMonth(), b.getDate())) / 86400000);
  const n = (x) => `${x} day${x === 1 ? "" : "s"}`;
  if (days > 1) return { text: `Due in ${n(days)}`, css: days <= 2 ? "soon" : "" };
  if (days === 1) return { text: "Due tomorrow", css: "soon" };
  if (days === 0) return { text: "Due today", css: "soon" };
  return { text: `Overdue by ${n(-days)}`, css: "late" };
}
export const initials = (n) => n.split(" ").map((x) => x[0]).join("").slice(0, 2).toUpperCase();

export function scopeText(u) {
  if (u.role === "SUPER_MANAGER") return { title: "All tickets", sub: "You can see and manage every ticket of every client, manager and employee. Create, edit, assign, approve and delete from any ticket." };
  if (u.role === "MANAGER") return { title: "All tickets", sub: "You can see every client’s tickets. Approve, reject and assign from each ticket." };
  if (u.role === "ASSIGNEE") return { title: "My assigned tickets", sub: "Tickets assigned to you, or where someone mentioned you, across clients." };
  return { title: `${u.client} tickets`, sub: `Private to ${u.client}. Tickets of other clients are never visible to you.` };
}
// Used when a ticket is created without a due date (the server applies the same rule).
export const DEFAULT_DUE_DAYS = { HIGH: 2, MEDIUM: 4, LOW: 7 };
export function defaultDueInfo(priority) {
  const n = DEFAULT_DUE_DAYS[priority] ?? 4;
  const d = new Date(); d.setDate(d.getDate() + n);
  const label = n === 7 ? "1 week" : `${n} days`;
  return { days: n, text: `${d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} (${label} from today)` };
}
