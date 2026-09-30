import { describe, expect, it } from "vitest";
import { escapeHtml, renderReportHtml, renderReportText, reportSubject } from "./render";
import type { ReportSectionData } from "./types";

const NOW = new Date(Date.UTC(2026, 8, 26, 7, 0));

const sections: ReportSectionData[] = [
  {
    section: "todayTasks",
    title: "Bugünün görevleri",
    count: 12,
    total: null,
    lines: [{ key: "1", name: "Kolej <A> & Ortakları", detail: "Teklif takibi · 2 gün gecikti", amount: null }],
    more: 11,
  },
  { section: "expiring60", title: "60 gün içinde bitecek paketler", count: 0, total: null, lines: [], more: 0 },
  {
    section: "openOffers",
    title: "Takipteki teklifler",
    count: 1,
    total: 12000,
    lines: [{ key: "2", name: "Kolej B", detail: "Teklif verildi", amount: 12000 }],
    more: 0,
  },
];

describe("renderReportText", () => {
  const text = renderReportText(sections, "WEEKLY", NOW, "https://crm.example.com");

  it("başlık, dönem ve bölümler", () => {
    expect(text).toContain("Edoras CRM raporu — 26 Eylül 2026 (Haftalık)");
    expect(text).toContain("Dönem: son 7 gün");
    expect(text).toContain("• Bugünün görevleri: 12");
    expect(text).toContain("   - Kolej <A> & Ortakları (Teklif takibi · 2 gün gecikti)");
    expect(text).toContain("+11 kayıt daha");
    expect(text).toContain("• 60 gün içinde bitecek paketler: 0\n   Kayıt yok.");
    expect(text).toContain("Paneli aç: https://crm.example.com");
  });

  it("tutar yalnız satırda doluysa yazılır", () => {
    expect(text).toMatch(/Takipteki teklifler: 1 · .*12\.000/);
    expect(text).toMatch(/Kolej B \(Teklif verildi · .*12\.000/);
    const noAmounts = renderReportText(
      [{ ...sections[2], total: null, lines: [{ ...sections[2].lines[0], amount: null }] }],
      "DAILY",
      NOW
    );
    expect(noAmounts).not.toMatch(/12\.000|₺/);
    expect(noAmounts).not.toContain("Paneli aç");
  });

  it("bölüm yoksa açıklayıcı satır", () => {
    expect(renderReportText([], "DAILY", NOW)).toContain("gösterilecek bölüm yok");
  });
});

describe("renderReportHtml", () => {
  const html = renderReportHtml(sections, "DAILY", NOW, "https://crm.example.com/panel");

  it("kullanıcı verisi kaçırılır (XSS yok)", () => {
    expect(html).toContain("Kolej &lt;A&gt; &amp; Ortakları");
    expect(html).not.toContain("<A>");
  });
  it("bağlantı yalnız http(s)", () => {
    expect(html).toContain('href="https://crm.example.com/panel"');
    expect(renderReportHtml(sections, "DAILY", NOW, "javascript:alert(1)")).not.toContain("href=");
    expect(renderReportHtml(sections, "DAILY", NOW, null)).not.toContain("Paneli aç");
  });
  it("adet ve tutar", () => {
    expect(html).toContain(">12</span>");
    expect(html).toMatch(/12\.000/);
  });
  it("boş bölüm 'Kayıt yok'", () => {
    expect(html).toContain("Kayıt yok.");
  });
});

describe("yardımcılar", () => {
  it("konu satırı", () => {
    expect(reportSubject("MONTHLY", NOW)).toBe("Edoras CRM raporu · 26 Eylül 2026 · Aylık");
  });
  it("escapeHtml", () => {
    expect(escapeHtml(`<a href="x">'&`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;");
  });
});
