import type { KeyboardEvent } from "react";

/**
 * Tıklanabilir tablo satırı için klavye erişimi (Tab ile odaklanır, Enter/Space ile açılır).
 * Satır içindeki butonlardan gelen tuş olayları yok sayılır.
 */
export function clickableRowProps(onActivate: () => void) {
  return {
    tabIndex: 0,
    onClick: onActivate,
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      if (e.target !== e.currentTarget) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onActivate();
      }
    },
  };
}

/** Tıklanabilir satırların ortak hover/focus görünümü. */
export const CLICKABLE_ROW_CLASS = "cursor-pointer hover:bg-muted/50 focus-visible:outline-none focus-visible:bg-muted/50";
