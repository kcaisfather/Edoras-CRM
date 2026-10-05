"use client";

/**
 * Bildirim zili: gecikmiş görev, yaklaşan randevu, yeni anket yanıtı, açık destek talebi ve 7 gün içinde biten lisans / demo. Okunmamış sayısı
 * rozette; menü açılınca hepsi görüldü olur (açılışta okunmamış olanlar o oturumda vurgulu kalır). Bildirim metni burada
 * üretilir (sunucu yalnız tür + parametre verir).
 */
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Bell, CalendarClock, ClipboardList, LifeBuoy, MessageSquareHeart, ShieldAlert } from "lucide-react";
import { Link } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useCurrentUser } from "@/features/auth";
import { cn } from "@/lib/utils";
import { formatAppointmentWhen, msToIstanbul } from "@/lib/domain/crm/appointment";
import { isUnread, markAllSeen, unreadCount, type NotificationItem } from "@/lib/domain/notifications/logic";
import { useNotifications, useSeen } from "../queries";

const ICON: Record<NotificationItem["kind"], React.ComponentType<{ className?: string }>> = {
  TASKS_DUE: ClipboardList,
  APPOINTMENT: CalendarClock,
  SURVEY_RESPONSES: MessageSquareHeart,
  LICENSE_ENDING: ShieldAlert,
  TICKETS_OPEN: LifeBuoy,
};

export function NotificationBell({
  size = "icon-sm",
  side = "top",
  align = "start",
  className,
}: {
  size?: "icon-sm" | "icon";
  side?: "top" | "right";
  align?: "start" | "end";
  className?: string;
}) {
  const t = useTranslations("shell.notifications");
  const locale = useLocale();
  const { data: me } = useCurrentUser();
  const q = useNotifications();
  const [seen, saveSeen] = useSeen(me?.id);
  // Menü açıldığında okunmamış olanlar (açıkken vurgulu kalsın diye).
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());

  const items = q.data?.items ?? [];
  const unread = unreadCount(items, seen);

  const text = (n: NotificationItem): string => {
    const name = n.name ?? t("unknownName");
    switch (n.kind) {
      case "TASKS_DUE":
        return t("tasksDue", { count: n.count ?? 0 });
      case "APPOINTMENT":
        return t(n.overdue ? "appointmentOverdue" : "appointment", {
          name,
          when: n.at != null ? formatAppointmentWhen(msToIstanbul(n.at), locale) : "",
        });
      case "TICKETS_OPEN":
        return t("ticketsOpen", { count: n.count ?? 0 });
      case "SURVEY_RESPONSES":
        return t("surveyResponses", { count: n.count ?? 0 });
      case "LICENSE_ENDING":
        return t(n.demo ? "demoEnding" : "licenseEnding", { name, days: n.daysLeft ?? 0 });
    }
  };

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (!open) return;
        setFresh(new Set(items.filter((i) => isUnread(i, seen)).map((i) => i.id)));
        saveSeen(markAllSeen(items));
        void q.refetch();
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size={size}
          className={cn("relative text-muted-foreground", className)}
          aria-label={unread > 0 ? t("labelUnread", { count: unread }) : t("label")}
          title={t("label")}
        >
          <Bell />
          {unread > 0 && (
            <span
              aria-hidden
              className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-4 text-destructive-foreground"
            >
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side={side} align={align} className="w-80 max-w-[calc(100vw-1.5rem)]">
        <DropdownMenuLabel className="text-xs text-muted-foreground">{t("title")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {q.isLoading ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">{t("loading")}</p>
        ) : q.isError ? (
          <p className="px-2 py-3 text-sm text-destructive">{t("error")}</p>
        ) : items.length === 0 ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          items.map((n) => {
            const Icon = ICON[n.kind];
            return (
              <DropdownMenuItem key={n.id} asChild>
                <Link href={n.href} className={cn("flex items-start gap-2 whitespace-normal", fresh.has(n.id) && "bg-primary/5 font-medium")}>
                  <Icon className={cn("mt-0.5 size-4 shrink-0", n.overdue || (n.daysLeft != null && n.daysLeft <= 3) ? "text-destructive" : "text-primary")} />
                  <span className="min-w-0 text-sm">{text(n)}</span>
                </Link>
              </DropdownMenuItem>
            );
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
