"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api } from "./api";
import { CustomerPanel } from "./customer";
import { OutputsPanel } from "./outputs";
import { ReviewWorkspace } from "./review";
import { WebImportPanel } from "./webimport";

type User = { id: string; email: string; role: string; csrf_token: string };
type Organization = { id: string; name: string };
type Project = {
  id: string;
  name: string;
  organization_id: string;
  readiness: string;
};
type Scope = { id: string; name: string; portfolio_id?: string | null };
type Contact = {
  id: string;
  name: string;
  email: string;
  role: string;
  authorization_note: string;
};
type Member = { id: string; email: string; role: string };
type Version = {
  id: string;
  document_id: string;
  version: number;
  filename: string;
  byte_size: number;
  content_hash: string;
  parse_status: string;
  error_code: string | null;
  has_original: boolean;
};
type Source = { id: string; name: string; kind: string; versions: Version[] };
type Block = {
  id: string;
  text: string;
  locator: Record<string, string | number | boolean | string[]>;
  position: number;
};

export default function Workspace() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [portfolios, setPortfolios] = useState<Scope[]>([]);
  const [properties, setProperties] = useState<Scope[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [memberEmail, setMemberEmail] = useState("");
  const [sources, setSources] = useState<Source[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<Version | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [totalBlocks, setTotalBlocks] = useState(0);
  const [newOrg, setNewOrg] = useState("");
  const [newProject, setNewProject] = useState("");
  const [selectedOrg, setSelectedOrg] = useState("");
  const [newPortfolio, setNewPortfolio] = useState("");
  const [newProperty, setNewProperty] = useState("");
  const [selectedPortfolio, setSelectedPortfolio] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactRole, setContactRole] = useState("");
  const [transcriptName, setTranscriptName] = useState("");
  const [transcriptText, setTranscriptText] = useState("");
  const [uploadDocument, setUploadDocument] = useState("");
  const [transcriptDocument, setTranscriptDocument] = useState("");
  const [busy, setBusy] = useState(false);

  const refreshProjects = useCallback(async () => {
    const [orgs, projs] = await Promise.all([
      api<Organization[]>("/organizations"),
      api<Project[]>("/projects"),
    ]);
    setOrganizations(orgs);
    setProjects(projs);
    setSelectedOrg((old) => old || orgs[0]?.id || "");
  }, []);

  const refreshProject = useCallback(async (id: string) => {
    const [scope, people, docs, staff] = await Promise.all([
      api<{ portfolios: Scope[]; properties: Scope[] }>(
        `/projects/${id}/scopes`,
      ),
      api<Contact[]>(`/projects/${id}/contacts`),
      api<Source[]>(`/projects/${id}/sources`),
      api<Member[]>(`/projects/${id}/members`),
    ]);
    setPortfolios(scope.portfolios);
    setProperties(scope.properties);
    setContacts(people);
    setSources(docs);
    setMembers(staff);
  }, []);

  useEffect(() => {
    api<User>("/auth/me")
      .then((person) => {
        setUser(person);
        return refreshProjects();
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [refreshProjects]);

  useEffect(() => {
    if (!project) return;
    Promise.resolve()
      .then(() => refreshProject(project.id))
      .catch((reason) => setError(String(reason.message || reason)));
    const timer = setInterval(() => {
      api<Source[]>(`/projects/${project.id}/sources`)
        .then((docs) => {
          setSources(docs);
          setSelectedVersion((current) => {
            if (!current) return null;
            const latest = docs
              .flatMap((d) => d.versions)
              .find((v) => v.id === current.id);
            return latest && latest.parse_status !== current.parse_status
              ? latest
              : current;
          });
        })
        .catch(() => {});
    }, 4000);
    return () => clearInterval(timer);
  }, [project, refreshProject]);

  useEffect(() => {
    if (!project || !selectedVersion) return;
    api<{ total: number; blocks: Block[] }>(
      `/projects/${project.id}/sources/versions/${selectedVersion.id}/blocks`,
    )
      .then((data) => {
        setBlocks(data.blocks);
        setTotalBlocks(data.total);
      })
      .catch((reason) => setError(String(reason.message || reason)));
  }, [project, selectedVersion]);

  function act(task: () => Promise<void>) {
    setBusy(true);
    setError("");
    task()
      .catch((reason) => setError(String(reason.message || reason)))
      .finally(() => setBusy(false));
  }

  function submit(event: FormEvent, task: () => Promise<void>) {
    event.preventDefault();
    act(task);
  }

  async function signIn() {
    const person = await api<User>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setUser(person);
    setPassword("");
    await refreshProjects();
  }

  async function signOut() {
    await api<void>("/auth/logout", { method: "POST" }, user?.csrf_token);
    setUser(null);
    setProject(null);
    setSelectedVersion(null);
  }

  if (loading) return <main className="loading">Loading workspace…</main>;
  if (!user)
    return (
      <main className="login-shell">
        <div className="brand">
          SUPER ONBOARD <span>· IMPLEMENTATION WORKSPACE</span>
        </div>
        <section className="login-card">
          <p className="eyebrow">INTERNAL ACCESS</p>
          <h1>Welcome back.</h1>
          <p>Sign in to manage source-backed onboarding projects.</p>
          <form onSubmit={(event) => submit(event, signIn)}>
            <label>
              Email
              <input
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <button disabled={busy}>Sign in</button>
          </form>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <p className="subtle">
            An administrator provisions staff accounts. Customer review arrives
            in a later milestone.
          </p>
        </section>
        <footer>Independent project · Not affiliated with Super</footer>
      </main>
    );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          SUPER <span>ONBOARD</span>
        </div>
        <p className="eyebrow">WORKSPACE · MILESTONE 3</p>
        <div className="sidebar-heading">Projects</div>
        <button
          className={`nav-item ${!project ? "active" : ""}`}
          onClick={() => {
            setProject(null);
            setSelectedVersion(null);
          }}
        >
          Overview
        </button>
        {projects.map((item) => (
          <button
            key={item.id}
            className={`nav-item ${project?.id === item.id ? "active" : ""}`}
            onClick={() => {
              setProject(item);
              setSelectedVersion(null);
            }}
          >
            {item.name}
          </button>
        ))}
        <div className="sidebar-bottom">
          <small>{user.email}</small>
          <button className="text-button" onClick={() => act(signOut)}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="content">
        {error && (
          <div role="alert" className="error-banner">
            {error}
            <button aria-label="Dismiss error" onClick={() => setError("")}>
              ×
            </button>
          </div>
        )}
        {!project ? (
          <>
            <p className="eyebrow">PROJECTS DASHBOARD</p>
            <h1>Onboarding projects</h1>
            <p className="lead">
              Collect property scope and preserve the sources behind every
              future requirement.
            </p>
            <div className="cards">
              {projects.map((item) => (
                <button
                  className="project-card"
                  key={item.id}
                  onClick={() => setProject(item)}
                >
                  <strong>{item.name}</strong>
                  <span>{item.readiness.replaceAll("_", " ")}</span>
                  <span>Open project →</span>
                </button>
              ))}
            </div>
            <div className="grid-two">
              <section>
                <h2>New organization</h2>
                <form
                  onSubmit={(event) =>
                    submit(event, async () => {
                      const org = await api<Organization>(
                        "/organizations",
                        {
                          method: "POST",
                          body: JSON.stringify({ name: newOrg }),
                        },
                        user.csrf_token,
                      );
                      setNewOrg("");
                      await refreshProjects();
                      setSelectedOrg(org.id);
                    })
                  }
                >
                  <label>
                    Organization name
                    <input
                      required
                      maxLength={200}
                      value={newOrg}
                      onChange={(event) => setNewOrg(event.target.value)}
                      placeholder="Example Property Group"
                    />
                  </label>
                  <button disabled={busy}>Create organization</button>
                </form>
              </section>
              <section>
                <h2>New project</h2>
                <form
                  onSubmit={(event) =>
                    submit(event, async () => {
                      const created = await api<Project>(
                        "/projects",
                        {
                          method: "POST",
                          body: JSON.stringify({
                            name: newProject,
                            organization_id: selectedOrg,
                          }),
                        },
                        user.csrf_token,
                      );
                      setNewProject("");
                      await refreshProjects();
                      setProject(created);
                    })
                  }
                >
                  <label>
                    Organization
                    <select
                      required
                      value={selectedOrg}
                      onChange={(event) => setSelectedOrg(event.target.value)}
                    >
                      <option value="">Select organization</option>
                      {organizations.map((org) => (
                        <option key={org.id} value={org.id}>
                          {org.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Project name
                    <input
                      required
                      maxLength={200}
                      value={newProject}
                      onChange={(event) => setNewProject(event.target.value)}
                      placeholder="Spring onboarding"
                    />
                  </label>
                  <button disabled={busy || !selectedOrg}>
                    Create project
                  </button>
                </form>
              </section>
            </div>
          </>
        ) : (
          <>
            <button className="breadcrumb" onClick={() => setProject(null)}>
              ← All projects
            </button>
            <p className="eyebrow">PROJECT WORKSPACE</p>
            <h1>{project.name}</h1>
            <p className="lead">
              Document readiness:{" "}
              <strong>{project.readiness.replaceAll("_", " ")}</strong>. Sources
              and extracted candidates require customer confirmation and staff
              validation before they enter a blueprint.
            </p>
            <div className="grid-two">
              <section>
                <h2>Property scope</h2>
                <p className="subtle">
                  Company-wide rules can later be assigned alongside portfolio
                  and building rules.
                </p>
                <h3>Portfolios</h3>
                <ul>
                  {portfolios.map((p) => (
                    <li key={p.id}>{p.name}</li>
                  ))}
                </ul>
                <form
                  onSubmit={(event) =>
                    submit(event, async () => {
                      await api(
                        `/projects/${project.id}/portfolios`,
                        {
                          method: "POST",
                          body: JSON.stringify({ name: newPortfolio }),
                        },
                        user.csrf_token,
                      );
                      setNewPortfolio("");
                      await refreshProject(project.id);
                    })
                  }
                >
                  <label>
                    New portfolio
                    <input
                      required
                      value={newPortfolio}
                      onChange={(event) => setNewPortfolio(event.target.value)}
                    />
                  </label>
                  <button disabled={busy}>Add portfolio</button>
                </form>
                <h3>Buildings</h3>
                <ul>
                  {properties.map((p) => (
                    <li key={p.id}>
                      {p.name}
                      {p.portfolio_id
                        ? ` · ${portfolios.find((x) => x.id === p.portfolio_id)?.name || "Portfolio"}`
                        : ""}
                    </li>
                  ))}
                </ul>
                <form
                  onSubmit={(event) =>
                    submit(event, async () => {
                      await api(
                        `/projects/${project.id}/properties`,
                        {
                          method: "POST",
                          body: JSON.stringify({
                            name: newProperty,
                            portfolio_id: selectedPortfolio || null,
                          }),
                        },
                        user.csrf_token,
                      );
                      setNewProperty("");
                      await refreshProject(project.id);
                    })
                  }
                >
                  <label>
                    New building
                    <input
                      required
                      value={newProperty}
                      onChange={(event) => setNewProperty(event.target.value)}
                    />
                  </label>
                  <label>
                    Portfolio
                    <select
                      value={selectedPortfolio}
                      onChange={(event) =>
                        setSelectedPortfolio(event.target.value)
                      }
                    >
                      <option value="">Company level</option>
                      {portfolios.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button disabled={busy}>Add building</button>
                </form>
              </section>
              <section>
                <h2>Customer contacts</h2>
                <p className="subtle">
                  These contacts cannot access the internal workspace.
                </p>
                <ul>
                  {contacts.map((c) => (
                    <li key={c.id}>
                      {c.name} · {c.role} <small>{c.email}</small>
                    </li>
                  ))}
                </ul>
                <form
                  onSubmit={(event) =>
                    submit(event, async () => {
                      await api(
                        `/projects/${project.id}/contacts`,
                        {
                          method: "POST",
                          body: JSON.stringify({
                            name: contactName,
                            email: contactEmail,
                            role: contactRole,
                            authorization_note: "Authority unverified",
                          }),
                        },
                        user.csrf_token,
                      );
                      setContactName("");
                      setContactEmail("");
                      setContactRole("");
                      await refreshProject(project.id);
                    })
                  }
                >
                  <label>
                    Name
                    <input
                      required
                      value={contactName}
                      onChange={(event) => setContactName(event.target.value)}
                    />
                  </label>
                  <label>
                    Email
                    <input
                      required
                      type="email"
                      value={contactEmail}
                      onChange={(event) => setContactEmail(event.target.value)}
                    />
                  </label>
                  <label>
                    Role
                    <input
                      required
                      value={contactRole}
                      onChange={(event) => setContactRole(event.target.value)}
                    />
                  </label>
                  <button disabled={busy}>Add contact</button>
                </form>
              </section>
            </div>
            <section>
              <div className="section-title">
                <div>
                  <p className="eyebrow">ACCESS</p>
                  <h2>Implementation team</h2>
                </div>
                <span className="pill">{members.length} members</span>
              </div>
              <ul>
                {members.map((member) => (
                  <li key={member.id}>
                    {member.email} · {member.role}
                  </li>
                ))}
              </ul>
              {user.role === "admin" && (
                <form
                  onSubmit={(event) =>
                    submit(event, async () => {
                      await api(
                        `/projects/${project.id}/members`,
                        {
                          method: "POST",
                          body: JSON.stringify({ email: memberEmail }),
                        },
                        user.csrf_token,
                      );
                      setMemberEmail("");
                      await refreshProject(project.id);
                    })
                  }
                >
                  <label>
                    Add provisioned staff account
                    <input
                      type="email"
                      required
                      value={memberEmail}
                      onChange={(event) => setMemberEmail(event.target.value)}
                      placeholder="colleague@example.com"
                    />
                  </label>
                  <button disabled={busy}>Grant project access</button>
                </form>
              )}
            </section>
            <section>
              <div className="section-title">
                <div>
                  <p className="eyebrow">PRIVATE EVIDENCE</p>
                  <h2>Sources</h2>
                </div>
                <span className="pill">{sources.length} documents</span>
              </div>
              <div className="grid-two">
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    const form = new FormData(event.currentTarget);
                    const element = event.currentTarget;
                    act(async () => {
                      await api(
                        `/projects/${project.id}/sources/upload${uploadDocument ? `?document_id=${encodeURIComponent(uploadDocument)}` : ""}`,
                        { method: "POST", body: form },
                        user.csrf_token,
                      );
                      element.reset();
                      await refreshProject(project.id);
                    });
                  }}
                >
                  <h3>Upload a document</h3>
                  <label>
                    Source version
                    <select
                      value={uploadDocument}
                      onChange={(event) =>
                        setUploadDocument(event.target.value)
                      }
                    >
                      <option value="">New source</option>
                      {sources
                        .filter((source) => source.kind !== "transcript")
                        .map((source) => (
                          <option key={source.id} value={source.id}>
                            New version of {source.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    PDF, DOCX, XLSX, or UTF-8 TXT
                    <input
                      type="file"
                      name="file"
                      accept=".pdf,.docx,.xlsx,.txt"
                      required
                    />
                  </label>
                  <p className="subtle">
                    Up to 10 MB. Originals remain private.
                  </p>
                  <button disabled={busy}>Upload source</button>
                </form>
                <form
                  onSubmit={(event) =>
                    submit(event, async () => {
                      await api(
                        `/projects/${project.id}/sources/transcript${transcriptDocument ? `?document_id=${encodeURIComponent(transcriptDocument)}` : ""}`,
                        {
                          method: "POST",
                          body: JSON.stringify({
                            name: transcriptName,
                            text: transcriptText,
                          }),
                        },
                        user.csrf_token,
                      );
                      setTranscriptName("");
                      setTranscriptText("");
                      await refreshProject(project.id);
                    })
                  }
                >
                  <h3>Paste transcript</h3>
                  <label>
                    Source version
                    <select
                      value={transcriptDocument}
                      onChange={(event) =>
                        setTranscriptDocument(event.target.value)
                      }
                    >
                      <option value="">New transcript</option>
                      {sources
                        .filter((source) => source.kind === "transcript")
                        .map((source) => (
                          <option key={source.id} value={source.id}>
                            New version of {source.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    Source label
                    <input
                      required
                      value={transcriptName}
                      onChange={(event) =>
                        setTranscriptName(event.target.value)
                      }
                      placeholder="Operations call"
                    />
                  </label>
                  <label>
                    Transcript text
                    <textarea
                      required
                      rows={5}
                      value={transcriptText}
                      onChange={(event) =>
                        setTranscriptText(event.target.value)
                      }
                      placeholder="00:12 Discussion starts…"
                    />
                  </label>
                  <button disabled={busy}>Save transcript</button>
                </form>
              </div>
              <div className="source-list">
                {sources.length === 0 && (
                  <p className="subtle">
                    No sources yet. Upload a file or paste a transcript.
                  </p>
                )}
                {sources.map((source) => (
                  <div className="source-row" key={source.id}>
                    <strong>{source.name}</strong>
                    <small>{source.kind}</small>
                    {source.versions.map((version) => (
                      <div className="version-row" key={version.id}>
                        <span>v{version.version}</span>
                        <span className={`status ${version.parse_status}`}>
                          {version.parse_status.replaceAll("_", " ")}
                        </span>
                        {version.error_code && (
                          <span className="error-code">
                            {version.error_code.replaceAll("_", " ")}
                          </span>
                        )}
                        <button
                          className="text-button"
                          onClick={() => setSelectedVersion(version)}
                        >
                          View evidence
                        </button>
                        {version.has_original && (
                          <a
                            href={`/api/projects/${project.id}/sources/versions/${version.id}/original`}
                          >
                            Download original
                          </a>
                        )}
                        {version.parse_status === "failed" &&
                          version.has_original && (
                            <button
                              className="text-button"
                              onClick={() =>
                                act(async () => {
                                  await api(
                                    `/projects/${project.id}/sources/versions/${version.id}/retry`,
                                    { method: "POST" },
                                    user.csrf_token,
                                  );
                                  await refreshProject(project.id);
                                })
                              }
                            >
                              Retry parsing
                            </button>
                          )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </section>
            <WebImportPanel
              projectId={project.id}
              csrf={user.csrf_token}
              onError={setError}
            />
            <ReviewWorkspace
              projectId={project.id}
              csrf={user.csrf_token}
              sources={sources}
              properties={properties}
              portfolios={portfolios}
              onError={setError}
            />
            <CustomerPanel
              projectId={project.id}
              csrf={user.csrf_token}
              contacts={contacts}
              onError={setError}
            />
            <OutputsPanel
              projectId={project.id}
              csrf={user.csrf_token}
              onError={setError}
            />
            {selectedVersion && (
              <section className="evidence">
                <div className="section-title">
                  <div>
                    <p className="eyebrow">SOURCE BROWSER</p>
                    <h2>
                      {selectedVersion.filename} · v{selectedVersion.version}
                    </h2>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => setSelectedVersion(null)}
                  >
                    Close
                  </button>
                </div>
                <p className="subtle">
                  SHA-256: <code>{selectedVersion.content_hash}</code>
                </p>
                <p className="subtle">
                  {selectedVersion.parse_status === "needs_attention"
                    ? "Some content needs manual attention. Missing text is not inferred."
                    : "Extracted blocks retain their captured locations. These are unconfirmed source excerpts."}
                </p>
                {blocks.map((block) => (
                  <article className="block" key={block.id}>
                    <div className="locator">
                      {Object.entries(block.locator)
                        .map(
                          ([key, value]) =>
                            `${key.replaceAll("_", " ")}: ${Array.isArray(value) ? value.join(" / ") : value}`,
                        )
                        .join(" · ")}
                    </div>
                    <p>{block.text}</p>
                  </article>
                ))}
                {blocks.length < totalBlocks && (
                  <button
                    onClick={() =>
                      act(async () => {
                        const data = await api<{ blocks: Block[] }>(
                          `/projects/${project.id}/sources/versions/${selectedVersion.id}/blocks?offset=${blocks.length}`,
                        );
                        setBlocks([...blocks, ...data.blocks]);
                      })
                    }
                  >
                    Load more blocks
                  </button>
                )}
              </section>
            )}
          </>
        )}
        <footer>
          Independent implementation workspace · No live agent configuration
        </footer>
      </main>
    </div>
  );
}
