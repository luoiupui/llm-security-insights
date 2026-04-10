import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DashboardLayout } from "@/components/DashboardLayout";
import Overview from "./pages/Overview";
import DataIngestion from "./pages/DataIngestion";
import KGConstruction from "./pages/KGConstruction";
import Attribution from "./pages/Attribution";
import Experiments from "./pages/Experiments";
import ThreatFeed from "./pages/ThreatFeed";
import SettingsPage from "./pages/SettingsPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route element={<DashboardLayout />}>
            <Route path="/" element={<Overview />} />
            <Route path="/data-ingestion" element={<DataIngestion />} />
            <Route path="/kg-construction" element={<KGConstruction />} />
            <Route path="/attribution" element={<Attribution />} />
            <Route path="/experiments" element={<Experiments />} />
            <Route path="/threat-feed" element={<ThreatFeed />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
