"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const t = useTranslations("list");
  const [input, setInput] = useState(value);
  const [synced, setSynced] = useState(value);
  if (value !== synced) {
    // URL dışarıdan değişti (ör. kayıtlı görünüm uygulandı) → kutuyu eşitle
    setSynced(value);
    setInput(value);
  }
  useEffect(() => {
    const id = setTimeout(() => {
      if (input !== value) onChange(input);
    }, 300);
    return () => clearTimeout(id);
  }, [input, value, onChange]);
  return (
    <div className="relative w-full max-w-xs">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder={placeholder ?? t("search")}
        aria-label={placeholder ?? t("search")}
        className="pl-10 h-9"
      />
    </div>
  );
}
