"use client";

import { useEffect, useState } from "react";
import {
  LATE_ID,
  addSource,
  applyDefault,
  assignments,
  createClient,
  initialState,
  type Client,
  type PrototypeState,
} from "./state";
import Journey from "./journey";
import {
  Assignments,
  Dashboard,
  Login,
  NewOnboarding,
  Portal,
  Process,
  Requirements,
} from "./pages";
import type { Ctx, View } from "./ui";

const views: View[] = [
  "login",
  "dashboard",
  "new",
  "journey",
  "spec",
  "assignments",
  "process",
  "portal",
];
const crumb: Record<string, string> = {
  dashboard: "Dashboard",
  new: "New onboarding",
  journey: "Journey",
  spec: "Requirements",
  assignments: "Assignments",
  process: "Process and export",
};

export default function Prototype() {
  const [signedIn, setSignedIn] = useState(false);
  const [view, setView] = useState<View>("login");
  const [state, setState] = useState<PrototypeState>(initialState);
  const [focusFact, setFocusFact] = useState("");
  const [portalName, setPortalName] = useState("");
  const [welcome, setWelcome] = useState(false);
  const [toast, setToast] = useState("");
  const [menu, setMenu] = useState(false);
  const [tray, setTray] = useState(false);
  const [resets, setResets] = useState(0);

  useEffect(() => {
    const read = () => {
      const route = window.location.hash.slice(1) as View;
      if (views.includes(route)) {
        setView(route);
        setToast("");
      }
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  useEffect(() => {
    if (view === "spec" && focusFact)
      document
        .getElementById(`fact-${focusFact}`)
        ?.scrollIntoView({ block: "center" });
  }, [view, focusFact]);

  const go = (next: View) => {
    setView(next);
    window.history.replaceState(null, "", `#${next}`);
    setMenu(false);
    setToast("");
    window.scrollTo(0, 0);
  };
  const ctx: Ctx = {
    state,
    update: setState,
    flash: setToast,
    go,
    setPortalRole: setPortalName,
    setFocusFact,
  };

  if (!signedIn || view === "login")
    return (
      <Login
        onSignIn={() => {
          setSignedIn(true);
          go("dashboard");
        }}
      />
    );

  // Customer-side pages need a client; send everyone else back to the dashboard.
  const needsClient = [
    "journey",
    "spec",
    "assignments",
    "process",
    "portal",
  ].includes(view);
  if (needsClient && !state.client)
    return (
      <Shell>
        <div className="v2-empty">
          <h1>Start an onboarding first.</h1>
          <p>This page appears after you create a client.</p>
          <button onClick={() => go("new")}>New onboarding</button>
        </div>
      </Shell>
    );

  if (view === "portal")
    return (
      <Portal
        key={resets}
        ctx={ctx}
        name={portalName}
        setName={setPortalName}
      />
    );

  const lateAdded = state.addedSources.includes(LATE_ID);
  const petsSent =
    state.questions.find((q) => q.id === "q-pets")?.status === "Sent";
  const waiting = assignments(state).filter((a) => a.side === "team").length;

  function Shell({ children }: { children: React.ReactNode }) {
    return (
      <div className="v2-app">
        <main className="v2-content">{children}</main>
      </div>
    );
  }

  function create(client: Client) {
    setState((s) => createClient(s, client));
    setWelcome(true);
    go("journey");
  }

  return (
    <div className="v2-app">
      <aside className={`v2-sidebar ${menu ? "open" : ""}`}>
        <div className="v2-logo">
          <div className="v2-logo-icon">so</div>
          <div>
            <strong>super onboard</strong>
            <small>Requirements · Config · Tests</small>
          </div>
        </div>
        <button
          className={`v2-side-link ${view === "dashboard" || view === "new" ? "active" : ""}`}
          onClick={() => go("dashboard")}
        >
          <span>▦</span> Dashboard
        </button>
        {state.client && view !== "new" && (
          <>
            <div className="v2-side-section">{state.client.name}</div>
            <button
              className={`v2-side-link ${view === "journey" ? "active" : ""}`}
              onClick={() => go("journey")}
            >
              <span>→</span> Journey {waiting > 0 && <b>{waiting}</b>}
            </button>
            <button
              className={`v2-side-link ${view === "assignments" ? "active" : ""}`}
              onClick={() => go("assignments")}
            >
              <span>☷</span> Assignments
            </button>
            <button
              className={`v2-side-link ${view === "spec" ? "active" : ""}`}
              onClick={() => go("spec")}
            >
              <span>◇</span> Requirements
            </button>
            <button
              className={`v2-side-link ${view === "process" ? "active" : ""}`}
              onClick={() => go("process")}
            >
              <span>↻</span> Process and export
            </button>
          </>
        )}
        <div className="v2-sidebar-bottom">
          <span className="v2-avatar">AM</span>
          <div>
            <strong>Avery Morgan</strong>
            <button
              className="v2-link"
              onClick={() => {
                setSignedIn(false);
                go("login");
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      </aside>
      <div className="v2-main-wrap">
        <header className="v2-topbar">
          <button
            className="v2-mobile-menu"
            aria-label="Open navigation"
            onClick={() => setMenu(!menu)}
          >
            ☰
          </button>
          <div className="v2-breadcrumb">
            <button onClick={() => go("dashboard")}>Dashboard</button>
            {view !== "dashboard" && view !== "new" && state.client && (
              <>
                <span>/</span>
                <span>{state.client.name}</span>
              </>
            )}
            {view !== "dashboard" && (
              <>
                <span>/</span>
                <strong>{crumb[view]}</strong>
              </>
            )}
          </div>
          <div className="v2-top-meta">
            <span className="v2-live-dot" /> Simulated prototype · fictional
            data
          </div>
        </header>
        <main className="v2-content" key={resets}>
          {toast && (
            <div className="v2-toast" role="status">
              {toast}
              <button aria-label="Dismiss message" onClick={() => setToast("")}>
                ×
              </button>
            </div>
          )}
          {view === "dashboard" && <Dashboard ctx={ctx} />}
          {view === "new" && <NewOnboarding ctx={ctx} onCreate={create} />}
          {view === "journey" && (
            <Journey
              ctx={ctx}
              welcome={welcome}
              dismissWelcome={() => setWelcome(false)}
            />
          )}
          {view === "assignments" && <Assignments ctx={ctx} />}
          {view === "spec" && <Requirements ctx={ctx} focusFact={focusFact} />}
          {view === "process" && <Process ctx={ctx} />}
        </main>
      </div>

      <div className="v2-demo">
        {tray && (
          <div
            className="v2-demo-panel"
            role="region"
            aria-label="Demo controls"
          >
            <strong>Demo controls</strong>
            <p>These simulate things that happen outside the app.</p>
            <button
              className="v2-button secondary"
              disabled={lateAdded || !state.client}
              onClick={() => {
                setState(addSource);
                setToast(
                  "A late email arrived from the customer. It was read into the spec and the earlier contradiction check is now out of date.",
                );
              }}
            >
              {lateAdded ? "Late email received" : "A late email arrives"}
            </button>
            <button
              className="v2-button secondary"
              disabled={!petsSent}
              onClick={() => {
                setState((s) => applyDefault(s, "q-pets"));
                setToast(
                  "Deadline passed with no reply: proceeding on the default and flagging it as unconfirmed.",
                );
              }}
            >
              Deadline passes with no reply
            </button>
            <button
              className="v2-button secondary"
              onClick={() => {
                setState(initialState);
                setResets((r) => r + 1);
                setWelcome(false);
                go("dashboard");
                setToast("Demo reset to the starting state.");
              }}
            >
              Reset demo
            </button>
          </div>
        )}
        <button
          className="v2-demo-toggle"
          onClick={() => setTray(!tray)}
          aria-expanded={tray}
        >
          ◐ Demo controls
        </button>
      </div>
    </div>
  );
}
