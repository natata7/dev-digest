import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import messages from "../../../../../../../messages/en/onboarding.json";
import { OnboardingTourView } from "./OnboardingTourView";

const REPO_ID = "11111111-1111-4111-8111-111111111111";

vi.mock("next/navigation", () => ({
  useParams: () => ({ repoId: REPO_ID }),
  usePathname: () => `/repos/${REPO_ID}/onboarding`,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { id: REPO_ID, full_name: "acme/api" }, reposLoaded: true }),
  useRepoNotFound: () => false,
}));
// AC-31: mermaid says the diagram is invalid
vi.mock("mermaid", () => ({
  default: { initialize: vi.fn(), parse: vi.fn(async () => false), render: vi.fn() },
}));

const KINDS = ["architecture", "critical_paths", "local_run", "reading_order", "first_tasks"] as const;
const TITLES = ["Arch title", "Crit title", "Run title", "Read title", "Tasks title"];

const cnt = (n = 0, total = n, truncated = false) => ({ shown: n, total, truncated });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function tour(over: Record<string, unknown> = {}): any {
  return {
    sections: KINDS.map((kind, i) => ({
      kind,
      title: TITLES[i],
      body: `Body of ${kind}`,
      diagram: null,
      links: [],
      source: "llm",
    })),
    reading_path: [{ path: "src/main.ts", score: 0.5, why: "entry point" }],
    status: "complete",
    reason: null,
    regeneration_error: null,
    ranking_basis: "pagerank_hotness",
    coverage: {
      index_status: "full",
      files_indexed: 100,
      files_skipped: 0,
      routes: cnt(),
      scripts: cnt(),
      structure: cnt(),
      reading_path: cnt(1),
      critical_paths: cnt(),
    },
    indexed_sha: "abc",
    generated_at: "2026-10-01T10:00:00.000Z",
    outdated: false,
    model: "deepseek/deepseek-v4-flash",
    tokens_in: 1200,
    tokens_out: 800,
    cost_usd: 0.0123,
    ...over,
  };
}

type Resp = { status: number; body: unknown };
let getTour: () => Resp | Promise<Resp>;
let postTour: () => Resp | Promise<Resp>;
let clonePath: string | null;

const noTour: Resp = { status: 404, body: { error: { code: "no_tour", message: "no tour" } } };
const ok = (body: unknown): Resp => ({ status: 200, body });

function respond(r: Resp) {
  return { ok: r.status < 400, status: r.status, statusText: "x", json: async () => r.body };
}

function calls(method: string, suffix: string) {
  return vi
    .mocked(fetch)
    .mock.calls.filter(
      (c) => ((c[1] as RequestInit | undefined)?.method ?? "GET") === method && String(c[0]).endsWith(suffix),
    );
}

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
        <OnboardingTourView />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  getTour = () => ok(tour());
  postTour = () => ok(tour());
  clonePath = "/clones/acme-api";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.endsWith(`/repos/${REPO_ID}/onboarding`)) {
        return respond(await (method === "POST" ? postTour() : getTour()));
      }
      if (method === "POST" && url.endsWith("/resync")) return respond(ok({ status: "queued" }));
      if (method === "GET" && url.endsWith("/repos")) {
        return respond(ok([{ id: REPO_ID, full_name: "acme/api", clone_path: clonePath }]));
      }
      return respond({ status: 404, body: {} });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("OnboardingTourView", () => {
  it("AC-2 / NFR-6: renders a stored tour's 5 sections as h2 in fixed order, without POSTing", async () => {
    renderView();
    await screen.findByRole("heading", { level: 2, name: "Arch title" });
    const heads = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(heads).toEqual(TITLES);
    expect(calls("POST", `/repos/${REPO_ID}/onboarding`)).toHaveLength(0);
  });

  it("AC-3: no stored tour -> empty state naming the 5 sections and Generate", async () => {
    getTour = () => noTour;
    renderView();
    expect(await screen.findByText("No onboarding tour yet")).toBeInTheDocument();
    for (const n of ["Architecture", "Critical paths", "Run locally", "Reading order", "First tasks"]) {
      expect(screen.getByText(n)).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "Generate onboarding tour" })).toBeEnabled();
  });

  it("AC-4: repo without clone -> 'not cloned' and Generate disabled", async () => {
    getTour = () => noTour;
    clonePath = null;
    renderView();
    expect(await screen.findByText("Repository is not cloned yet")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Generate onboarding tour" })).toBeDisabled(),
    );
  });

  it("AC-7: outdated tour shows the Outdated badge next to Regenerate", async () => {
    getTour = () => ok(tour({ outdated: true }));
    renderView();
    expect(await screen.findByText("Outdated")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Regenerate" })).toBeInTheDocument();
  });

  it("AC-7: no badge when not outdated", async () => {
    renderView();
    await screen.findByRole("button", { name: "Regenerate" });
    expect(screen.queryByText("Outdated")).not.toBeInTheDocument();
  });

  it("AC-14: pagerank-only ranking shows the import-graph note; pagerank_hotness does not", async () => {
    getTour = () => ok(tour({ ranking_basis: "pagerank" }));
    renderView();
    expect(
      await screen.findByText("Ranked by import graph only — no git history in the shallow clone"),
    ).toBeInTheDocument();
    cleanup();
    getTour = () => ok(tour());
    renderView();
    await screen.findByText(/src\/main\.ts/);
    expect(screen.queryByText(/Ranked by import graph only/)).not.toBeInTheDocument();
  });

  it("AC-16: shows 'showing X of Y' for truncated categories only", async () => {
    const t = tour();
    (t.coverage as Record<string, unknown>).routes = cnt(50, 80, true);
    getTour = () => ok(t);
    renderView();
    expect(await screen.findByText("Routes: showing 50 of 80")).toBeInTheDocument();
    expect(screen.queryByText(/Scripts: showing/)).not.toBeInTheDocument();
  });

  it("AC-28: regeneration_error banner shows reason and stored tour date", async () => {
    getTour = () => ok(tour({ regeneration_error: "llm_timeout" }));
    renderView();
    const banner = await screen.findByText(/Regeneration failed \(the language model timed out\) — showing the tour from /);
    expect(banner).toHaveAttribute("role", "status");
    expect(screen.getByRole("heading", { level: 2, name: "Arch title" })).toBeInTheDocument();
  });

  it("AC-29: skeleton/no_index -> status banner with plain reason and Resync that POSTs resync", async () => {
    getTour = () => ok(tour({ status: "skeleton", reason: "no_index", model: null, tokens_in: null, tokens_out: null, cost_usd: null }));
    renderView();
    const banner = await screen.findByText(/the repository has not been indexed yet/);
    expect(banner.closest('[role="status"]')).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Resync" }));
    await waitFor(() => expect(calls("POST", `/repos/${REPO_ID}/resync`)).toHaveLength(1));
  });

  it("AC-29: flag_off banner has no Resync", async () => {
    getTour = () => ok(tour({ status: "skeleton", reason: "flag_off", model: null, tokens_in: null, tokens_out: null, cost_usd: null }));
    renderView();
    await screen.findByText(/repo-intel is disabled/);
    expect(screen.queryByRole("button", { name: "Resync" })).not.toBeInTheDocument();
  });

  it("AC-29: llm_* skeleton has no Resync", async () => {
    getTour = () => ok(tour({ status: "skeleton", reason: "llm_failed", model: null, tokens_in: null, tokens_out: null, cost_usd: null }));
    renderView();
    await screen.findByText(/the language model call failed/);
    expect(screen.queryByRole("button", { name: "Resync" })).not.toBeInTheDocument();
  });

  it("AC-30: partial tour shows the indexed/skipped note", async () => {
    const t = tour({ status: "partial", reason: "index_partial" });
    Object.assign(t.coverage, { files_indexed: 5000, files_skipped: 321 });
    getTour = () => ok(t);
    renderView();
    expect(
      await screen.findByText("Based on 5000 indexed files (321 skipped) — index is partial"),
    ).toBeInTheDocument();
  });

  it("AC-31: invalid diagram is hidden, body still rendered, no error text", async () => {
    const t = tour();
    t.sections[0].diagram = "flowchart TD\n A-->";
    getTour = () => ok(t);
    const { container } = renderView();
    expect(await screen.findByText("Body of architecture")).toBeInTheDocument();
    await waitFor(() => expect(container.querySelector("section svg")).toBeNull());
    expect(screen.queryByText(/syntax error/i)).not.toBeInTheDocument();
  });

  it("AC-32: while POST is pending shows generating state and disables Regenerate", async () => {
    let release!: (r: Resp) => void;
    postTour = () => new Promise<Resp>((res) => (release = res));
    renderView();
    fireEvent.click(await screen.findByRole("button", { name: "Regenerate" }));
    expect(await screen.findByText("Generating onboarding tour…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Regenerate" })).toBeDisabled();
    release(ok(tour()));
    await waitFor(() => expect(screen.getByRole("button", { name: "Regenerate" })).toBeEnabled());
  });

  it("AC-32: 409 generation_in_progress shows the already-generating text and keeps button disabled", async () => {
    postTour = () => ({ status: 409, body: { error: { code: "generation_in_progress", message: "busy" } } });
    renderView();
    fireEvent.click(await screen.findByRole("button", { name: "Regenerate" }));
    expect(await screen.findByText("A tour is already being generated")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Regenerate" })).toBeDisabled();
  });

  it("AC-33: GET 500 -> 'Couldn't load the onboarding tour' with a Retry that refetches", async () => {
    getTour = () => ({ status: 500, body: {} });
    renderView();
    expect(await screen.findByText(/Couldn.t load the onboarding tour/)).toBeInTheDocument();
    const before = calls("GET", `/repos/${REPO_ID}/onboarding`).length;
    getTour = () => ok(tour());
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    await screen.findByRole("heading", { level: 2, name: "Arch title" });
    expect(calls("GET", `/repos/${REPO_ID}/onboarding`).length).toBeGreaterThan(before);
  });

  it("AC-33: POST 500 shows the load-error message and keeps the tour on screen", async () => {
    postTour = () => ({ status: 500, body: {} });
    renderView();
    fireEvent.click(await screen.findByRole("button", { name: "Regenerate" }));
    expect(await screen.findByText(/Couldn.t load the onboarding tour/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Arch title" })).toBeInTheDocument();
  });

  it("AC-36: Markdown body does not render raw HTML; links shown as text, no run control", async () => {
    const t = tour();
    t.sections[2].body = 'Run it <script>window.__x=1</script><img src=x onerror="window.__x=1"> `npm run dev`';
    t.sections[2].links = [{ label: "pkg", path: "package.json" }] as never;
    getTour = () => ok(t);
    const { container } = renderView();
    await screen.findByRole("heading", { level: 2, name: "Run title" });
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("npm run dev").tagName).toBe("CODE");
    expect(screen.getByText("package.json")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /run|execute/i })).not.toBeInTheDocument();
  });

  it("AC-37: LLM tour footer shows model, tokens and cost", async () => {
    renderView();
    expect(await screen.findByText("Model deepseek/deepseek-v4-flash")).toBeInTheDocument();
    expect(screen.getByText(/1\.2K in \/ 800 out/)).toBeInTheDocument();
    expect(screen.queryByText("Generated without LLM")).not.toBeInTheDocument();
  });

  it("AC-37: null cost -> 'cost unknown'", async () => {
    getTour = () => ok(tour({ cost_usd: null }));
    renderView();
    expect(await screen.findByText("cost unknown")).toBeInTheDocument();
  });

  it("AC-37: skeleton footer -> 'Generated without LLM'", async () => {
    getTour = () => ok(tour({ status: "skeleton", reason: "flag_off", model: null, tokens_in: null, tokens_out: null, cost_usd: null }));
    renderView();
    expect(await screen.findByText("Generated without LLM")).toBeInTheDocument();
  });

  it("AC-38: UI copy is English", async () => {
    getTour = () => noTour;
    renderView();
    expect(await screen.findByText("No onboarding tour yet")).toBeInTheDocument();
  });
});
