import { useMemo } from "react";

// Faded wall of sample tickets behind the sign-in card. Purely decorative (hidden from screen readers).
const TAGS = {
  Bug: ["#fdecec", "#b42324"], Feature: ["#e8eeff", "#1e45d6"], Task: ["#e9edf7", "#4b5873"],
  Design: ["#e1f3fa", "#0b6a8a"], Security: ["#fff1d6", "#8a5a00"], Docs: ["#ede7ff", "#47329e"],
};
const PRI = { H: ["▲", "#e5484d"], M: ["■", "#e0a100"], L: ["▼", "#2f5bff"] };
const AV = ["#1e45d6", "#2f5bff", "#0e7490", "#e5484d", "#7c5ce0", "#5b6785"];
const INITIALS = ["AL", "RM", "JP", "NK", "SK", "TD"];
const T = [
  ["Fix login timeout on mobile", "Bug", "H"], ["Add due dates to subtasks", "Feature", "M"], ["Write onboarding guide for admins", "Docs", "L"],
  ["Review role permissions for contractors", "Security", "H"], ["Redesign empty state for new projects", "Design", "L"], ["Speed up board loading", "Task", "M"],
  ["Bulk-assign tickets from list view", "Feature", "M"], ["Sprint velocity chart is off by a day", "Bug", "H"], ["Weekly summary email", "Feature", "L"],
  ["Archive closed projects", "Task", "L"], ["Invite teammates by link", "Feature", "M"], ["Keyboard shortcuts for the board", "Feature", "L"],
  ["SSO with Google Workspace", "Security", "M"], ["Duplicate tickets on slow networks", "Bug", "H"], ["Dark mode for ticket detail", "Design", "L"],
  ["Notifications for @mentions", "Feature", "M"],
];

function Ticket({ i }) {
  const [title, tag, p] = T[i % T.length];
  const [bg, fg] = TAGS[tag];
  const [sym, col] = PRI[p];
  const n = (i * 7) % 6;
  return (
    <div className="tk">
      <p>{title}</p>
      <div className="tk-row">
        <span className="tk-key">FD-{120 + ((i * 13) % 260)}</span>
        <span className="tk-tag" style={{ background: bg, color: fg }}>{tag}</span>
        <span className="tk-pri" style={{ color: col }}>{sym}</span>
        <span className="tk-av" style={{ background: AV[n] }}>{INITIALS[n]}</span>
      </div>
    </div>
  );
}

export default function LoginBackground() {
  const cols = useMemo(
    () => Array.from({ length: 8 }, (_, c) => {
      const set = Array.from({ length: 8 }, (_, k) => c * 3 + k * 5);
      return { offset: (c * 37) % 160, set: [...set, ...set] };   // list twice so the slow drift loops seamlessly
    }),
    []
  );
  return (
    <div className="tk-bg" aria-hidden="true">
      <div className="tk-field">
        {cols.map((c, ci) => (
          <div className="tk-col" key={ci}>
            <div className="tk-track" style={{ marginTop: -c.offset }}>
              {c.set.map((i, k) => <Ticket i={i} key={k} />)}
            </div>
          </div>
        ))}
      </div>
      <div className="tk-veil" />
    </div>
  );
}