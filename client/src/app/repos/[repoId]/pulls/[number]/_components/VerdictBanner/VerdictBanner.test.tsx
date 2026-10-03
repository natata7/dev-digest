import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/prReview.json";
import { VerdictBanner } from "./VerdictBanner";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("VerdictBanner (smoke)", () => {
  it("shows verdict label + score + finding/blocker counts", () => {
    renderWithIntl(
      <VerdictBanner
        verdict="request_changes"
        summary="Hardcoded secret introduced."
        score={42}
        findingsCount={1}
        blockers={1}
        agentName="Security Reviewer"
      />,
    );
    expect(screen.getByText("Request changes")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText(/1 findings · 1 blockers/)).toBeInTheDocument();
  });

  it("shows the run cost line when run data is provided", () => {
    renderWithIntl(
      <VerdictBanner
        verdict="approve"
        summary={null}
        score={92}
        findingsCount={0}
        blockers={0}
        run={{ cost_usd: 0.014, tokens_in: 8200, tokens_out: 1300 }}
      />,
    );
    expect(screen.getByText("$0.014 · 8.2K→1.3K")).toBeInTheDocument();
  });

  it("shows — for a run without cost/token data (never $0.00)", () => {
    renderWithIntl(
      <VerdictBanner
        verdict="approve"
        summary={null}
        score={92}
        findingsCount={0}
        blockers={0}
        run={null}
      />,
    );
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("verdict=null renders a neutral banner: summary only, no label/counts", () => {
    renderWithIntl(
      <VerdictBanner verdict={null} summary="Plain summary." score={null} findingsCount={0} blockers={0} />,
    );
    expect(screen.getByText("Plain summary.")).toBeInTheDocument();
    expect(screen.queryByText(/findings/)).not.toBeInTheDocument();
    expect(screen.queryByText("Request changes")).not.toBeInTheDocument();
    expect(screen.queryByText("PR score")).not.toBeInTheDocument();
  });

  it("renders optional actions and footer slots", () => {
    renderWithIntl(
      <VerdictBanner
        verdict={null}
        summary="s"
        score={null}
        findingsCount={0}
        blockers={0}
        actions={<button>act</button>}
        footer={<span>foot</span>}
      />,
    );
    expect(screen.getByRole("button", { name: "act" })).toBeInTheDocument();
    expect(screen.getByText("foot")).toBeInTheDocument();
  });

  it("omits actions/footer when not provided", () => {
    renderWithIntl(
      <VerdictBanner verdict="approve" summary="s" score={90} findingsCount={0} blockers={0} />,
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
