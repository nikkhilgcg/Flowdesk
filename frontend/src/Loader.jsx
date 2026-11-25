import "./filters.css";   // loader styles (.ld)

// Round loader shown while a page waits for its data: a comet ring orbiting a pulsing core.
// It fades in after a short moment, so quick loads do not flash.
export default function Loader({ label = "Loading" }) {
  return (
    <div className="ld" role="status" aria-live="polite">
      <div className="ld-ring" aria-hidden="true">
        <span className="ld-arc" />
        <span className="ld-orb" />
        <span className="ld-in" />
        <span className="ld-core" />
      </div>
      <div className="ld-txt">{label}<span className="ld-dots" aria-hidden="true"><i /><i /><i /></span></div>
    </div>
  );
}