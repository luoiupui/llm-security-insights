import { ctiOntology } from "./cti";
import { clinicalOntology } from "./clinical";
import type { Domain } from "@/contexts/DomainContext";

export interface EntityTypeDef {
  id: string;
  label: string;
  color: string;
}

export interface Ontology {
  id: Domain;
  label: string;
  fullName: string;
  badgeClass: string;
  entityTypes: EntityTypeDef[];
  relationTypes: string[];
  disclaimer: string | null;
  sampleText: string;
}

export function getOntology(domain: Domain): Ontology {
  return domain === "clinical" ? clinicalOntology : ctiOntology;
}

export { ctiOntology, clinicalOntology };
