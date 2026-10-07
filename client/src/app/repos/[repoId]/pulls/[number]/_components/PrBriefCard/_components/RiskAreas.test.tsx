import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrBrief, Risk } from "@devdigest/shared";
import briefMessages from "../../../../../../../../../messages/en/brief.json";

let brief: PrBrief | null = null;
vi.mock("@/lib/hooks/brief", () => ({ usePrBrief: () => ({ data: brief }) }));

import { RiskAreas } from "./RiskAreas";

afterEach(cleanup);

const risk = (title: string, severity: Risk["severity"], file_refs: string[] = [], explanation = `${title} expl`): Risk => ({
  kind: "k", title, explanation, severity, file_refs,
});
const withRisks = (risks: Risk[]) => {
  brief = { risks: { risks } } as unknown as PrBrief;
};

function renderRisks(onOpenFile = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ brief: briefMessages }}>
      <RiskAreas prId="pr-1" onOpenFile={onOpenFile} />
    </NextIntlClientProvider>,
  );
  return onOpenFile;
}

describe("RiskAreas", () => {
  it("renders nothing without a brief", () => {
    brief = null;
    renderRisks();
    expect(screen.queryByText("Risk areas")).not.toBeInTheDocument();
  });

  it("sorts high → medium → low, stable within a level, with severity icons", () => {
    withRisks([risk("L1", "low"), risk("H1", "high"), risk("M1", "medium"), risk("H2", "high"), risk("L2", "low")]);
    renderRisks();
    expect(screen.getByText("Risk areas")).toBeInTheDocument();
    const titles = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(titles.map((t) => t?.match(/[HML]\d/)?.[0])).toEqual(["H1", "H2", "M1", "L1", "L2"]);
    expect(screen.getAllByRole("img", { name: "High" })).toHaveLength(2);
    expect(screen.getByRole("img", { name: "Medium" })).toBeInTheDocument();
    expect(screen.getAllByRole("img", { name: "Low" })).toHaveLength(2);
  });

  it("explanation is hidden until the chevron is toggled (aria-expanded)", () => {
    withRisks([risk("H1", "high")]);
    renderRisks();
    expect(screen.queryByText("H1 expl")).not.toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: "Show explanation" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(screen.getByText("H1 expl")).toBeInTheDocument();
    const hide = screen.getByRole("button", { name: "Hide explanation" });
    expect(hide).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(hide);
    expect(screen.queryByText("H1 expl")).not.toBeInTheDocument();
  });

  it("file link click → onOpenFile(path)", () => {
    withRisks([risk("H1", "high", ["src/h.ts"])]);
    const onOpenFile = renderRisks();
    fireEvent.click(screen.getByRole("button", { name: "Open src/h.ts in Files changed" }));
    expect(onOpenFile).toHaveBeenCalledWith("src/h.ts");
  });

  it("empty state when no risks", () => {
    withRisks([]);
    renderRisks();
    expect(screen.getByText("No notable risks flagged.")).toBeInTheDocument();
  });

  it("renders model text as plain text", () => {
    const evil = '<img src=x onerror="alert(1)"> **bold**';
    withRisks([risk(evil, "high", [], evil)]);
    renderRisks();
    fireEvent.click(screen.getByRole("button", { name: "Show explanation" }));
    expect(screen.getAllByText(evil)).toHaveLength(2);
    expect(document.querySelector("img")).toBeNull();
    expect(document.querySelector("strong")).toBeNull();
  });
});
