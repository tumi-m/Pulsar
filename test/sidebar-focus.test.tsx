import { describe, it, expect, vi } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";

/**
 * The sign-in email field lost focus after every keystroke.
 *
 * Sidebar declared its `Section` wrapper inside the component body, making it
 * a new component type on each render; React remounted every section, and the
 * input with it, whenever state changed — including on each character typed.
 * The assertion that matters is that the SAME input element survives typing.
 */

vi.mock("@/lib/sync", async (orig) => ({
  ...(await orig<typeof import("@/lib/sync")>()),
  syncConfigured: () => true,
  currentUserId: async () => null,
  onAuthChange: () => () => {},
}));

describe("Sidebar sign-in field", () => {
  it("keeps the same input, and focus, while typing", async () => {
    const { Sidebar } = await import("@/components/Sidebar");
    render(<Sidebar />);
    await act(async () => {
      window.dispatchEvent(new CustomEvent("pulsar-toggle-sidebar"));
    });
    const input = (await screen.findByPlaceholderText(/@/)) as HTMLInputElement;
    input.focus();
    for (const ch of "me@x.io") {
      await act(async () => {
        fireEvent.change(document.activeElement!, { target: { value: (document.activeElement as HTMLInputElement).value + ch } });
      });
    }
    const after = screen.getByPlaceholderText(/@/) as HTMLInputElement;
    expect(after).toBe(input);
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe("me@x.io");
  });
});
