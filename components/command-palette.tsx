"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, Building2, Loader2, Plus, Search, Settings } from "lucide-react";
import { useRouter } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useVisibleNavGroups } from "@/components/navigation";
import { usePermissions } from "@/features/auth";
import { searchInstitutions, useInstitutions } from "@/features/institutions";
import { cn } from "@/lib/utils";

const RESULT_SIZE = 8;
const MIN_QUERY = 2;

type Group = "pages" | "institutions";

interface PaletteItem {
  key: string;
  group: Group;
  label: string;
  sub?: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

function fold(s: string) {
  return s.toLocaleLowerCase("tr").normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Cmd/Ctrl+K komut paleti: sayfalara git, yeni demo aç, kurum ara (ad, yetkili, e-posta, telefon).
 * Kurum listesi zaten önbellekte (menü rozeti de onu kullanır); arama istemcide yapılır.
 */
export function CommandPalette({ shortcut = true }: { shortcut?: boolean } = {}) {
  const t = useTranslations("shell.palette");
  const tNav = useTranslations("navigation");
  const router = useRouter();
  const navGroups = useVisibleNavGroups();
  const { canAccessPath } = usePermissions();

  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const institutions = useInstitutions();

  useEffect(() => {
    // Kısayol tek yerde dinlenir (masaüstü kenar çubuğu); mobil menüdeki kopya yalnız düğmedir.
    if (!shortcut) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shortcut]);

  useEffect(() => {
    const id = setTimeout(() => setQ(input.trim()), 150);
    return () => clearTimeout(id);
  }, [input]);

  const searching = q.length >= MIN_QUERY;

  const pages = useMemo<PaletteItem[]>(() => {
    // Menüyle aynı görünürlük: rol süzgeci useVisibleNavGroups'ta.
    const nav: PaletteItem[] = navGroups
      .flatMap((g) => g.items)
      .map((it) => ({
        key: `p-${it.href}`,
        group: "pages" as const,
        label: tNav(it.translationKey),
        href: it.href,
        icon: it.icon,
      }));
    nav.push({ key: "p-new-demo", group: "pages", label: t("newDemo"), href: "/institutions?new=demo", icon: Plus });
    nav.push({ key: "p-/settings", group: "pages", label: tNav("settings"), href: "/settings", icon: Settings });
    const needle = fold(input.trim());
    return needle ? nav.filter((p) => fold(p.label).includes(needle)) : nav;
  }, [input, navGroups, t, tNav]);

  const found = useMemo<PaletteItem[]>(() => {
    if (!searching) return [];
    return searchInstitutions(institutions.data ?? [], q)
      .slice(0, RESULT_SIZE)
      .map((inst) => ({
        key: `i-${inst.id}`,
        group: "institutions" as const,
        label: inst.name,
        sub: inst.crm ? [inst.crm.contactName, inst.crm.contactEmail].join(" · ") : undefined,
        href: `/institutions/${inst.id}`,
        icon: Building2,
      }));
  }, [searching, institutions.data, q]);

  const items = useMemo<PaletteItem[]>(() => [...pages, ...found], [pages, found]);
  const activeIndex = Math.min(active, Math.max(0, items.length - 1));

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const go = (item: PaletteItem | undefined) => {
    if (!item || !canAccessPath(item.href)) return;
    setOpen(false);
    router.push(item.href);
  };

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setInput("");
      setQ("");
      setActive(0);
    }
  };

  const onInputKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(items[activeIndex]);
    }
  };

  let lastGroup: Group | null = null;
  const loading = searching && institutions.isLoading;

  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        className="rounded-full text-muted-foreground"
        onClick={() => setOpen(true)}
        aria-label={t("open")}
        title={t("open")}
      >
        <Search />
      </Button>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="top-[12%] translate-y-0 data-[state=open]:slide-in-from-top-[10%] data-[state=closed]:slide-out-to-top-[10%] max-w-xl gap-0 p-0 overflow-hidden">
          <DialogTitle className="sr-only">{t("title")}</DialogTitle>
          <DialogDescription className="sr-only">{t("description")}</DialogDescription>
          <div className="flex items-center gap-2 border-b border-border px-4 py-3 pr-12 ring-inset focus-within:ring-2 focus-within:ring-ring/60">
            {loading ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
            ) : (
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <input
              autoFocus
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setActive(0);
              }}
              onKeyDown={onInputKey}
              placeholder={t("placeholder")}
              aria-label={t("placeholder")}
              aria-controls="command-palette-list"
              aria-activedescendant={items[activeIndex] ? `cp-${items[activeIndex].key}` : undefined}
              className="h-8 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div ref={listRef} id="command-palette-list" role="listbox" className="max-h-[55vh] overflow-y-auto p-2">
            {items.map((item, index) => {
              const header = item.group !== lastGroup ? item.group : null;
              lastGroup = item.group;
              const Icon = item.icon;
              return (
                <div key={item.key}>
                  {header && (
                    <p className="px-2 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                      {t(`groups.${header}`)}
                    </p>
                  )}
                  <button
                    type="button"
                    id={`cp-${item.key}`}
                    role="option"
                    aria-selected={index === activeIndex}
                    data-index={index}
                    onMouseMove={() => setActive(index)}
                    onClick={() => go(item)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm",
                      index === activeIndex ? "bg-accent text-foreground" : "text-foreground/90"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{item.label}</span>
                      {item.sub && <span className="block truncate text-xs text-muted-foreground">{item.sub}</span>}
                    </span>
                    {index === activeIndex && <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                  </button>
                </div>
              );
            })}
            {searching && institutions.isError && (
              <p role="alert" className="px-2 py-3 text-sm text-destructive">
                {t("searchFailed")}
              </p>
            )}
            {searching && !loading && !institutions.isError && found.length === 0 && (
              <p className="px-2 py-3 text-sm text-muted-foreground">{t("noResults")}</p>
            )}
            {!searching && input.trim().length > 0 && input.trim().length < MIN_QUERY && (
              <p className="px-2 py-3 text-xs text-muted-foreground">{t("minChars", { count: MIN_QUERY })}</p>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
            <span className="hidden sm:inline">{t("hint")}</span>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
