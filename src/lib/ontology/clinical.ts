import type { Ontology } from "./index";

export const clinicalOntology: Ontology = {
  id: "clinical",
  label: "Clinical",
  fullName: "Clinical Knowledge Graph (Simulation)",
  badgeClass: "bg-warning/20 text-warning border-warning/40",
  entityTypes: [
    { id: "patient", label: "Patient", color: "hsl(200, 80%, 55%)" },
    { id: "condition", label: "Condition", color: "hsl(0, 72%, 55%)" },
    { id: "medication", label: "Medication", color: "hsl(160, 70%, 45%)" },
    { id: "procedure", label: "Procedure", color: "hsl(280, 70%, 60%)" },
    { id: "observation", label: "Observation", color: "hsl(190, 70%, 50%)" },
    { id: "encounter", label: "Encounter", color: "hsl(215, 12%, 55%)" },
    { id: "provider", label: "Provider", color: "hsl(50, 70%, 55%)" },
    { id: "adverse_event", label: "Adverse Event", color: "hsl(25, 95%, 53%)" },
    { id: "allergy", label: "Allergy", color: "hsl(38, 92%, 50%)" },
  ],
  relationTypes: [
    "diagnosed_with", "prescribed_for", "administered_to", "ordered_for",
    "contraindicates", "causes_adverse_event", "follows_protocol",
    "indicates", "treats", "monitored_by", "allergic_to",
  ],
  disclaimer: "Research simulation only — not for clinical use. Do NOT paste real PHI; use de-identified / synthetic notes.",
  sampleText: `DISCHARGE SUMMARY (synthetic, de-identified)
Patient: [REDACTED], 67-year-old male, MRN [REDACTED]
Encounter: 2024-09-12 to 2024-09-18, Internal Medicine
Diagnosis: Type 2 Diabetes Mellitus (E11.9), Hypertension (I10), CKD stage 3 (N18.3).
Medications prescribed: Metformin 1000mg PO BID (RxCUI 860975), Lisinopril 20mg PO daily (RxCUI 314076), Atorvastatin 40mg PO QHS (RxCUI 617318).
Procedure: HbA1c testing (LOINC 4548-4) returned 8.9%. eGFR 42 mL/min.
Observation: Blood pressure 152/94 mmHg on admission, 134/82 at discharge.
Adverse event noted: mild GI upset attributed to metformin initiation. Patient reports NKDA (no known drug allergies).
Plan: continue current regimen; nephrology follow-up in 4 weeks; reinforce dietary counselling.`,
};
