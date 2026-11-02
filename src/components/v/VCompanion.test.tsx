import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

const navigate = vi.fn();
vi.mock("@/lib/router-compat", () => ({ useNavigate: () => navigate, useLocation: () => ({ pathname: (globalThis as { __vPath?: string }).__vPath ?? "/dashboard" }) }));
vi.mock("@/hooks/useVoiceRecording", () => ({
  useVoiceRecording: () => ({ isRecording: false, startRecording: vi.fn(), stopRecording: vi.fn(), cancelRecording: vi.fn() }),
}));
vi.mock("@/hooks/useCaptureMemory", () => ({ useCaptureMemory: () => ({ capture: vi.fn() }) }));
vi.mock("@/lib/v/voice", () => ({ vSpeak: vi.fn(), vHush: vi.fn() }));

import { VCompanion } from "./VCompanion";
import { vAgent } from "@/lib/avatar/bus";
import { loadPrefs, savePrefs } from '@/lib/avatar/prefs';

function openMenu() {
  fireEvent.click(screen.getByLabelText(/V, your companion/));
}

describe("V's menu", () => {
  beforeEach(() => { localStorage.clear(); navigate.mockClear(); window.history.pushState({}, "", "/dashboard"); });

  it('hides immediately when Show V is disabled and returns when enabled', () => {
    render(<VCompanion />);
    expect(screen.getByLabelText(/V, your companion/)).toBeInTheDocument();
    act(() => savePrefs({ ...loadPrefs(), enabled: false }));
    expect(screen.queryByLabelText(/V, your companion/)).toBeNull();
    act(() => savePrefs({ ...loadPrefs(), enabled: true }));
    expect(screen.getByLabelText(/V, your companion/)).toBeInTheDocument();
  });

  it('does not render when the saved preference is off', () => {
    savePrefs({ ...loadPrefs(), enabled: false });
    render(<VCompanion />);
    expect(screen.queryByLabelText(/V, your companion/)).toBeNull();
  });

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
