// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PasswordField } from "@/components/ui/PasswordField";

afterEach(cleanup);

describe("PasswordField", () => {
  it("shows and hides what was typed with an accessible toggle", () => {
    render(<PasswordField label="סיסמה" name="password" />);
    const input = screen.getByLabelText("סיסמה", { selector: "input" });
    const toggle = screen.getByRole("button", { name: "הצגת הסיסמה" });

    expect(input).toHaveProperty("type", "password");
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(toggle.getAttribute("aria-controls")).toBe(input.id);

    fireEvent.click(toggle);
    expect(input).toHaveProperty("type", "text");
    expect(toggle.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(toggle);
    expect(input).toHaveProperty("type", "password");
  });
});
