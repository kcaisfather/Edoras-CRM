"use client";

import { useTranslations } from "next-intl";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { usePermissions } from "@/features/auth";
import { RulesEditor } from "@/features/tasks";
import { useUrlParam } from "@/lib/hooks/use-url-param";
import { AccountPanel } from "./AccountPanel";
import { DiagnosticsPanel } from "./DiagnosticsPanel";
import { InternalInstitutionsPanel } from "./InternalInstitutionsPanel";
import { KvkkPanel } from "./KvkkPanel";
import { ReportsPanel } from "./ReportsPanel";
import { TeamPanel } from "./TeamPanel";

type SettingsTab = "general" | "team" | "rules" | "reports" | "dataQuality" | "diagnostics" | "kvkk";

/**
 * Ayarlar (DeepSportAdmin düzeni): Genel · Ekip · Kurallar · Raporlar · Veri kalitesi · Hata kaydı · KVKK. Sekme URL'de
 * (?tab=). Satış temsilcisi yalnız Genel ve KVKK'yı görür. Kurallar sekmesi /crm/rules ile aynı düzenleyici
 * (DeepSport /settings?tab=rules). Raporlar sekmesi zamanlanmış rapor e-postalarını yönetir (yalnız yönetici).
 */
export function SettingsPage() {
  const t = useTranslations("settings");
  const tShell = useTranslations("shell.settings");
  const { isAdmin } = usePermissions();
  const [tabParam, setTab] = useUrlParam("tab", "general");

  const tabs: SettingsTab[] = isAdmin ? ["general", "team", "rules", "reports", "dataQuality", "diagnostics", "kvkk"] : ["general", "kvkk"];
  const tab: SettingsTab = (tabs as string[]).includes(tabParam) ? (tabParam as SettingsTab) : "general";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>
      <SegmentedControl
        value={tab}
        onValueChange={setTab}
        options={tabs.map((v) => ({ value: v, label: tShell(`tabs.${v}`) }))}
        aria-label={tShell("tabsLabel")}
        className="max-w-full overflow-x-auto"
      />
      {tab === "general" && <AccountPanel />}
      {tab === "team" && <TeamPanel />}
      {tab === "rules" && <RulesEditor embedded />}
      {tab === "reports" && <ReportsPanel />}
      {tab === "dataQuality" && <InternalInstitutionsPanel />}
      {tab === "diagnostics" && <DiagnosticsPanel />}
      {tab === "kvkk" && <KvkkPanel />}
    </div>
  );
}
