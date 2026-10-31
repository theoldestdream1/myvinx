import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

const navigate = vi.fn();
vi.mock("@/lib/router-compat", () => ({ useNavigate: () => navigate }));
vi.mock("@/hooks/useVoiceRecording", () => ({
  useVoiceRecording: () => ({ isRecording: false, startRecording: vi.fn(), stopRecording: vi.fn(), cancelRecording: vi.fn() }),
}));
vi.mock("@/hooks/useCaptureMemory", () => ({ useCaptureMemory: () => ({ capture: vi.fn() }) }));
vi.mock("@/lib/v/voice", () => ({ vSpeak: vi.fn(), vHush: vi.fn() }));

import { VCompanion } from "./VCompanion";
import { vAgent } from "@/lib/avatar/bus";

function openMenu() {
  fireEvent.click(screen.getByLabelText(/V, your companion/));
}

describe("V's menu", () => {
  beforeEach(() => { navigate.mockClear(); window.history.pushState({}, "", "/dashboard"); });

  it("Ask opens the Ask page", () => {
    render(<VCompanion />);
    openMenu();
    fireEvent.click(screen.getByRole("button", { name: /^Ask$/ }));
    expect(navigate).toHaveBeenCalledWith("/query");
  });

  it("Remind opens reminders", () => {
    render(<VCompanion />);
    openMenu();
    fireEvent.click(screen.getByRole("button", { name: /^Remind$/ }));
    expect(navigate).toHaveBeenCalledWith("/intents");
  });

  it("Ask on the Ask page focuses the question box instead of doing nothing", () => {
    window.history.pushState({}, "", "/query");
    const spy = vi.fn();
    window.addEventListener("vinx:focus-ask", spy);
    render(<VCompanion />);
    openMenu();
    fireEvent.click(screen.getByRole("button", { name: /^Ask$/ }));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("app chatter does not close an open menu", () => {
    render(<VCompanion />);
    openMenu();
    act(() => { (vAgent as any).say?.("hello", "happy"); });
    expect(screen.getByRole("button", { name: /^Ask$/ })).toBeTruthy();
  });
});
