"use client";

import { useEffect, useState } from "react";
import {
  assignments,
  createClient,
  initialState,
  type Client,
  type PrototypeState,
} from "./state";
import { diffActivity } from "./activity";
import { tabLabels, tabOrder, type Ctx, type View } from "./ui";
import type { Tab } from "./plan";
import Workspace from "./workspace";
import { TeamPage } from "./team";
import { TryIt } from "./tryit";
import { tryItSteps } from "./demo";
import { Clients, Inbox, Login, NewOnboarding, Portal } from "./pages";

const simpleViews: View[] = [
  "login",
  "inbox",
  "clients",
  "new",
  "team",
  "portal",
];

function parseHash(): { view: View; tab: Tab } | null {
  const h = window.location.hash.slice(1);
  if (h.startsWith("client")) {
    const t = h.split("/")[1] as Tab;
    return { view: "client", tab: tabOrder.includes(t) ? t : "plan" };
  }
  return simpleViews.includes(h as View)
    ? { view: h as View, tab: "plan" }
    : null;
}

export default function Prototype() {
  const [signedIn, setSignedIn] = useState(false);
  const [view, setView] = useState<View>("login");
  const [tab, setTab] = useState<Tab>("plan");
  const [state, setState] = useState<PrototypeState>(initialState);
  const [portalName, setPortalName] = useState("");
  const [welcome, setWelcome] = useState(false);
  const [toast, setToast] = useState("");
  const [menu, setMenu] = useState(false);
  const [tray, setTray] = useState(false);
  const [guide, setGuide] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [resets, setResets] = useState(0);

  useEffect(() => {
    const read = () => {
      const r = parseHash();
      if (r) {
        setView(r.view);
        setTab(r.tab);
        setToast("");
      }
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  const go = (next: View, nextTab: Tab = "plan") => {
    setView(next);
    setTab(nextTab);
    window.history.replaceState(
      null,
      "",
      next === "client" ? `#client/${nextTab}` : `#${next}`,
    );
    setMenu(false);
    setToast("");
    window.scrollTo(0, 0);
  };
  // Every update goes through diffActivity, so the activity feed needs no help from the actions.
  const update: Ctx["update"] = (fn) =>
    setState((prev) => diffActivity(prev, fn(prev)));
  const ctx: Ctx = { state, update, flash: setToast, go, setPortalName };

  if (!signedIn || view === "login")
    return (
      <Login
        onSignIn={() => {
          setSignedIn(true);
          setGuide(true);
          setGuideOpen(true);
          go("inbox");
        }}
      />
    );

  const needsClient = view === "client" || view === "portal";
  const client = state.client;

  if (view === "portal" && client)
    return (
      <Portal
        key={resets}
        ctx={ctx}
        name={portalName}
        setName={setPortalName}
      />
    );

  const guideSteps = tryItSteps(state).filter((x) => !x.optional);
  const guideDone = guideSteps.filter((x) => x.done).length;
  const guideTotal = guideSteps.length;
  const teamOpen = assignments(state).filter((a) => a.side === "team").length;

  return (
    <div className="v3 v3-app">
      {menu && (
        <div
          className="v3-backdrop"
          onClick={() => setMenu(false)}
          aria-hidden
        />
      )}
      <aside className={`v3-sidebar ${menu ? "open" : ""}`}>
        <button
          className="v3-menuclose"
          aria-label="Close navigation"
          onClick={() => setMenu(false)}
        >
          ×
        </button>
        <div className="v3-brand">
          <i className="v3-logo-tile">so</i>
          <span>
            <strong>super onboard</strong>
            <small>Requirements · Clarifications</small>
          </span>
        </div>
        <button
          className={`v3-nav ${view === "inbox" ? "active" : ""}`}
          onClick={() => go("inbox")}
        >
          <span className="ic">✉</span> Inbox{" "}
          {teamOpen > 0 && <b>{teamOpen}</b>}
        </button>
        <button
          className={`v3-nav ${view === "clients" || view === "new" ? "active" : ""}`}
          onClick={() => go("clients")}
        >
          <span className="ic">▦</span> Clients
        </button>
        {client && (
          <button
            className={`v3-nav sub ${view === "client" ? "active" : ""}`}
            onClick={() => go("client", "plan")}
          >
            <span className="ic">◆</span> {client.name}
          </button>
        )}
        <button
          className={`v3-nav ${view === "team" ? "active" : ""}`}
          onClick={() => go("team")}
        >
          <span className="ic">☷</span> Team
        </button>
        <div className="v3-userbox">
          <Avatar2 />
          <span>
            <strong>Avery Morgan</strong>
            <button
              className="v3-link"
              onClick={() => {
                setSignedIn(false);
                go("login");
              }}
            >
              Sign out
            </button>
          </span>
        </div>
      </aside>
      <div className="v3-main">
        <header className="v3-topbar">
          <button
            className="v3-menu"
            aria-label="Open navigation"
            onClick={() => setMenu(!menu)}
          >
            ☰
          </button>
          <div className="v3-crumbs">
            {(view === "clients" || view === "client" || view === "new") && (
              <button onClick={() => go("clients")}>Clients</button>
            )}
            {view === "client" && client && (
              <>
                <span>/</span>
                <button onClick={() => go("client", "plan")}>
                  {client.name}
                </button>
                <span>/</span>
                <strong>{tabLabels[tab]}</strong>
              </>
            )}
            {view === "new" && (
              <>
                <span>/</span>
                <strong>New onboarding</strong>
              </>
            )}
            {view === "inbox" && <strong>Inbox</strong>}
            {view === "team" && <strong>Team</strong>}
          </div>
          <button
            className={`v3-guidebtn ${guide ? "on" : ""}`}
            onClick={() => setGuide(!guide)}
            aria-expanded={guide}
          >
            Try it{" "}
            <b>
              {guideDone}/{guideTotal}
            </b>
          </button>
          <span className="v3-sim">
            <i /> Simulated prototype · fictional data
          </span>
        </header>
        <main className="v3-content" key={resets}>
          {toast && (
            <div className="v3-banner" role="status">
              {toast}
              <button aria-label="Dismiss message" onClick={() => setToast("")}>
                ×
              </button>
            </div>
          )}
          {needsClient && !client ? (
            <div className="v3-empty">
              <h2>Start an onboarding first</h2>
              <p>This page appears after you create a client.</p>
              <button className="v3-btn" onClick={() => go("new")}>
                New onboarding
              </button>
            </div>
          ) : view === "inbox" ? (
            <Inbox ctx={ctx} />
          ) : view === "clients" ? (
            <Clients ctx={ctx} />
          ) : view === "new" ? (
            <NewOnboarding
              ctx={ctx}
              onCreate={(c: Client) => {
                update((s) => createClient(s, c));
                setWelcome(true);
                go("client", "plan");
              }}
            />
          ) : view === "client" ? (
            <Workspace
              ctx={ctx}
              tab={tab}
              welcome={welcome}
              dismissWelcome={() => setWelcome(false)}
            />
          ) : (
            <TeamPage ctx={ctx} />
          )}
        </main>
      </div>

      {guide && (
        <TryIt
          ctx={ctx}
          expanded={guideOpen}
          setExpanded={setGuideOpen}
          onClose={() => {
            setGuide(false);
            setGuideOpen(false);
          }}
          openTray={() => setTray(true)}
        />
      )}
      <div className="v3-demo">
        {tray && (
          <div className="panel" role="region" aria-label="Demo controls">
            <strong>Demo controls</strong>
            <p>These simulate things that happen outside the app.</p>
            <button
              className="v3-btn secondary"
              onClick={() => {
                setState(initialState);
                setResets((r) => r + 1);
                setWelcome(false);
                go("clients");
                setToast("Demo reset to the starting state.");
              }}
            >
              Reset demo
            </button>
          </div>
        )}
        <button
          className="toggle"
          onClick={() => setTray(!tray)}
          aria-expanded={tray}
        >
          ◐ Demo controls
        </button>
      </div>
    </div>
  );
}

function Avatar2() {
  return <i className="v3-avatar team">AM</i>;
}
