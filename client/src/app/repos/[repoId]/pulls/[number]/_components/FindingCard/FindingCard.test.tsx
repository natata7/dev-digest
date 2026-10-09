import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
import { FindingCard } from "./FindingCard";

afterEach(cleanup);

const FINDING: FindingRecord = {
  id: "f1",
  severity: "CRITICAL",
  category: "security",
  title: "Hardcoded Stripe secret key",
  file: "src/config.ts",
  start_line: 11,
  end_line: 11,
  rationale: "A **live** Stripe key is committed in source.",
  suggestion: "Move the key to an environment variable.",
  confidence: 0.95,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
  review_id: "r1",
  accepted_at: null,
  dismissed_at: null,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("FindingCard (smoke, both themes)", () => {
  (["dark", "light"] as const).forEach((theme) => {
    it(`renders severity + file:line + rationale in ${theme}`, () => {
      renderWithIntl(
        <div data-theme={theme}>
          <FindingCard f={FINDING} defaultExpanded onAction={() => {}} />
        </div>,
      );
      expect(screen.getByText("Hardcoded Stripe secret key")).toBeInTheDocument();
      expect(screen.getByText("src/config.ts:11")).toBeInTheDocument();
      // category label is shown alongside the severity badge
      expect(screen.getByText("security")).toBeInTheDocument();
    });
  });

  it("fires accept/dismiss actions", () => {
    const onAction = vi.fn();
    renderWithIntl(<FindingCard f={FINDING} defaultExpanded onAction={onAction} />);
    fireEvent.click(screen.getByText("Accept"));
    expect(onAction).toHaveBeenCalledWith("accept");
    fireEvent.click(screen.getByText("Dismiss"));
    expect(onAction).toHaveBeenCalledWith("dismiss");
  });

  it("links the file:line to a GitHub blob by default", () => {
    renderWithIntl(
      <FindingCard
        f={FINDING}
        defaultExpanded
        onAction={() => {}}
        repoFullName="acme/payments-api"
        headSha="abc123"
      />,
    );
    const link = screen.getByText("src/config.ts:11").closest("a");
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/acme/payments-api/blob/abc123/src/config.ts#L11",
    );
  });

  it("links the file:line to a GitLab blob when the repo's provider is gitlab", () => {
    renderWithIntl(
      <FindingCard
        f={FINDING}
        defaultExpanded
        onAction={() => {}}
        repoFullName="acme/payments-api"
        repoProvider="gitlab"
        headSha="abc123"
      />,
    );
    const link = screen.getByText("src/config.ts:11").closest("a");
    expect(link).toHaveAttribute(
      "href",
      "https://gitlab.com/acme/payments-api/-/blob/abc123/src/config.ts#L11",
    );
  });

  describe("Turn into eval case", () => {
    const accepted: FindingRecord = { ...FINDING, accepted_at: "2026-10-01T00:00:00Z" };

    it("decided finding: one click sends one request with no expectation; a second click is ignored", () => {
      const onTurnIntoEval = vi.fn();
      const { rerender } = renderWithIntl(
        <FindingCard f={accepted} defaultExpanded onTurnIntoEval={onTurnIntoEval} />,
      );
      fireEvent.click(screen.getByText("Turn into eval case"));
      expect(onTurnIntoEval).toHaveBeenCalledTimes(1);
      expect(onTurnIntoEval).toHaveBeenCalledWith();

      rerender(
        <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
          <FindingCard f={accepted} defaultExpanded onTurnIntoEval={onTurnIntoEval} evalStatus="pending" />
        </NextIntlClientProvider>,
      );
      fireEvent.click(screen.getByText("Turn into eval case"));
      expect(onTurnIntoEval).toHaveBeenCalledTimes(1);
    });

    it("shows a confirmation label once created, and when the case already existed", () => {
      const { rerender } = renderWithIntl(
        <FindingCard f={accepted} defaultExpanded onTurnIntoEval={() => {}} evalStatus="created" />,
      );
      expect(screen.getByText("Eval case created")).toBeInTheDocument();
      rerender(
        <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
          <FindingCard f={accepted} defaultExpanded onTurnIntoEval={() => {}} evalStatus="exists" />
        </NextIntlClientProvider>,
      );
      expect(screen.getByText("Eval case already exists")).toBeInTheDocument();
    });

    it("undecided finding: asks which expectation before creating", () => {
      const onTurnIntoEval = vi.fn();
      renderWithIntl(<FindingCard f={FINDING} defaultExpanded onTurnIntoEval={onTurnIntoEval} />);
      fireEvent.click(screen.getByText("Turn into eval case"));
      expect(onTurnIntoEval).not.toHaveBeenCalled();
      fireEvent.click(screen.getByText("Should not be flagged"));
      expect(onTurnIntoEval).toHaveBeenCalledWith("must_not_flag");
    });

    it("renders no button when the handler is not provided", () => {
      renderWithIntl(<FindingCard f={accepted} defaultExpanded />);
      expect(screen.queryByText("Turn into eval case")).toBeNull();
    });
  });
});
