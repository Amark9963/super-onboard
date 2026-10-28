"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api } from "./api";

type Page = {
  id: string;
  url: string;
  depth: number;
  discovered_via: string;
  title: string | null;
  status: string;
  reason: string | null;
  source_version_id: string | null;
  byte_size: number | null;
  fetched_at: string | null;
};
type Import = {
  id: string;
  root_url: string;
  approved_hosts: string[];
  max_pages: number;
  max_depth: number;
  phase: string;
  error_code: string | null;
  summary: {
    candidates?: number;
    truncated?: boolean;
    import?: Record<string, number>;
  } | null;
  created_at: string;
  counts: Record<string, number>;
  note: string;
  pages?: Page[];
};

const ACTIVE = [
  "discover_pending",
  "discovering",
  "import_pending",
  "importing",
];
const words = (value: string) => value.replaceAll("_", " ");
const message = (r: unknown) => (r instanceof Error ? r.message : String(r));

const PHASES: Record<string, string> = {
  discover_pending: "Waiting to look for pages",
  discovering: "Looking for pages…",
  discovered: "Choose pages to import",
  import_pending: "Waiting to import",
  importing: "Importing pages…",
  imported: "Imported",
  failed: "Failed",
};

export function WebImportPanel(props: {
  projectId: string;
  csrf: string;
  onError: (message: string) => void;
}) {
  const { projectId, csrf, onError } = props;
  const [imports, setImports] = useState<Import[] | null>(null);
  const [open, setOpen] = useState("");
  const [detail, setDetail] = useState<Import | null>(null);
  const [url, setUrl] = useState("");
  const [hosts, setHosts] = useState("");
  const [maxPages, setMaxPages] = useState(25);
  const [maxDepth, setMaxDepth] = useState(2);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const bump = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const list = await api<Import[]>(`/projects/${projectId}/web-imports`);
        if (!live) return;
        setImports(list);
        const current = open || list[0]?.id || "";
        if (current) {
          const data = await api<Import>(
            `/projects/${projectId}/web-imports/${current}`,
          );
          if (live) {
            setDetail(data);
            setOpen((old) => old || current);
          }
        } else if (live) setDetail(null);
      } catch (reason) {
        if (live) onError(message(reason));
      }
    };
    load();
    const timer = setInterval(load, 3000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [projectId, open, tick, onError]);

  const running = imports?.some((i) => ACTIVE.includes(i.phase)) ?? false;

  async function start(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const created = await api<Import>(
        `/projects/${projectId}/web-imports`,
        {
          method: "POST",
          body: JSON.stringify({
            url,
            approved_hosts: hosts
              .split(",")
              .map((h) => h.trim())
              .filter(Boolean),
            max_pages: maxPages,
            max_depth: maxDepth,
          }),
        },
        csrf,
      );
      setOpen(created.id);
      setPicked({});
      setUrl("");
      bump();
    } catch (reason) {
      onError(message(reason));
    } finally {
      setBusy(false);
    }
  }

  async function importSelected() {
    if (!detail) return;
    const ids = Object.keys(picked).filter((id) => picked[id]);
    setBusy(true);
    try {
      await api(
        `/projects/${projectId}/web-imports/${detail.id}/import`,
        { method: "POST", body: JSON.stringify({ page_ids: ids }) },
        csrf,
      );
      setPicked({});
      bump();
    } catch (reason) {
      onError(message(reason));
    } finally {
      setBusy(false);
    }
  }

  const selectable = (detail?.pages ?? []).filter((p) =>
    ["candidate", "failed"].includes(p.status),
  );
  const chosen = Object.values(picked).filter(Boolean).length;

  return (
    <section>
      <div className="section-title">
        <div>
          <p className="eyebrow">WEBSITE IMPORT</p>
          <h2>Import public web pages</h2>
        </div>
        <span className="pill">{imports?.length ?? 0} imports</span>
      </div>
      <p className="subtle">
        Fetches only public pages of the site you enter. It honors robots.txt,
        refuses internal or private addresses, limits pages, depth and size, and
        never runs page scripts. Imported pages are{" "}
        <strong>unconfirmed evidence</strong>: they enter the normal parse,
        extraction and review flow and are never approved automatically.
      </p>
      <form onSubmit={start}>
        <label>
          Website address
          <input
            required
            type="url"
            value={url}
            maxLength={2048}
            placeholder="https://www.example-property-company.com/"
            onChange={(e) => setUrl(e.target.value)}
          />
        </label>
        <div className="grid-two tight">
          <label>
            Approved subdomains (optional, comma separated)
            <input
              value={hosts}
              placeholder="help.example-property-company.com"
              onChange={(e) => setHosts(e.target.value)}
            />
          </label>
          <label>
            Limits: pages / link depth
            <span className="inline-pair">
              <input
                type="number"
                min={1}
                max={25}
                value={maxPages}
                onChange={(e) => setMaxPages(Number(e.target.value))}
              />
              <input
                type="number"
                min={0}
                max={2}
                value={maxDepth}
                onChange={(e) => setMaxDepth(Number(e.target.value))}
              />
            </span>
          </label>
        </div>
        <button disabled={busy || running || !url}>
          {running ? "An import is running…" : "Find pages"}
        </button>
      </form>

      {imports === null && <p className="subtle">Loading…</p>}
      {imports && imports.length > 1 && (
        <label className="inline">
          Import
          <select value={open} onChange={(e) => setOpen(e.target.value)}>
            {imports.map((i) => (
              <option key={i.id} value={i.id}>
                {i.root_url} · {PHASES[i.phase] || i.phase}
              </option>
            ))}
          </select>
        </label>
      )}
      {detail && (
        <div className="draft-preview">
          <div className="badges">
            <span className={`status ${detail.phase}`}>
              {PHASES[detail.phase] || words(detail.phase)}
            </span>
            {detail.error_code && (
              <span className="error-code">{words(detail.error_code)}</span>
            )}
            {detail.summary?.truncated && (
              <span className="badge warn">
                limit reached; not every page is listed
              </span>
            )}
          </div>
          <h3>{detail.root_url}</h3>
          {detail.summary?.import && (
            <p className="subtle">
              Imported: {detail.summary.import.fetched} new ·{" "}
              {detail.summary.import.unchanged} unchanged ·{" "}
              {detail.summary.import.failed} failed ·{" "}
              {detail.summary.import.blocked} blocked by robots.txt
            </p>
          )}
          {(detail.pages ?? []).map((p) => (
            <div className="version-row" key={p.id}>
              {["candidate", "failed"].includes(p.status) ? (
                <input
                  type="checkbox"
                  aria-label={`Select ${p.url}`}
                  style={{ width: "auto" }}
                  checked={!!picked[p.id]}
                  disabled={
                    detail.phase !== "discovered" && detail.phase !== "imported"
                  }
                  onChange={(e) =>
                    setPicked({ ...picked, [p.id]: e.target.checked })
                  }
                />
              ) : (
                <span style={{ width: 13 }} />
              )}
              <strong>{p.title || "(untitled)"}</strong>
              <small>{p.url}</small>
              <span className={`status ${p.status}`}>{p.status}</span>
              {p.reason && (
                <span className="error-code">{words(p.reason)}</span>
              )}
              <small>
                depth {p.depth} · via {p.discovered_via}
              </small>
            </div>
          ))}
          {selectable.length > 0 &&
            (detail.phase === "discovered" || detail.phase === "imported") && (
              <div className="action-row">
                <button
                  disabled={busy || chosen === 0}
                  onClick={() => void importSelected()}
                >
                  Import {chosen} selected page{chosen === 1 ? "" : "s"}
                </button>
                <button
                  className="secondary"
                  type="button"
                  onClick={() =>
                    setPicked(
                      Object.fromEntries(selectable.map((p) => [p.id, true])),
                    )
                  }
                >
                  Select all
                </button>
              </div>
            )}
          <p className="subtle">{detail.note}</p>
        </div>
      )}
    </section>
  );
}
