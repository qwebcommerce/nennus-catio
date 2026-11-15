import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Button } from "@/shared/ui/Button";

describe("shared button", () => {
  it("defaults to a safe non-submit button", () => {
    const click = vi.fn();
    render(<Button onClick={click}>Retry</Button>);
    const button = screen.getByRole("button", { name: "Retry" });
    expect(button).toHaveAttribute("type", "button");
    fireEvent.click(button);
    expect(click).toHaveBeenCalledOnce();
  });
  it("honours disabled state", () => {
    const click = vi.fn();
    render(
      <Button disabled onClick={click}>
        Not ready
      </Button>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Not ready" }));
    expect(click).not.toHaveBeenCalled();
  });
});
