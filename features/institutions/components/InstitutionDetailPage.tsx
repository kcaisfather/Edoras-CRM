"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  BadgeCheck,
  Building2,
  CalendarClock,
  ClipboardPlus,
  GraduationCap,
  Info,
  LayoutDashboard,
  Mail,
  MessageCircle,
  Phone,
  School,
  ShieldCheck,
  UserRound,
  UsersRound,
  Wallet,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { QueryErrorState } from "@/components/query-error-state";
import { usePermissions } from "@/features/auth";
import { apiErrorKind } from "@/lib/api/errors";
import { useUrlParam } from "@/lib/hooks/use-url-param";
import { cn } from "@/lib/utils";
import { toTelLink, toWhatsAppLink } from "@/lib/utils/phone";
import { institutionStatus, type InstitutionStatusInfo } from "@/lib/domain/institutions/status";
import { daysBetween, todayIso } from "@/lib/domain/institutions/rules";
import type { InstitutionDetail, Payment } from "@/lib/domain/institutions/types";
import { useInstitution } from "../queries";
import { formatDate, formatPhone, programLabel } from "../format";
import { InstitutionStatusBadge } from "./InstitutionStatusBadge";
import { AdminsCard, BillingCard, ContactCard, DemoCard, LicensesCard, PaymentsCard, SectionCard } from "./detail-cards";
import { ConvertDialog } from "./dialogs";
import { EnrollDialog } from "./EnrollDialog";
import { PanelModulesCard } from "./PanelModulesCard";
import { STAT_GRID, StatProgress, StatTile, StatTileSkeleton } from "./StatTile";

type Tab = "overview" | "staff" | "account";

/**
 * Kurum ayrıntısı: başlık (ad, durum, yetkiliye hızlı erişim, gösterge şeridi) + sekmeler. Sekme URL'de (`?tab=staff`),
 * paylaşılan bağlantı aynı sekmeyi açar; etkin olmayan sekmenin içeriği bağlanmaz (öğretmen tablosu yalnız açılınca okunur).
 *
 * Başka modüllerin parçaları route dosyasında verilir; kurumlar modülü onları import etmez (feature bağımlılığı tek yönlü):
 *  - `highlights`: gösterge şeridine eklenen kutucuklar (ör. büyümenin etkinlik / son etkinlik kutucukları)
 *  - `overviewMain`: Genel bakış ana sütunu, yetkilinin altı (geniş parçalar, ör. destek talepleri tablosu)
 *  - `overviewAside`: Genel bakış yan sütunu (CRM adayı, memnuniyet, özellik kullanımı…)
 *  - `staff`: "Öğretmen kullanımı" sekmesi (tam genişlik tablo); kurum Edoras'ta yoksa sekme yok
 *  - `renderPaymentAction`: ödeme satırlarına eklenen parça (ör. faturalar modülünün "Fatura kes"i)
 */
export function InstitutionDetailPage({
  id,
  highlights,
  overviewMain,
  overviewAside,
  staff,
  renderPaymentAction,
}: {
  id: string;
  highlights?: React.ReactNode;
  overviewMain?: React.ReactNode;
  overviewAside?: React.ReactNode;
  staff?: React.ReactNode;
  renderPaymentAction?: (payment: Payment, institution: InstitutionDetail) => React.ReactNode;
}) {
  const t = useTranslations("institutions.detail");
  const query = useInstitution(id);
  const [tabParam, setTab] = useUrlParam("tab", "overview");

  if (query.isLoading) return <InstitutionDetailSkeleton />;
  if (query.isError) {
    if (apiErrorKind(query.error) === "notFound") {
      return <p className="rounded-2xl border border-border bg-card/60 p-6 text-sm text-muted-foreground">{t("notFound")}</p>;
    }
    return <QueryErrorState onRetry={() => query.refetch()} />;
  }
  if (!query.data) return null;
  const institution = query.data;
  const inEdoras = !institution.missingInEdoras;
  const info = institutionStatus(institution, todayIso());

  const available: Tab[] = ["overview"];
  if (inEdoras && staff) available.push("staff");
  if (institution.crm) available.push("account");
  const tab: Tab = (available as string[]).includes(tabParam) ? (tabParam as Tab) : "overview";
  const accountAttention =
    !!institution.crm && (!institution.crm.billingComplete || info.licenseSoon || info.state === "LISANS_BITTI" || info.state === "DEMO_BITTI");

  return (
    <div className="space-y-6">
      <HeaderCard institution={institution} info={info} highlights={inEdoras ? highlights : null} />

      <Tabs value={tab} onValueChange={setTab} className="gap-5">
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <TabsList className="h-10">
            <TabsTrigger value="overview" className="flex-none px-3 sm:px-4">
              <LayoutDashboard />
              <TabLabel short={t("tabs.overviewShort")} full={t("tabs.overview")} />
            </TabsTrigger>
            {available.includes("staff") ? (
              <TabsTrigger value="staff" className="flex-none px-3 sm:px-4">
                <UsersRound />
                <TabLabel short={t("tabs.staffShort")} full={t("tabs.staff")} />
              </TabsTrigger>
            ) : null}
            {available.includes("account") ? (
              <TabsTrigger value="account" className="flex-none px-3 sm:px-4">
                <Wallet />
                <TabLabel short={t("tabs.accountShort")} full={t("tabs.account")} />
                {accountAttention ? (
                  <span className="h-2 w-2 rounded-full bg-warning" title={t("tabs.attention")}>
                    <span className="sr-only">{t("tabs.attention")}</span>
                  </span>
                ) : null}
              </TabsTrigger>
            ) : null}
          </TabsList>
        </div>

        <TabsContent value="overview">
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
            <div className="min-w-0 space-y-6 lg:col-span-2">
              {institution.crm ? <ContactCard institution={institution} /> : <UnregisteredCard institution={institution} />}
              {overviewMain}
              {inEdoras ? <AdminsCard institution={institution} /> : null}
            </div>
            <div className="min-w-0 space-y-6">
              {overviewAside}
              <PanelModulesCard institution={institution} />
            </div>
          </div>
        </TabsContent>

        {available.includes("staff") ? <TabsContent value="staff">{staff}</TabsContent> : null}

        {available.includes("account") ? (
          <TabsContent value="account">
            <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
              <div className="min-w-0 space-y-6 lg:col-span-2">
                <LicensesCard institution={institution} />
                <PaymentsCard institution={institution} renderPaymentAction={renderPaymentAction} />
              </div>
              <div className="min-w-0 space-y-6">
                <DemoCard institution={institution} />
                <BillingCard institution={institution} />
              </div>
            </div>
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}

/** Sekme adı: 3 sekme 375 px'e sığsın diye dar ekranda kısa ad (gizli olan erişilebilirlik ağacından da düşer). */
function TabLabel({ short, full }: { short: string; full: string }) {
  return (
    <>
      <span className="sm:hidden">{short}</span>
      <span className="max-sm:hidden">{full}</span>
    </>
  );
}

/** Yükleme iskeleti — route dosyasının `<Suspense>` yedeği de bunu kullanır (sekme `useSearchParams` okur). */
export function InstitutionDetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-5 rounded-2xl border border-border/50 p-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-14 w-14 rounded-2xl" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-56" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
        <div className={STAT_GRID}>
          {Array.from({ length: 6 }, (_, i) => (
            <StatTileSkeleton key={i} />
          ))}
        </div>
      </div>
      <Skeleton className="h-10 w-80 rounded-lg" />
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-64 rounded-2xl lg:col-span-2" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    </div>
  );
}

function HeaderCard({
  institution,
  info,
  highlights,
}: {
  institution: InstitutionDetail;
  info: InstitutionStatusInfo;
  highlights: React.ReactNode;
}) {
  const t = useTranslations("institutions.detail");
  const { isAdmin } = usePermissions();
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const crm = institution.crm;
  const isDemo = crm?.status === "DEMO";
  const inEdoras = !institution.missingInEdoras;

  return (
    <Card className="glass-panel rounded-2xl border-border/50 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15">
            <Building2 className="h-7 w-7" />
          </div>
          <div className="min-w-0 space-y-2">
            <h1 className="text-2xl font-bold tracking-tight">{institution.name}</h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
              <InstitutionStatusBadge item={institution} />
              {institution.program ? (
                <span className="rounded border border-border px-1.5 font-semibold">{programLabel(institution.program)}</span>
              ) : null}
              {crm?.contactName ? (
                <span className="inline-flex items-center gap-1">
                  <UserRound className="h-3.5 w-3.5" />
                  {crm.contactName}
                </span>
              ) : null}
              {institution.createdAt ? <span>{t("createdAt", { date: formatDate(institution.createdAt) })}</span> : null}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {crm ? <QuickContact phone={crm.contactPhone} email={crm.contactEmail} /> : null}
          {!crm && inEdoras ? (
            <Button onClick={() => setEnrollOpen(true)}>
              <ClipboardPlus />
              {t("enroll")}
            </Button>
          ) : null}
          {isDemo && isAdmin ? (
            <Button onClick={() => setConvertOpen(true)}>
              <BadgeCheck />
              {t("convert")}
            </Button>
          ) : null}
        </div>
      </div>

      {info.state === "EDORAS_YOK" ? <Note tone="warning">{t("missingNote")}</Note> : null}
      {info.state === "PASIF" ? <Note>{t("inactiveNote")}</Note> : null}
      {isDemo && !isAdmin ? <Note>{t("convertAdminOnly")}</Note> : null}

      <div className={cn(STAT_GRID, "mt-5 border-t border-border/60 pt-5")}>
        {inEdoras ? <EdorasCountTiles institution={institution} /> : null}
        {highlights}
        <TermTile institution={institution} info={info} />
      </div>

      <EnrollDialog institution={institution} open={enrollOpen} onOpenChange={setEnrollOpen} />
      {isDemo && isAdmin ? <ConvertDialog institution={institution} open={convertOpen} onOpenChange={setConvertOpen} /> : null}
    </Card>
  );
}

/** Yetkiliye tek tıkla ulaşma: ara / WhatsApp / e-posta. Dar ekranda yalnız simge (ad ekran okuyucuya kalır). */
function QuickContact({ phone, email }: { phone: string | null; email: string | null }) {
  const t = useTranslations("institutions.detail.quick");
  const tel = toTelLink(phone);
  const whatsapp = toWhatsAppLink(phone);
  const cls = buttonVariants({ variant: "outline", size: "sm" });
  return (
    <>
      {tel ? (
        <a href={tel} className={cls} title={formatPhone(phone)}>
          <Phone />
          <span className="max-sm:sr-only">{t("call")}</span>
        </a>
      ) : null}
      {whatsapp ? (
        <a href={whatsapp} target="_blank" rel="noreferrer" className={cls}>
          <MessageCircle />
          <span className="max-sm:sr-only">{t("whatsapp")}</span>
        </a>
      ) : null}
      {email ? (
        <a href={`mailto:${email}`} className={cls} title={email}>
          <Mail />
          <span className="max-sm:sr-only">{t("mail")}</span>
        </a>
      ) : null}
    </>
  );
}

function Note({ tone, children }: { tone?: "warning"; children: React.ReactNode }) {
  return (
    <p
      className={cn(
        "mt-4 flex items-start gap-2 rounded-xl border p-3 text-xs",
        tone === "warning" ? "border-warning/30 bg-warning/10 text-warning" : "border-border bg-muted/40 text-muted-foreground"
      )}
    >
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      {children}
    </p>
  );
}

function EdorasCountTiles({ institution }: { institution: InstitutionDetail }) {
  const t = useTranslations("institutions.detail.kpi");
  const n = (v: number) => v.toLocaleString("tr-TR");
  return (
    <>
      <StatTile icon={GraduationCap} label={t("students")} value={n(institution.usage.students)} />
      <StatTile icon={UsersRound} label={t("teachers")} value={n(institution.usage.teachers)} />
      <StatTile icon={School} label={t("classes")} value={n(institution.usage.classes)} />
    </>
  );
}

/**
 * Demo / lisans kutucuğu: kalan gün + dönemin geçen kısmı. Lisansta çubuk bugünü kapsayan lisansın başından son bitişe
 * (yenileme sırada bekliyorsa onun bitişi) uzanır; kalan gün `institutionStatus` ile aynı hesap (listeyle tutarlı).
 */
function TermTile({ institution, info }: { institution: InstitutionDetail; info: InstitutionStatusInfo }) {
  const t = useTranslations("institutions.detail.kpi");
  const crm = institution.crm;
  if (!crm || info.daysLeft == null) return null;
  const today = todayIso();
  const isDemo = crm.status === "DEMO";
  const endsOn = isDemo ? crm.demoEndsAt : institution.licenseEndsOn;
  if (!endsOn) return null;
  const current = institution.licenses.find((l) => l.startsOn <= today && l.endsOn > today);
  const last = institution.licenses.find((l) => l.endsOn === endsOn);
  const startsOn = isDemo ? crm.demoStartedAt?.slice(0, 10) : (current ?? last)?.startsOn;
  const total = startsOn ? daysBetween(startsOn, endsOn.slice(0, 10)) : 0;
  const elapsed = startsOn && total > 0 ? daysBetween(startsOn, today) / total : null;

  const ended = info.daysLeft <= 0;
  const warn = ended || info.licenseSoon;
  return (
    <StatTile
      icon={isDemo ? CalendarClock : ShieldCheck}
      label={isDemo ? t("demo") : t("license")}
      value={ended ? t("ended") : t("days", { days: info.daysLeft })}
      tone={warn ? "text-warning" : undefined}
      hint={
        ended
          ? info.daysLeft === 0
            ? t("endedToday")
            : t("endedAgo", { days: -info.daysLeft })
          : t("left", { date: formatDate(endsOn) })
      }
    >
      {elapsed != null ? (
        <StatProgress value={elapsed} tone={warn ? "bg-warning" : undefined} label={t("progress", { percent: Math.round(Math.min(1, Math.max(0, elapsed)) * 100) })} />
      ) : null}
    </StatTile>
  );
}

function UnregisteredCard({ institution }: { institution: InstitutionDetail }) {
  const t = useTranslations("institutions.detail.unregistered");
  return (
    <SectionCard icon={ClipboardPlus} title={t("title")} className={institution.missingInEdoras ? undefined : "border-dashed"}>
      <p className="text-sm text-muted-foreground">{t("description")}</p>
    </SectionCard>
  );
}
