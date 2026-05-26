import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { LangCode, translateString } from "@/lib/i18n/dictionary";

interface LanguageContextValue {
  lang: LangCode;
  setLang: (l: LangCode) => void;
  t: (s: string) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

const STORAGE_KEY = "tg.language";

/**
 * Whole-DOM runtime translator. Walks every text node under <body>, stores the
 * original English text in a WeakMap, and rewrites the visible content to the
 * active language using the dictionary (or the alien cipher). A MutationObserver
 * re-translates newly inserted nodes so dynamic content stays localized.
 *
 * This intentionally avoids touching component source — every dashboard string,
 * not just main titles, gets translated as long as it's a DOM text node.
 */
const ORIGINALS = new WeakMap<Text, string>();

function isInsideEditable(node: Node): boolean {
  let n: Node | null = node.parentNode;
  while (n && n instanceof Element) {
    const tag = n.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SCRIPT" || tag === "STYLE" || tag === "CODE" || tag === "PRE") return true;
    if ((n as HTMLElement).isContentEditable) return true;
    if ((n as HTMLElement).dataset?.i18nSkip === "true") return true;
    n = n.parentNode;
  }
  return false;
}

function collectTextNodes(root: Node): Text[] {
  const out: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      if (isInsideEditable(node)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let n = walker.nextNode();
  while (n) {
    out.push(n as Text);
    n = walker.nextNode();
  }
  return out;
}

function applyLang(lang: LangCode, root: Node = document.body) {
  const nodes = collectTextNodes(root);
  for (const node of nodes) {
    const original = ORIGINALS.get(node) ?? node.nodeValue ?? "";
    if (!ORIGINALS.has(node)) ORIGINALS.set(node, original);
    const next = translateString(original, lang);
    if (node.nodeValue !== next) node.nodeValue = next;
  }
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<LangCode>(() => {
    if (typeof window === "undefined") return "en";
    return (localStorage.getItem(STORAGE_KEY) as LangCode) || "en";
  });

  const setLang = useCallback((l: LangCode) => {
    setLangState(l);
    try { localStorage.setItem(STORAGE_KEY, l); } catch { /* ignore */ }
  }, []);

  const t = useCallback((s: string) => translateString(s, lang), [lang]);

  useEffect(() => {
    applyLang(lang);
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === "childList") {
          m.addedNodes.forEach((n) => {
            if (n.nodeType === Node.TEXT_NODE) {
              const tn = n as Text;
              if (!isInsideEditable(tn) && tn.nodeValue?.trim()) {
                const orig = tn.nodeValue ?? "";
                ORIGINALS.set(tn, orig);
                const next = translateString(orig, lang);
                if (tn.nodeValue !== next) tn.nodeValue = next;
              }
            } else if (n.nodeType === Node.ELEMENT_NODE) {
              applyLang(lang, n);
            }
          });
        } else if (m.type === "characterData") {
          const tn = m.target as Text;
          if (isInsideEditable(tn)) continue;
          // If something else changed the text (e.g. React render), capture new original
          const stored = ORIGINALS.get(tn);
          const current = tn.nodeValue ?? "";
          const expected = stored ? translateString(stored, lang) : null;
          if (expected !== null && current === expected) continue;
          ORIGINALS.set(tn, current);
          const next = translateString(current, lang);
          if (tn.nodeValue !== next) tn.nodeValue = next;
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [lang]);

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
