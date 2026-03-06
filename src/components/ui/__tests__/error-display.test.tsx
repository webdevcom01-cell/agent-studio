// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ErrorDisplay } from "../error-display";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

function createError(message: string, digest?: string): Error & { digest?: string } {
  const err = new Error(message) as Error & { digest?: string };
  if (digest) err.digest = digest;
  return err;
}

describe("ErrorDisplay", () => {
  it("renders the provided title", () => {
    render(
      <ErrorDisplay
        error={createError("test error")}
        reset={() => {}}
        title="Flow Editor Error"
      />
    );

    expect(screen.getByText("Flow Editor Error")).toBeDefined();
  });

  it("renders default title when none provided", () => {
    render(
      <ErrorDisplay error={createError("test error")} reset={() => {}} />
    );

    expect(screen.getByText("Something went wrong")).toBeDefined();
  });

  it("renders generic message text", () => {
    render(
      <ErrorDisplay error={createError("test error")} reset={() => {}} />
    );

    expect(
      screen.getByText("An unexpected error occurred. Please try again.")
    ).toBeDefined();
  });

  it("calls reset when Try Again is clicked", () => {
    const resetFn = vi.fn();

    render(
      <ErrorDisplay error={createError("test error")} reset={resetFn} />
    );

    fireEvent.click(screen.getByText("Try Again"));
    expect(resetFn).toHaveBeenCalledOnce();
  });

  it("renders Back to Dashboard link pointing to /", () => {
    render(
      <ErrorDisplay error={createError("test error")} reset={() => {}} />
    );

    const link = screen.getByText("Back to Dashboard");
    expect(link.closest("a")?.getAttribute("href")).toBe("/");
  });

  it("logs the error on mount", () => {
    const err = createError("logged error");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(<ErrorDisplay error={err} reset={() => {}} />);

    expect(errorSpy).toHaveBeenCalledWith(err);
  });
});
