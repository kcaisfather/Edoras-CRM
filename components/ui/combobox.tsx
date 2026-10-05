"use client";

import * as React from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { filterOptions, normalizeSearch } from "@/lib/data/tr-locations";

export type ComboboxOption = { value: string; label: string };

export interface ComboboxProps {
  id?: string;
  name?: string;
  /** Seçili değer ("" = boş). Listede olmayan (eski serbest metin) değer de gösterilir. */
  value: string;
  onChange: (value: string) => void;
  options: readonly (string | ComboboxOption)[];
  placeholder?: string;
  /** Filtre sonucu boşken listede görünen metin. */
  emptyText?: React.ReactNode;
  /** Değer listede yoksa altında görünen küçük uyarı (ör. "listede yok"). */
  notInListText?: React.ReactNode;
  /** Temizle (x) düğmesinin erişilebilir adı. */
  clearLabel?: string;
  disabled?: boolean;
  readOnly?: boolean;
  /** Listede olmayan yazılı metni Enter/blur ile kabul et (ör. Türkiye dışı adresler). */
  allowCustom?: boolean;
  onBlur?: () => void;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  /** Input elemanının sınıfı. */
  className?: string;
  /** Dış sarmalayıcının sınıfı. */
  wrapperClassName?: string;
  /** Performans için en fazla bu kadar seçenek çizilir (varsayılan 200). */
  maxRendered?: number;
}

const DEFAULT_MAX_RENDERED = 200;

const toOption = (o: string | ComboboxOption): ComboboxOption => (typeof o === "string" ? { value: o, label: o } : o);

/**
 * Aranabilir açılır liste (ARIA combobox + listbox). Yeni bağımlılık yok; liste portal değil,
 * input'un altında mutlak konumlu çizilir → Radix Dialog odak tuzağı içinde de çalışır.
 * Arama Türkçe duyarlıdır (normalizeSearch): "ist", "İST", "ıst" → İstanbul.
 */
export const Combobox = React.forwardRef<HTMLInputElement, ComboboxProps>(function Combobox(
  {
    id,
    name,
    value,
    onChange,
    options,
    placeholder,
    emptyText,
    notInListText,
    clearLabel,
    disabled,
    readOnly,
    allowCustom,
    onBlur,
    "aria-invalid": ariaInvalid,
    "aria-describedby": ariaDescribedBy,
    "aria-label": ariaLabel,
    "aria-labelledby": ariaLabelledBy,
    className,
    wrapperClassName,
    maxRendered = DEFAULT_MAX_RENDERED,
  },
  ref,
) {
  const autoId = React.useId();
  const inputId = id ?? `combobox-${autoId}`;
  const listId = `${inputId}-listbox`;
  const hintId = `${inputId}-hint`;
  const optionId = (i: number) => `${listId}-opt-${i}`;

  const inputRef = React.useRef<HTMLInputElement>(null);
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  React.useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);

  const [open, setOpen] = React.useState(false);
  /** null = kullanıcı yazmıyor (input seçili değeri gösterir). */
  const [query, setQuery] = React.useState<string | null>(null);
  const [active, setActive] = React.useState(-1);

  const opts = React.useMemo(() => options.map(toOption), [options]);
  const findExact = React.useCallback(
    (text: string) => {
      const key = normalizeSearch(text);
      if (!key) return null;
      return opts.find((o) => normalizeSearch(o.value) === key || normalizeSearch(o.label) === key) ?? null;
    },
    [opts],
  );
  const selected = React.useMemo(() => findExact(value ?? ""), [findExact, value]);
  const displayValue = selected?.label ?? value ?? "";
  const notInList = !!value && !selected && opts.length > 0 && notInListText != null;
  const inactive = !!disabled || !!readOnly;
  /** Seçeneksiz serbest metin modunda liste hiç açılmaz. */
  const hasList = opts.length > 0 || !allowCustom;

  const visible = React.useMemo(() => {
    const filtered = filterOptions(query ?? "", opts);
    return filtered.length > maxRendered ? filtered.slice(0, maxRendered) : filtered;
  }, [query, opts, maxRendered]);
  const activeIndex = active < visible.length ? active : -1;

  const close = React.useCallback(() => {
    setOpen(false);
    setQuery(null);
    setActive(-1);
  }, []);

  const commit = (next: string) => {
    if (next !== value) onChange(next);
    close();
  };

  /** Yazılı metni değere çevirir: tam eşleşme → seçenek, boş → "", serbest metin → allowCustom ise kendisi. */
  const resolveTyped = (text: string): string | null => {
    const trimmed = text.replace(/\s+/g, " ").trim();
    if (!trimmed) return "";
    const exact = findExact(trimmed);
    if (exact) return exact.value;
    return allowCustom ? trimmed : null;
  };

  const openList = (direction: 1 | -1 = 1) => {
    if (inactive || !hasList) return;
    const all = filterOptions("", opts).slice(0, maxRendered);
    const current = selected ? all.findIndex((o) => o.value === selected.value) : -1;
    setOpen(true);
    setActive(current >= 0 ? current : direction === 1 ? 0 : all.length - 1);
  };

  /** Odak bileşenden çıkınca: yazılanı çöz, kabul edilebiliyorsa kaydet, değilse eski değere dön. */
  const leave = () => {
    if (query !== null) {
      const resolved = resolveTyped(query);
      if (resolved !== null && resolved !== value) onChange(resolved);
    }
    close();
  };

  // Escape: Radix Dialog belge düzeyinde (capture) dinler; liste açıkken önce pencere
  // düzeyinde yakalayıp yayılımı durdururuz → yalnız liste kapanır, diyalog açık kalır.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.target !== inputRef.current) return;
      e.stopPropagation();
      e.preventDefault();
      close();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, close]);

  // Dışarı tıklama: odak input'taysa blur zaten kapatır; değilse burada kapat.
  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (wrapperRef.current?.contains(e.target as Node)) return;
      if (document.activeElement === inputRef.current) return;
      close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, close]);

  // Aktif seçeneği görünür tut.
  React.useEffect(() => {
    if (!open || activeIndex < 0) return;
    document.getElementById(`${listId}-opt-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex, listId]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (inactive) return;
    switch (e.key) {
      case "ArrowDown":
      case "ArrowUp": {
        if (!hasList) return;
        e.preventDefault();
        const dir = e.key === "ArrowDown" ? 1 : -1;
        if (!open) {
          openList(dir);
          return;
        }
        if (visible.length === 0) return;
        setActive((i) => {
          const cur = i < visible.length ? i : -1;
          if (cur < 0) return dir === 1 ? 0 : visible.length - 1;
          return (cur + dir + visible.length) % visible.length;
        });
        return;
      }
      case "Enter": {
        if (open && activeIndex >= 0) {
          e.preventDefault();
          commit(visible[activeIndex].value);
          return;
        }
        if (query !== null) {
          const resolved = resolveTyped(query);
          if (resolved !== null) {
            // Liste açıkken formu göndermesin; serbest metin modunda (liste yok) Enter formu gönderebilir.
            if (open) e.preventDefault();
            commit(resolved);
          } else {
            e.preventDefault();
          }
        }
        return;
      }
      case "Tab": {
        // Yazıp oklarla/ilk eşleşmeyle bir seçenek vurgulandıysa Tab onu seçer; odak normal ilerler.
        if (open && query !== null && activeIndex >= 0) commit(visible[activeIndex].value);
        return;
      }
      default:
        return;
    }
  };

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    setQuery(next);
    if (!hasList) return;
    setOpen(true);
    setActive(next.trim() && filterOptions(next, opts).length > 0 ? 0 : -1);
  };

  const onInputBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    if (wrapperRef.current?.contains(e.relatedTarget as Node | null)) return;
    leave();
    onBlur?.();
  };

  const clear = () => {
    if (value) onChange("");
    close();
    inputRef.current?.focus();
  };

  const showClear = !inactive && !!(query ?? value);
  const describedBy = [ariaDescribedBy, notInList ? hintId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div ref={wrapperRef} className={cn("w-full", wrapperClassName)}>
      <div className="relative">
        <input
          ref={inputRef}
          id={inputId}
          name={name}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open && activeIndex >= 0 ? optionId(activeIndex) : undefined}
          aria-invalid={ariaInvalid}
          aria-describedby={describedBy}
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          value={query ?? displayValue}
          placeholder={placeholder}
          disabled={disabled}
          readOnly={readOnly}
          onChange={onInputChange}
          onKeyDown={onKeyDown}
          onBlur={onInputBlur}
          onClick={() => {
            if (!open) openList();
          }}
          className={cn(
            "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm box-border overflow-hidden text-ellipsis",
            "aria-[invalid=true]:border-destructive",
            inactive ? "pr-3" : hasList ? "pr-14" : "pr-8",
            className,
          )}
        />
        {!inactive && (
          <div className="absolute inset-y-0 right-0 flex items-center gap-0.5 pr-2">
            {showClear && (
              <button
                type="button"
                tabIndex={-1}
                aria-label={clearLabel}
                title={clearLabel}
                onMouseDown={(e) => e.preventDefault()}
                onClick={clear}
                className="inline-flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            )}
            {hasList && (
              <button
                type="button"
                tabIndex={-1}
                aria-hidden
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  inputRef.current?.focus();
                  if (open) close();
                  else openList();
                }}
                className="inline-flex h-5 w-5 items-center justify-center text-muted-foreground"
              >
                <ChevronDown className={cn("h-4 w-4 opacity-50 transition-transform", open && "rotate-180")} />
              </button>
            )}
          </div>
        )}
        <ul
          id={listId}
          role="listbox"
          hidden={!open}
          aria-labelledby={ariaLabelledBy}
          aria-label={ariaLabelledBy ? undefined : ariaLabel}
          className="absolute left-0 top-full z-50 mt-1 max-h-60 w-full min-w-[8rem] overflow-auto rounded-md border bg-popover/95 p-1 text-popover-foreground shadow-lg backdrop-blur-md"
        >
          {open &&
            (visible.length === 0 ? (
              <li role="presentation" className="px-2 py-1.5 text-sm text-muted-foreground">
                {emptyText}
              </li>
            ) : (
              visible.map((o, i) => {
                const isActive = i === activeIndex;
                const isSelected = selected?.value === o.value;
                return (
                  <li
                    key={o.value}
                    id={optionId(i)}
                    role="option"
                    aria-selected={isActive}
                    data-active={isActive || undefined}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseMove={() => {
                      if (!isActive) setActive(i);
                    }}
                    onClick={() => commit(o.value)}
                    className={cn(
                      "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none",
                      isActive && "bg-accent text-accent-foreground",
                      isSelected && "font-medium",
                    )}
                  >
                    {isSelected && (
                      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                        <Check className="h-4 w-4" aria-hidden />
                      </span>
                    )}
                    {o.label}
                  </li>
                );
              })
            ))}
        </ul>
      </div>
      {notInList && (
        <p id={hintId} className="mt-1 text-xs text-muted-foreground">
          {notInListText}
        </p>
      )}
    </div>
  );
});
Combobox.displayName = "Combobox";
