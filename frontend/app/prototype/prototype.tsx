"use client";

import { useEffect, useState } from "react";
import {
  addSource,
  applyDefault,
  initialState,
  lateSource,
  nextActions,
  type PrototypeState,
} from "./state";
import { client } from "./client";
import Journey from "./journey";
import { Clients, NewOnboarding, Portal, Process, Requirements } from "./pages";
import type { Ctx, View } from "./ui";

const views: View[] = [
  "clients",
  "new",
  "journey",
  "spec",
  "process",
  "portal",
];
const clientNav: { view: View; label: string; icon: string }[] = [
  { view: "journey", label: "Journey", icon: "→" },
  { view: "spec", label: "Requirements", icon: "◇" },
  { view: "process", label: "Process and export", icon: "↻" },
];
const crumb: Record<string, string> = {
  clients: "Clients",
  new: "New onboarding",
  journey: "Journey",
  spec: "Requirements",
  process: "Process and export",
};

export default function Prototype() {
  const [view, setView] = useState<View>("clients");
  const [state, setState] = useState<PrototypeState>(initialState);
  const [focusFact, setFocusFact] = useState("");
  const [portalRole, setPortalRole] = useState("Operations lead");
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
    setPortalRole,
    setFocusFact,
  };

  if (view === "portal")
    return (
      <Portal
        key={resets}
        ctx={ctx}
        role={portalRole}
        setRole={setPortalRole}
      />
    );

  const lateAdded = state.addedSources.includes(lateSource.id);
  const petsSent =
    state.questions.find((q) => q.id === "q-pets")?.status === "Sent";
  const waiting = nextActions(state).length;

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
          className={`v2-side-link ${view === "clients" || view === "new" ? "active" : ""}`}
          onClick={() => go("clients")}
        >
          <span>▦</span> Clients
        </button>
        {view !== "new" && (
          <>
            <div className="v2-side-section">{client.name}</div>
            {clientNav.map((item) => (
              <button
                key={item.view}
                className={`v2-side-link ${view === item.view ? "active" : ""}`}
                onClick={() => go(item.view)}
              >
                <span>{item.icon}</span> {item.label}
                {item.view === "journey" && waiting > 0 && <b>{waiting}</b>}
              </button>
            ))}
          </>
        )}
        <div className="v2-sidebar-bottom">
          <span className="v2-avatar">AM</span>
          <div>
            <strong>{client.owner}</strong>
            <small>Implementation specialist</small>
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
            <button onClick={() => go("clients")}>Clients</button>
            {view !== "clients" && view !== "new" && (
              <>
                <span>/</span>
                <span>{client.name}</span>
              </>
            )}
            {view !== "clients" && (
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
          {view === "clients" && <Clients ctx={ctx} />}
          {view === "new" && (
            <NewOnboarding
              ctx={ctx}
              onCreate={() => {
                setWelcome(true);
                go("journey");
              }}
            />
          )}
          {view === "journey" && (
            <Journey
              ctx={ctx}
              welcome={welcome}
              dismissWelcome={() => setWelcome(false)}
            />
          )}
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
              disabled={lateAdded}
              onClick={() => {
                setState(addSource);
                setToast(
                  "A late email arrived. Two gaps were filled and the earlier consistency check is now out of date.",
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
