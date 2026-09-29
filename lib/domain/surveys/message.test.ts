import { describe, expect, it } from "vitest";
import { buildSurveyEmail, buildSurveyLink, buildSurveyMessage, buildSurveyReminder, escapeHtml, firstNameOf } from "./message";

describe("links and messages", () => {
  it("builds the public link with encoded token (dil öneki yok)", () => {
    expect(buildSurveyLink("https://crm.edorasapp.ai/", "ab c")).toBe("https://crm.edorasapp.ai/s/ab%20c");
    expect(buildSurveyLink("https://x.app", "t1")).toBe("https://x.app/s/t1");
  });

  it("uses first name when available", () => {
    expect(firstNameOf("  Ahmet  Yılmaz ")).toBe("Ahmet");
    expect(firstNameOf("")).toBeNull();
    expect(firstNameOf(null)).toBeNull();
    expect(buildSurveyMessage({ name: "Ayşe Kaya", link: "L" })).toContain("Merhaba Ayşe,");
    expect(buildSurveyMessage({ name: null, link: "L" })).toMatch(/^Merhaba,/);
    expect(buildSurveyMessage({ name: "A", link: "L", kind: "reminder" })).toContain("hatırlatmak");
  });

  it("Edoras dili: kurum; DeepSport / antrenör geçmez", () => {
    const texts = [buildSurveyMessage({ link: "L" }), buildSurveyMessage({ link: "L", kind: "reminder" })];
    for (const text of texts) {
      expect(text).toContain("Edoras");
      expect(text).toContain("kurum");
      expect(text).not.toMatch(/DeepSport|antrenör|sporcu/i);
      expect(text.endsWith("L")).toBe(true);
    }
  });

  it("builds a reminder with WhatsApp and SMS links for a valid TR phone", () => {
    const r = buildSurveyReminder({ origin: "https://x.app", token: "tok", name: "Ali Veli", phone: "0532 123 45 67" });
    expect(r.link).toBe("https://x.app/s/tok");
    expect(r.message).toContain(r.link);
    expect(r.message).toContain("hatırlatmak");
    expect(r.whatsappUrl).toMatch(/^https:\/\/wa\.me\/905321234567\?text=/);
    expect(r.smsUrl).toMatch(/^sms:\+905321234567\?&body=/);
    expect(buildSurveyReminder({ origin: "https://x.app", token: "tok", kind: "invite" }).message).toContain("merak ediyoruz");
  });

  it("returns null contact links for invalid phones", () => {
    const r = buildSurveyReminder({ origin: "https://x.app", token: "tok", phone: "123" });
    expect(r.whatsappUrl).toBeNull();
    expect(r.smsUrl).toBeNull();
  });
});

describe("e-posta", () => {
  it("HTML'e giren değerler kaçışlanır; düz metin yedeği linki taşır", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
    const mail = buildSurveyEmail({ name: "<script>Ali</script> Veli", link: "https://x.app/s/tok", title: "Edoras memnuniyet anketi" });
    expect(mail.subject).toBe("Edoras memnuniyet anketi");
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("Merhaba &lt;script&gt;Ali&lt;/script&gt;,");
    expect(mail.html).toContain('href="https://x.app/s/tok"');
    expect(mail.text).toContain("https://x.app/s/tok");
    expect(mail.text).toContain("Kurumunuzun Edoras deneyimini");
  });

  it("hatırlatma konusu ve giriş metni", () => {
    const mail = buildSurveyEmail({ link: "L", title: "Anket", intro: "Özel giriş", kind: "reminder" });
    expect(mail.subject).toBe("Hatırlatma: Anket");
    expect(mail.text).toMatch(/^Merhaba,/);
    expect(mail.text).toContain("hatırlatmak");
    expect(buildSurveyEmail({ link: "L", title: "Anket", intro: "Özel giriş" }).text).toContain("Özel giriş");
  });
});
