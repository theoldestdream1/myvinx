import { createFileRoute } from "@tanstack/react-router";
import { VCompanion } from "@/components/v/VCompanion";
import { CaptureForm } from "@/components/capture/CaptureForm";

export const Route = createFileRoute("/v-lab")({ ssr: false, component: () => (
  <div className="min-h-[200vh] p-6"><CaptureForm /><VCompanion /></div>
) });
