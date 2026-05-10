import { useDomain } from "@/contexts/DomainContext";
import { Shield, Stethoscope } from "lucide-react";
import { cn } from "@/lib/utils";

export function DomainSwitch() {
  const { domain, setDomain } = useDomain();
  return (
    <div className="inline-flex items-center rounded-md border border-border/50 bg-secondary/40 p-0.5 text-xs font-mono">
      <button
        onClick={() => setDomain("cti")}
        className={cn(
          "flex items-center gap-1 px-2 py-1 rounded transition-colors",
          domain === "cti" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"
        )}
        title="Cyber Threat Intelligence (default)"
      >
        <Shield className="w-3 h-3" /> CTI
      </button>
      <button
        onClick={() => setDomain("clinical")}
        className={cn(
          "flex items-center gap-1 px-2 py-1 rounded transition-colors",
          domain === "clinical" ? "bg-warning/20 text-warning" : "text-muted-foreground hover:text-foreground"
        )}
        title="Clinical KG — research simulation only"
      >
        <Stethoscope className="w-3 h-3" /> Clinical
      </button>
    </div>
  );
}

export function DomainBanner({ className }: { className?: string }) {
  const { domain } = useDomain();
  if (domain !== "clinical") return null;
  return (
    <div className={cn(
      "flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning",
      className
    )}>
      <Stethoscope className="w-4 h-4 mt-0.5 shrink-0" />
      <div>
        <span className="font-semibold">Clinical mode — research simulation only.</span>{" "}
        <span className="text-warning/80">
          Do NOT paste real patient data. Use de-identified or synthetic notes. No HIPAA/GDPR posture.
          Same pipeline as CTI; only the ontology, prompt vocabulary, and validators are swapped.
        </span>
      </div>
    </div>
  );
}
