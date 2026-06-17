import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Outlet } from "react-router-dom";
import { DomainSwitch } from "@/components/DomainSwitch";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { useDomain } from "@/contexts/DomainContext";
import { getOntology } from "@/lib/ontology";
import { Badge } from "@/components/ui/badge";

export function DashboardLayout() {
  const { domain } = useDomain();
  const ontology = getOntology(domain);
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-12 flex items-center border-b border-border/50 px-4 shrink-0 gap-3">
            <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
            <DomainSwitch />
            {domain === "clinical" && (
              <Badge variant="outline" className={`text-[10px] font-mono ${ontology.badgeClass}`}>
                SIMULATION — synthetic data only
              </Badge>
            )}
            <Badge
              variant="outline"
              className="text-[10px] font-mono border-amber-500/50 text-amber-400"
              title="Research/demo posture: kg_hyperedges, kg_pathway_runs, monitoring_events accept anonymous inserts; threat_reports is public-read. No PII, append-only. Tighten via Supabase RLS when graduating to production."
            >
              EXPERIMENT — open writes, public reads
            </Badge>

            <div className="ml-auto flex items-center gap-3">
              <LanguageSwitch />
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-primary animate-pulse-glow" />
                <span className="text-xs text-muted-foreground font-mono">SYSTEM ACTIVE</span>
              </div>
            </div>
          </header>
          <main className="flex-1 overflow-auto p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
