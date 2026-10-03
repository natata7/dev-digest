import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import messages from "../../../../../../../messages/en/onboarding.json";
import mermaid from "mermaid";
import { OnboardingTourView } from "./OnboardingTourView";

const REPO_ID = "11111111-1111-4111-8111-111111111111";

vi.mock("next/navigation", () => ({
  useParams: () => ({ repoId: REPO_ID }),
  usePathname: () => `/repos/${REPO_ID}/onboarding`,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/components/app-shell", () => ({
  // renders crumb labels so AC-49 (breadcrumb) is observable
  AppShell: ({ children, crumb }: { children: React.ReactNode; crumb?: { label: string }[] }) => (
    <div>
      <nav aria-label="breadcrumb">{(crumb ?? []).map((c) => c.label).join(" › ")}</nav>
      {children}
    </div>
  ),
}));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { id: REPO_ID, full_name: "acme/api" }, reposLoaded: true }),
  useRepoNotFound: () => false,
}));
// AC-31: mermaid says the diagram is invalid
vi.mock("mermaid", () => ({
  default: { initialize: vi.fn(), parse: vi.fn(async () => false), render: vi.fn() },
}));

const NAMES = ["Architecture overview", "Critical paths", "How to run locally", "Guided reading path", "First tasks"];
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
let repoRows: () => unknown[];
let writeText: ReturnType<typeof vi.fn>;
let ioCallback: ((e: { isIntersecting: boolean; target: Element }[]) => void) | undefined;

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
  repoRows = () => [{ id: REPO_ID, full_name: "acme/api", provider: "github", clone_path: clonePath }];
  writeText = vi.fn(async () => undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  Element.prototype.scrollIntoView = vi.fn();
  ioCallback = undefined;
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(cb: typeof ioCallback) {
        ioCallback = cb;
      }
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  );
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
        return respond(ok(repoRows()));
      }
      return respond({ status: 404, body: {} });
    }),
  );
});

afterEach(() => {
  cleanup();
  // @ts-expect-error test cleanup of the stubbed clipboard
  delete navigator.clipboard;
  vi.unstubAllGlobals();
});

// card toggle = the button inside the h2 (TOC entries share the names)
const toggleOf = (name: string | undefined) =>
  within(screen.getByRole("heading", { level: 2, name: name! })).getByRole("button");

describe("OnboardingTourView", () => {
  it("AC-2 / AC-39 / NFR-6: stored tour -> 5 fixed h2 headings in order, LLM titles ignored, no POST", async () => {
    renderView();
    await screen.findByRole("heading", { level: 2, name: NAMES[0] });
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(NAMES);
    for (const t of TITLES) expect(screen.queryByText(t)).not.toBeInTheDocument();
    expect(calls("POST", `/repos/${REPO_ID}/onboarding`)).toHaveLength(0);
  });

  it("AC-3 / AC-39: no stored tour -> empty state lists the 5 fixed headings, Generate, no TOC", async () => {
    getTour = () => noTour;
    renderView();
    expect(await screen.findByText("No onboarding tour yet")).toBeInTheDocument();
    const items = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(items).toEqual(NAMES);
    expect(screen.getByRole("button", { name: "Generate onboarding tour" })).toBeEnabled();
    expect(screen.queryByRole("navigation", { name: "Table of contents" })).not.toBeInTheDocument(); // AC-50
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
    const badge = await screen.findByText("Outdated");
    const regen = screen.getByRole("button", { name: "Regenerate" });
    // immediately left of Regenerate, in the page header (before the first card)
    expect(badge.compareDocumentPosition(regen) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(regen.parentElement).toContainElement(badge);
    const firstCard = screen.getByRole("heading", { level: 2, name: NAMES[0] });
    expect(regen.compareDocumentPosition(firstCard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("AC-7: no badge when not outdated", async () => {
    renderView();
    await screen.findByRole("button", { name: "Regenerate" });
    expect(screen.queryByText("Outdated")).not.toBeInTheDocument();
  });

  it("AC-14: pagerank-only note sits inside the Guided reading path card; pagerank_hotness has none", async () => {
    getTour = () => ok(tour({ ranking_basis: "pagerank" }));
    renderView();
    const note = await screen.findByText("Ranked by import graph only — no git history in the shallow clone");
    expect(note.closest("section")).toHaveAttribute("id", "onb-reading_order");
    cleanup();
    getTour = () => ok(tour());
    renderView();
    await screen.findByText("src/main.ts");
    expect(screen.queryByText(/Ranked by import graph only/)).not.toBeInTheDocument();
  });

  it.each([
    ["routes", "Routes", "onb-architecture"],
    ["structure", "Structure", "onb-architecture"],
    ["scripts", "Scripts", "onb-local_run"],
    ["reading_path", "Reading path", "onb-reading_order"],
    ["critical_paths", "Critical paths", "onb-critical_paths"],
  ])("AC-16: truncated %s shows 'showing X of Y' inside its owning card only", async (key, label, anchor) => {
    const t = tour();
    (t.coverage as Record<string, unknown>)[key] = cnt(50, 80, true);
    getTour = () => ok(t);
    renderView();
    const note = await screen.findByText(`${label}: showing 50 of 80`);
    expect(note.closest("section")).toHaveAttribute("id", anchor);
    expect(screen.getAllByText(/showing \d+ of \d+/)).toHaveLength(1);
  });

  it("AC-28: regeneration_error banner shows reason and stored tour date", async () => {
    getTour = () => ok(tour({ regeneration_error: "llm_timeout" }));
    renderView();
    const banner = await screen.findByText(/Regeneration failed \(the language model timed out\) — showing the tour from /);
    expect(banner).toHaveAttribute("role", "status");
    expect(screen.getByRole("heading", { level: 2, name: NAMES[0] })).toBeInTheDocument();
  });

  it("AC-29: skeleton/no_index -> status banner with plain reason and Resync that POSTs resync", async () => {
    getTour = () => ok(tour({ status: "skeleton", reason: "no_index", model: null, tokens_in: null, tokens_out: null, cost_usd: null }));
    renderView();
    const banner = await screen.findByText(/the repository has not been indexed yet/);
    expect(banner.closest('[role="status"]')).not.toBeNull();
    // directly under the header, above the first card
    const h1 = screen.getByRole("heading", { level: 1 });
    const firstCard = screen.getByRole("heading", { level: 2, name: NAMES[0] });
    expect(h1.compareDocumentPosition(banner) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(banner.compareDocumentPosition(firstCard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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
    // scoped to the card body: card chrome (icon/chevron) legitimately contains svgs
    await waitFor(() => expect(vi.mocked(mermaid.parse)).toHaveBeenCalled());
    expect(container.querySelector("#onb-architecture-body svg")).toBeNull();
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
    await screen.findByRole("heading", { level: 2, name: NAMES[0] });
    expect(calls("GET", `/repos/${REPO_ID}/onboarding`).length).toBeGreaterThan(before);
  });

  it("AC-33: POST 500 shows the load-error message and keeps the tour on screen", async () => {
    postTour = () => ({ status: 500, body: {} });
    renderView();
    fireEvent.click(await screen.findByRole("button", { name: "Regenerate" }));
    expect(await screen.findByText(/Couldn.t load the onboarding tour/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: NAMES[0] })).toBeInTheDocument();
  });

  it("AC-36: Markdown body does not render raw HTML; no run control; copy only for run-step commands", async () => {
    const t = tour({ run_steps: [{ command: "npm run dev", note: "starts it", source: "facts" }] });
    t.sections[2].body = 'Run it <script>window.__x=1</script><img src=x onerror="window.__x=1"> `npm start`';
    getTour = () => ok(t);
    const { container } = renderView();
    await screen.findByRole("heading", { level: 2, name: NAMES[2] });
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("npm start").tagName).toBe("CODE");
    expect(screen.queryByRole("button", { name: /^(run|execute)/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Copy command" })).toHaveLength(1);
  });

  it("AC-37: LLM tour footer shows model, tokens and cost", async () => {
    renderView();
    expect(await screen.findByText("Model deepseek/deepseek-v4-flash")).toBeInTheDocument();
    expect(screen.getByText(/1\.2K in \/ 800 out/)).toBeInTheDocument();
    // muted line directly under the last section card
    const model = screen.getByText("Model deepseek/deepseek-v4-flash");
    expect(model.parentElement?.previousElementSibling).toHaveAttribute("id", "onb-first_tasks");
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

  describe("revision 2 page chrome", () => {
    it("AC-49: title uses the short repo name, breadcrumb reads '<repo> › Onboarding Tour'", async () => {
      renderView();
      const h1 = await screen.findByRole("heading", { level: 1 });
      expect(h1).toHaveTextContent("Onboarding for api");
      expect(screen.getByRole("navigation", { name: "breadcrumb" })).toHaveTextContent("acme/api › Onboarding Tour");
    });

    it("AC-49: subtitle with index vs without index (E25)", async () => {
      renderView();
      expect(await screen.findByText(/^Generated from index of 100 files · generated /)).toBeInTheDocument();
      cleanup();
      const t = tour({ status: "skeleton", reason: "no_index", model: null, tokens_in: null, tokens_out: null, cost_usd: null });
      Object.assign(t.coverage, { files_indexed: 0, index_status: "none" });
      getTour = () => ok(t);
      renderView();
      expect(await screen.findByText(/^Generated without an index · generated /)).toBeInTheDocument();
    });

    it("AC-48 / D28: Share link copies the page URL and confirms via a status region; present in the empty state", async () => {
      renderView();
      fireEvent.click(await screen.findByRole("button", { name: "Share link" }));
      await waitFor(() => expect(writeText).toHaveBeenCalledWith(window.location.href));
      expect((await screen.findByText("Copied")).closest('[role="status"]')).not.toBeNull();
      cleanup();
      getTour = () => noTour;
      renderView();
      expect(await screen.findByRole("button", { name: "Share link" })).toBeInTheDocument();
    });

    it("AC-48 / E28: clipboard rejects -> read-only URL field, no Copied", async () => {
      writeText.mockRejectedValueOnce(new Error("denied"));
      renderView();
      fireEvent.click(await screen.findByRole("button", { name: "Share link" }));
      const field = await screen.findByRole("textbox", { name: "Copy this link" });
      expect(field).toHaveAttribute("readonly");
      expect(field).toHaveValue(window.location.href);
      expect(screen.queryByText("Copied")).not.toBeInTheDocument();
    });

    it("E28: clipboard API missing -> same manual fallback", async () => {
      // @ts-expect-error simulate non-secure context
      delete navigator.clipboard;
      renderView();
      fireEvent.click(await screen.findByRole("button", { name: "Share link" }));
      expect(await screen.findByRole("textbox", { name: "Copy this link" })).toBeInTheDocument();
    });
  });

  describe("TOC and collapsible cards", () => {
    it("AC-50 / AC-39: TOC lists the 5 fixed headings when a tour is displayed", async () => {
      renderView();
      const toc = await screen.findByRole("navigation", { name: "Table of contents" });
      expect(within(toc).getByText("On this page")).toBeInTheDocument();
      expect(within(toc).getAllByRole("button").map((b) => b.textContent)).toEqual(NAMES);
    });

    it("AC-50: scroll-spy highlights the section reported by the observer", async () => {
      renderView();
      const toc = await screen.findByRole("navigation", { name: "Table of contents" });
      const target = document.getElementById("onb-reading_order")!;
      act(() => ioCallback?.([{ isIntersecting: true, target }]));
      expect(within(toc).getByRole("button", { name: NAMES[3] })).toHaveAttribute("aria-current", "true");
      expect(within(toc).getByRole("button", { name: NAMES[0] })).not.toHaveAttribute("aria-current");
    });

    it("AC-51 / NFR-6: expanded by default; toggle collapses, heading stays in the DOM", async () => {
      renderView();
      await screen.findByRole("heading", { level: 2, name: NAMES[0] });
      const toggle = toggleOf(NAMES[0]!);
      expect(toggle).toHaveAttribute("aria-expanded", "true");
      fireEvent.click(toggle);
      expect(toggle).toHaveAttribute("aria-expanded", "false");
      expect(screen.queryByText("Body of architecture")).not.toBeInTheDocument();
      expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(NAMES);
    });

    it("AC-51: TOC entry of a collapsed card expands it and scrolls to it", async () => {
      renderView();
      await screen.findByRole("heading", { level: 2, name: NAMES[2] });
      const toggle = toggleOf(NAMES[2]);
      fireEvent.click(toggle);
      expect(toggle).toHaveAttribute("aria-expanded", "false");
      const toc = screen.getByRole("navigation", { name: "Table of contents" });
      fireEvent.click(within(toc).getByRole("button", { name: NAMES[2] }));
      expect(toggle).toHaveAttribute("aria-expanded", "true");
      const scroll = vi.mocked(Element.prototype.scrollIntoView);
      expect((scroll.mock.contexts.at(-1) as Element).id).toBe("onb-local_run");
    });

    it("AC-51: regeneration resets collapse state (not persisted)", async () => {
      postTour = () => ok(tour({ generated_at: "2026-10-02T10:00:00.000Z" }));
      renderView();
      await screen.findByRole("heading", { level: 2, name: NAMES[0] });
      const toggle = toggleOf(NAMES[0]!);
      fireEvent.click(toggle);
      fireEvent.click(screen.getByRole("button", { name: "Regenerate" }));
      await waitFor(() =>
        expect(toggleOf(NAMES[0]!)).toHaveAttribute("aria-expanded", "true"),
      );
    });
  });

  describe("section content", () => {
    const steps = [
      { command: "pnpm run dev", note: "starts the API", source: "facts" },
      { command: "pnpm run test", note: null, source: "llm" },
    ];

    it("AC-43 / AC-54: run steps are numbered rows (command mono + note) before the body", async () => {
      getTour = () => ok(tour({ run_steps: steps }));
      renderView();
      const cmd = await screen.findByText("pnpm run dev");
      expect(cmd.tagName).toBe("CODE");
      expect(cmd).toHaveAttribute("title", "pnpm run dev");
      expect(screen.getByText("starts the API")).toBeInTheDocument();
      const card = cmd.closest("section")!;
      expect(within(card).getByText("1")).toBeInTheDocument();
      expect(within(card).getByText("2")).toBeInTheDocument();
      expect(cmd.compareDocumentPosition(within(card).getByText("Body of local_run")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(within(card).getAllByRole("button", { name: "Copy command" })).toHaveLength(2);
    });

    it("AC-47: Copy writes exactly the command (never the note) and confirms via status", async () => {
      getTour = () => ok(tour({ run_steps: steps }));
      renderView();
      fireEvent.click((await screen.findAllByRole("button", { name: "Copy command" }))[0]!);
      await waitFor(() => expect(writeText).toHaveBeenCalledWith("pnpm run dev"));
      expect(writeText).toHaveBeenCalledTimes(1);
      expect((await screen.findByText("Copied")).closest('[role="status"]')).not.toBeNull();
    });

    it("AC-47: clipboard failure -> command text selected and manual-copy hint", async () => {
      writeText.mockRejectedValueOnce(new Error("denied"));
      getTour = () => ok(tour({ run_steps: steps }));
      renderView();
      fireEvent.click((await screen.findAllByRole("button", { name: "Copy command" }))[0]!);
      expect(await screen.findByText("Press Ctrl+C / Cmd+C to copy")).toBeInTheDocument();
      expect(window.getSelection()?.toString()).toBe("pnpm run dev");
      expect(screen.queryByText("Copied")).not.toBeInTheDocument();
    });

    it.each([
      ["absent (rev 1 tour, E27)", undefined, undefined],
      ["empty", [], []],
    ])("AC-52: %s run_steps/first_tasks -> Markdown bodies only, no rows/cards/copy", async (_n, rs, ft) => {
      getTour = () => ok(tour({ run_steps: rs, first_tasks: ft }));
      renderView();
      expect(await screen.findByText("Body of local_run")).toBeInTheDocument();
      expect(screen.getByText("Body of first_tasks")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Copy command" })).not.toBeInTheDocument();
    });

    const links = [
      { label: "src/a.ts", path: "src/a.ts" },
      { label: "entry point", path: "src/b.ts" },
    ];

    it("AC-44: critical-path rows 'path — label' (path only when label equals path), before the body", async () => {
      const t = tour();
      t.sections[1].links = links;
      getTour = () => ok(t);
      renderView();
      const plain = await screen.findByText("src/a.ts");
      const labelled = screen.getByText("src/b.ts — entry point");
      const body = screen.getByText("Body of critical_paths");
      expect(plain.compareDocumentPosition(labelled) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(labelled.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it("AC-45: Open links to the provider blob URL at indexed_sha, new tab, noopener", async () => {
      const t = tour();
      t.sections[1].links = links;
      getTour = () => ok(t);
      renderView();
      const open = await screen.findByRole("link", { name: "Open src/b.ts" });
      expect(open).toHaveAttribute("href", "https://github.com/acme/api/blob/abc/src/b.ts");
      expect(open).toHaveAttribute("target", "_blank");
      expect(open.getAttribute("rel")).toContain("noopener");
    });

    it("AC-45 / E24: no Open when indexed_sha is null", async () => {
      const t = tour({ indexed_sha: null });
      t.sections[1].links = links;
      getTour = () => ok(t);
      renderView();
      await screen.findByText("src/a.ts");
      expect(screen.queryByRole("link", { name: /^Open/ })).not.toBeInTheDocument();
    });

    it("AC-45 / E24: no Open when the repo row is not available", async () => {
      repoRows = () => [];
      const t = tour();
      t.sections[1].links = links;
      getTour = () => ok(t);
      renderView();
      await screen.findByText("src/a.ts");
      expect(screen.queryByRole("link", { name: /^Open/ })).not.toBeInTheDocument();
    });

    it("AC-46: first tasks are cards with title and mono path, no complexity indicator", async () => {
      getTour = () => ok(tour({ first_tasks: [{ title: "Add a route", path: "src/routes" }, { title: "Fix a test", path: "src/a.test.ts" }] }));
      renderView();
      expect(await screen.findByText("Add a route")).toBeInTheDocument();
      expect(screen.getByText("src/routes")).toHaveClass("mono");
      expect(screen.getByText("src/a.test.ts")).toBeInTheDocument();
      expect(screen.queryByText(/complexity|easy|medium|hard/i)).not.toBeInTheDocument();
    });

    it("AC-53: reading path is a numbered list of mono paths with why, and no score", async () => {
      renderView();
      const path = await screen.findByText("src/main.ts");
      expect(path).toHaveClass("mono");
      expect(path.closest("ol")).not.toBeNull();
      expect(screen.getByText("entry point")).toBeInTheDocument();
      expect(screen.queryByText(/0\.5/)).not.toBeInTheDocument();
    });

    it("AC-55: unavailable section renders muted text and no rows, Copy or Open", async () => {
      const t = tour({ run_steps: steps });
      t.sections[1] = { ...t.sections[1], source: "facts", body: "Unavailable — index none", links: links };
      t.sections[2] = { ...t.sections[2], source: "facts", body: "Unavailable — index none" };
      getTour = () => ok(t);
      renderView();
      expect((await screen.findAllByText("Unavailable — index none")).length).toBe(2);
      expect(screen.queryByRole("button", { name: "Copy command" })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /^Open/ })).not.toBeInTheDocument();
      expect(screen.queryByText("src/a.ts")).not.toBeInTheDocument();
    });
  });

  it("AC-38: UI copy is English", async () => {
    getTour = () => noTour;
    renderView();
    expect(await screen.findByText("No onboarding tour yet")).toBeInTheDocument();
  });
});
