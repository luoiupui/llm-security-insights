import { Globe } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { LANGUAGES, LangCode } from "@/lib/i18n/dictionary";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

/**
 * Language switcher panel — sits in the dashboard header.
 * Re-translates the entire DOM (every text node, not just titles) on change.
 */
export function LanguageSwitch() {
  const { lang, setLang } = useLanguage();
  const current = LANGUAGES.find((l) => l.code === lang) ?? LANGUAGES[0];

  return (
    <div data-i18n-skip="true">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-2 text-xs font-mono"
            aria-label="Select language"
          >
            <Globe className="h-3.5 w-3.5" />
            <span>{current.flag}</span>
            <span className="hidden sm:inline">{current.native}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56" data-i18n-skip="true">
          <DropdownMenuLabel className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
            Language / 言語 / 언어 / 语言
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {LANGUAGES.map((l) => (
            <DropdownMenuItem
              key={l.code}
              onClick={() => setLang(l.code as LangCode)}
              className={`flex items-center justify-between gap-2 text-sm ${
                l.code === lang ? "bg-accent/50 font-semibold" : ""
              }`}
            >
              <span className="flex items-center gap-2">
                <span className="text-base">{l.flag}</span>
                <span>{l.native}</span>
              </span>
              <span className="text-[10px] font-mono text-muted-foreground uppercase">
                {l.code}
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
