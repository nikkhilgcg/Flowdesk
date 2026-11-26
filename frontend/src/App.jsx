import { useEffect, useState } from "react";
import { Link, Navigate, NavLink, Outlet, Route, Routes } from "react-router-dom";
import { api } from "./api";
import { useAuth } from "./auth";
import { ROLE_LABEL } from "./lib";
import Bell from "./Bell";
import ThemeToggle from "./ThemeToggle";
import Login from "./Login";
import Register from "./Register";
import People from "./People";
import Board from "./Board";
import Ticket from "./Ticket";

// Shown to someone who has registered but has not been given a role and client yet.
function Waiting({ user }) {
  return (
    <main className="wrap"><div className="empty">
      <h1>Your account is waiting for access</h1>
      <p className="sub">You are signed in as {user.email}. A manager needs to add you to your company (client) before you can see any tickets.</p>
      <button className="btn" onClick={() => window.location.reload()}>Check again</button>
    </div></main>
  );
}

function Shell() {
  const { user, ready, logout } = useAuth();
  const [waiting, setWaiting] = useState(0);
  const mgr = user?.role === "MANAGER" || user?.role === "SUPER_MANAGER";

  // Managers see how many registered people still need a role.
  useEffect(() => { if (mgr) api("/users").then((l) => setWaiting(l.filter((x) => x.pending).length)).catch(() => {}); }, [mgr]);
  if (!ready) return null;
  if (!user) return <Navigate to="/login" replace />;
  return (
    <>
      <header className="top">
        <Link to="/" className="logo"><i />Flowdesk</Link>
        {mgr && (
          <nav className="nav">
            <NavLink to="/" end>Tickets</NavLink>
            <NavLink to="/people">People{waiting > 0 && <span className="tn">{waiting}</span>}</NavLink>
          </nav>
        )}
        <span className="sp" />
        <div className="me">
          <ThemeToggle />
          <Bell />
          <span className="who">{user.name}</span>
          <span className="rl">{ROLE_LABEL[user.role]}{user.client ? ` · ${user.client}` : ""}</span>
          <button className="btn g" onClick={logout}>Sign out</button>
        </div>
      </header>
      {user.pending ? <Waiting user={user} /> : <Outlet />}
    </>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route element={<Shell />}>
        <Route index element={<Board />} />
        <Route path="people" element={<People />} />
        <Route path=":key" element={<Ticket />} />
      </Route>
    </Routes>
  );
}