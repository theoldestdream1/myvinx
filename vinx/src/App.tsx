import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Capture from "./pages/Capture";
import Query from "./pages/Query";
import Timeline from "./pages/Timeline";
import Intents from "./pages/Intents";
import Graph from "./pages/Graph";
import Settings from "./pages/Settings";
import Share from "./pages/Share";
import Quick from "./pages/Quick";
import SetupShortcuts from "./pages/SetupShortcuts";
import NotFound from "./pages/NotFound";
import { AvatarHost } from "@/components/avatar/AvatarHost";
import { OutboxFlusher } from "@/components/capture/OutboxFlusher";
import { GlobalCapture } from "@/components/capture/GlobalCapture";
import FinancialHeroDemo from "./components/demo/FinancialHeroDemo";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/capture" element={<Capture />} />
            <Route path="/query" element={<Query />} />
            <Route path="/timeline" element={<Timeline />} />
            <Route path="/intents" element={<Intents />} />
            <Route path="/graph" element={<Graph />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/share" element={<Share />} />
            <Route path="/quick" element={<Quick />} />
            <Route path="/setup/shortcuts" element={<SetupShortcuts />} />
            <Route path="/hero-demo" element={<FinancialHeroDemo />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
          <AvatarHost />
          <OutboxFlusher />
          <GlobalCapture />
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
