import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DomainProvider } from "@/contexts/DomainContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import Overview from "./pages/Overview";
import DataIngestion from "./pages/DataIngestion";
import KGConstruction from "./pages/KGConstruction";
import Attribution from "./pages/Attribution";
import Experiments from "./pages/Experiments";
import ThreatFeed from "./pages/ThreatFeed";
import SettingsPage from "./pages/SettingsPage";
import ImplementationLog from "./pages/ImplementationLog";
import GitHubSync from "./pages/GitHubSync";
import AISystemThreatModel from "./pages/AISystemThreatModel";
import PrivacyFLLab from "./pages/PrivacyFLLab";
import FineTuneLab from "./pages/FineTuneLab";
import RedactionLab from "./pages/RedactionLab";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <DomainProvider>
        <LanguageProvider>
        <Routes>
          <Route element={<DashboardLayout />}>
            <Route path="/" element={<Overview />} />
            <Route path="/data-ingestion" element={<DataIngestion />} />
            <Route path="/kg-construction" element={<KGConstruction />} />
            <Route path="/attribution" element={<Attribution />} />
            <Route path="/experiments" element={<Experiments />} />
            <Route path="/threat-feed" element={<ThreatFeed />} />
            <Route path="/implementation-log" element={<ImplementationLog />} />
            <Route path="/github-sync" element={<GitHubSync />} />
            <Route path="/threat-model" element={<AISystemThreatModel />} />
            <Route path="/privacy-fl-lab" element={<PrivacyFLLab />} />
            <Route path="/finetune-lab" element={<FineTuneLab />} />
            <Route path="/redaction-lab" element={<RedactionLab />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
        </LanguageProvider>
        </DomainProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
