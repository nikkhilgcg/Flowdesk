import { useMemo } from "react";

// Faded wall of sample tickets behind the sign-in card. Purely decorative (hidden from screen readers).
const TAGS = {
  Bug: ["#f4dcd5", "#8f3a28"], Feature: ["#d8eadf", "#064e3b"], Task: ["#eceeea", "#5d6b64"],
  Design: ["#dde9f4", "#2f5a86"], Security: ["#f6e9cc", "#8a6516"], Docs: ["#e8e1f3", "#5b3f8c"],
};
const PRI = { H: ["▲", "#c4553f"], M: ["■", "#d4a037"], L: ["▼", "#4a7fb5"] };
const AV = ["#064e3b", "#4a7fb5", "#d4a037", "#c4553f", "#7b6aa8", "#5d6b64"];
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
