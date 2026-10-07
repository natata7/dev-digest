import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrFile } from "@devdigest/shared";
import shellMessages from "../../../../messages/en/shell.json";
import { FileCard } from "./FileCard";

const file: PrFile = {
  path: "src/a.ts",
  additions: 2,
  deletions: 0,
  patch: "@@ -1,1 +1,3 @@\n ctx\n+second\n+third",
};

let scroll: ReturnType<typeof vi.fn>;
beforeEach(() => {
  scroll = vi.fn();
  Element.prototype.scrollIntoView = scroll as unknown as typeof Element.prototype.scrollIntoView;
});
afterEach(cleanup);

const ui = (props: Partial<React.ComponentProps<typeof FileCard>>) => (
  <NextIntlClientProvider locale="en" messages={{ shell: shellMessages }}>
    <FileCard file={file} {...props} />
  </NextIntlClientProvider>
);

describe("FileCard focus", () => {
  it("does not scroll when not focused", async () => {
    render(ui({ focus: { path: "other.ts", line: 2 } }));
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    expect(scroll).not.toHaveBeenCalled();
  });

  it("opens a defaultOpen=false card when focused and scrolls to the focused line", async () => {
    render(ui({ defaultOpen: false, focus: { path: "src/a.ts", line: 2 } }));
    expect(screen.getByText("second")).toBeInTheDocument();
    await waitFor(() => expect(scroll).toHaveBeenCalled());
    const target = scroll.mock.contexts[0] as HTMLElement;
    expect(target).toHaveAttribute("data-focus-line");
    expect(target).toHaveTextContent("second");
  });

  it("falls back to the card header when the focused line is outside the rendered hunks", async () => {
    const { container } = render(ui({ defaultOpen: false, focus: { path: "src/a.ts", line: 9999 } }));
    await waitFor(() => expect(scroll).toHaveBeenCalled());
    expect(container.querySelector("[data-focus-line]")).toBeNull();
    expect(scroll.mock.contexts[0]).toBe(container.firstElementChild);
  });

  it("scrolls the card itself when focus has no line", async () => {
    const { container } = render(ui({ defaultOpen: false, focus: { path: "src/a.ts" } }));
    await waitFor(() => expect(scroll).toHaveBeenCalled());
    expect(scroll.mock.contexts[0]).toBe(container.firstElementChild);
  });

  it("stays collapsed when defaultOpen=false and not focused; header click opens it", async () => {
    render(ui({ defaultOpen: false }));
    expect(screen.queryByText("second")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("src/a.ts"));
    expect(screen.getByText("second")).toBeInTheDocument();
  });
});
