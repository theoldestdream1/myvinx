import { createFileRoute } from "@tanstack/react-router";
import { VCompanion } from "@/components/v/VCompanion";
export const Route = createFileRoute("/v-lab")({ ssr: false, component: () => <div className="min-h-[200vh]"><VCompanion /></div> });
