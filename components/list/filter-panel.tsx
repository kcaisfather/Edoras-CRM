"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * Detaylı süzgeç yapı taşları (Adaylar + Soğuk listeler aynı görünümü kullanır):
 * araç satırında `FilterToggle` ("Filtreler (n)") → altında açılan `FilterPanel` (alan ızgarası + "Temizle") →
 * panel kapalıyken de görünen `ActiveFilterChips`. Değerler URL'de durur (sayfa yenilenince / bağlantıyla korunur).
 */

const ALL = "__all__";

export function FilterToggle({
  open,
  onToggle,
  activeCount,
  controlsId,
}: {
  open: boolean;
  onToggle: () => void;
  activeCount: number;
  controlsId: string;
}) {
  const t = useTranslations("list.filters");
  return (
    <Button
      variant={activeCount > 0 ? "secondary" : "outline"}
      size="sm"
      className="h-9"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={controlsId}
    >
      <SlidersHorizontal />
      {t("toggle")}
      {activeCount > 0 && (
        <span className="ml-0.5 rounded-full bg-primary px-1.5 text-[11px] font-semibold leading-5 text-primary-foreground">
          {activeCount}
        </span>
      )}
    </Button>
  );
}

export function FilterPanel({
  id,
  open,
  activeCount,
  onClear,
  children,
}: {
  id: string;
  open: boolean;
  activeCount: number;
  onClear: () => void;
  children: ReactNode;
}) {
  const t = useTranslations("list.filters");
  if (!open) return null;
  return (
    <section id={id} aria-label={t("panel")} className="rounded-xl border border-border bg-card/60 p-3 shadow-sm sm:p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{children}</div>
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/60 pt-3">
        <span className="text-xs text-muted-foreground">{t("hint")}</span>
        <Button variant="ghost" size="sm" onClick={onClear} disabled={activeCount === 0}>
          <X />
          {t("clear")}
        </Button>
      </div>
    </section>
  );
}

export function FilterField({ id, label, className, children }: { id: string; label: string; className?: string; children: ReactNode }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

/** Serbest metin süzgeci: yazarken 300 ms bekleyip URL'ye yazar (SearchBox ile aynı), sağda temizle. */
export function FilterTextInput({
  id,
  value,
  onChange,
  placeholder,
  inputMode,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  inputMode?: "text" | "tel" | "email" | "numeric";
}) {
  const t = useTranslations("list.filters");
  const [input, setInput] = useState(value);
  const [synced, setSynced] = useState(value);
  if (value !== synced) {
    // URL dışarıdan değişti (Temizle / çip kaldırıldı) → kutuyu eşitle
    setSynced(value);
    setInput(value);
  }
  useEffect(() => {
    const timer = setTimeout(() => {
      if (input !== value) onChange(input);
    }, 300);
    return () => clearTimeout(timer);
  }, [input, value, onChange]);
  return (
    <div className="relative">
      <Input
        id={id}
        value={input}
        inputMode={inputMode}
        onChange={(e) => setInput(e.target.value)}
        placeholder={placeholder}
        className="h-9 pr-9"
      />
      {input && (
        <Button
          variant="ghost"
          size="icon-xs"
          className="absolute right-1 top-1/2 -translate-y-1/2"
          onClick={() => {
            setInput("");
            onChange("");
          }}
          aria-label={t("clearField")}
          title={t("clearField")}
        >
          <X />
        </Button>
      )}
    </div>
  );
}

/** Aranabilir tek seçim (il, ilçe, program…): seçenekler veriden gelir. */
export function FilterCombobox({
  id,
  value,
  onChange,
  options,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  placeholder: string;
}) {
  const t = useTranslations("list.filters");
  return (
    <Combobox
      id={id}
      value={value}
      onChange={onChange}
      options={options}
      placeholder={placeholder}
      emptyText={t("noOption")}
      clearLabel={t("clearField")}
      className="h-9"
    />
  );
}

/** Sabit seçenekli süzgeç (durum, kaynak, var/yok…): "" = hepsi. */
export function FilterSelect({
  id,
  value,
  onChange,
  options,
  allLabel,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
  allLabel: string;
}) {
  return (
    <Select value={value || ALL} onValueChange={(v) => onChange(v === ALL ? "" : v)}>
      <SelectTrigger id={id} className="h-9 w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export interface ActiveFilterChip {
  key: string;
  /** "İl: Edirne" gibi kısa etiket. */
  label: string;
  onRemove: () => void;
}

/** Etkin süzgeçler (panel kapalıyken de görünür): tek tek kaldır ya da hepsini temizle. */
export function ActiveFilterChips({ chips, onClearAll }: { chips: ActiveFilterChip[]; onClearAll: () => void }) {
  const t = useTranslations("list.filters");
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label={t("active")}>
      {chips.map((c) => (
        <span
          key={c.key}
          className="inline-flex max-w-full items-center gap-1 rounded-full border border-primary/30 bg-primary/10 py-0.5 pl-2.5 pr-1 text-xs text-foreground"
        >
          <span className="truncate">{c.label}</span>
          <button
            type="button"
            onClick={c.onRemove}
            className="rounded-full p-0.5 text-muted-foreground hover:bg-primary/15 hover:text-foreground"
            aria-label={t("remove", { label: c.label })}
            title={t("remove", { label: c.label })}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <Button variant="ghost" size="sm" className="h-7 px-2" onClick={onClearAll}>
        {t("clear")}
      </Button>
    </div>
  );
}
