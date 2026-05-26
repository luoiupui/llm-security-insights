import { createContext, useContext, useEffect, useState, ReactNode } from "react";

export type Domain = "cti" | "clinical" | "archive";

interface DomainContextValue {
  domain: Domain;
  setDomain: (d: Domain) => void;
}

const DomainContext = createContext<DomainContextValue | undefined>(undefined);

const STORAGE_KEY = "threatgraph.domain";

export function DomainProvider({ children }: { children: ReactNode }) {
  const [domain, setDomainState] = useState<Domain>(() => {
    if (typeof window === "undefined") return "cti";
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "clinical" || stored === "archive" || stored === "cti") return stored;
    return "cti";
  });

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, domain);
  }, [domain]);

  const setDomain = (d: Domain) => setDomainState(d);

  return (
    <DomainContext.Provider value={{ domain, setDomain }}>
      {children}
    </DomainContext.Provider>
  );
}

export function useDomain(): DomainContextValue {
  const ctx = useContext(DomainContext);
  if (!ctx) throw new Error("useDomain must be used within DomainProvider");
  return ctx;
}
