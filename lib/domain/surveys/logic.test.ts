import { describe, expect, it } from "vitest";
import {
  DEFAULT_SURVEY,
  awaitingSurveyByLead,
  buildSatisfactionIndex,
  computeNps,
  dedupeRecipients,
  effectiveStatus,
  isAwaitingFollowUp,
  isInvitationOpen,
  latestResponseFor,
  npsCategory,
  recipientSkipReason,
  requiredFlags,
  satisfactionFor,
  satisfactionLevel,
  summarizeResponses,
  validateAnswer,
} from "./logic";
import { createInvitationSchema, isSurveyToken, publicAnswerSchema } from "./schemas";

const day = 86_400_000;
const now = 100 * day;

describe("npsCategory / computeNps", () => {
  it("buckets scores", () => {
    expect(npsCategory(10)).toBe("promoter");
    expect(npsCategory(9)).toBe("promoter");
    expect(npsCategory(8)).toBe("passive");
    expect(npsCategory(7)).toBe("passive");
    expect(npsCategory(6)).toBe("detractor");
    expect(npsCategory(0)).toBe("detractor");
  });

  it("computes NPS ignoring invalid scores", () => {
    expect(computeNps([])).toBeNull();
    expect(computeNps([null, undefined, 11, -1, 3.5])).toBeNull();
    expect(computeNps([10, 10, 10])).toBe(100);
    expect(computeNps([0, 0])).toBe(-100);
    // 2 destekçi, 1 pasif, 1 eleştirmen → (2−1)/4 = 25
    expect(computeNps([9, 10, 7, 3])).toBe(25);
  });
});

describe("summarizeResponses", () => {
  it("summarizes counts, rate, csat average and last date", () => {
    const s = summarizeResponses(
      [
        { nps: 10, csat: 5, createdAt: 100 },
        { nps: 6, csat: 2, createdAt: 300 },
        { nps: null, csat: 4, createdAt: 200 },
      ],
      6
    );
    expect(s.responseCount).toBe(3);
    expect(s.responseRate).toBe(0.5);
    expect(s.promoters).toBe(1);
    expect(s.detractors).toBe(1);
    expect(s.passives).toBe(0);
    expect(s.nps).toBe(0);
    expect(s.csatAvg).toBe(3.7);
    expect(s.lastResponseAt).toBe(300);
  });

  it("handles no invitations / no responses", () => {
    const s = summarizeResponses([], 0);
    expect(s.responseRate).toBeNull();
    expect(s.nps).toBeNull();
    expect(s.csatAvg).toBeNull();
    expect(s.lastResponseAt).toBeNull();
  });
});

describe("satisfactionLevel", () => {
  it("prefers NPS, falls back to CSAT", () => {
    expect(satisfactionLevel(9, 1)).toBe("good");
    expect(satisfactionLevel(7, null)).toBe("neutral");
    expect(satisfactionLevel(2, 5)).toBe("bad");
    expect(satisfactionLevel(null, 4)).toBe("good");
    expect(satisfactionLevel(null, 3)).toBe("neutral");
    expect(satisfactionLevel(null, 1)).toBe("bad");
    expect(satisfactionLevel(null, null)).toBeNull();
    expect(satisfactionLevel(12, 9)).toBeNull();
  });
});

describe("validateAnswer", () => {
  const req = requiredFlags(DEFAULT_SURVEY);
  it("default survey requires NPS and CSAT but not comment", () => {
    expect(req).toEqual({ nps: true, csat: true, comment: false });
  });
  it("reports missing and out-of-range answers", () => {
    expect(validateAnswer({ nps: null, csat: null, comment: "" }, req)).toEqual(["npsRequired", "csatRequired"]);
    expect(validateAnswer({ nps: 11, csat: 0, comment: "" }, req)).toEqual(["npsRange", "csatRange"]);
    expect(validateAnswer({ nps: 8, csat: 4, comment: "x".repeat(2001) }, req)).toEqual(["commentTooLong"]);
    expect(validateAnswer({ nps: 0, csat: 1, comment: "" }, req)).toEqual([]);
  });
  it("zorunlu yorum boşlukla geçilmez; uzunluk kırpılmış metinle ölçülür", () => {
    expect(validateAnswer({ nps: 9, csat: 5, comment: "   " }, { nps: true, csat: true, comment: true })).toEqual(["commentRequired"]);
    expect(validateAnswer({ nps: 9, csat: 5, comment: ` ${"x".repeat(2000)} ` }, req)).toEqual([]);
  });
});

describe("latestResponseFor", () => {
  it("matches by leadId or institutionId and picks the newest", () => {
    const rs = [
      { leadId: "l1", institutionId: null, createdAt: 1 },
      { leadId: null, institutionId: "i1", createdAt: 5 },
      { leadId: "l2", institutionId: null, createdAt: 9 },
    ];
    expect(latestResponseFor(rs, { leadId: "l1", institutionId: "i1" })?.createdAt).toBe(5);
    expect(latestResponseFor(rs, { leadId: "l3" })).toBeNull();
  });
});

describe("recipientSkipReason / dedupeRecipients", () => {
  it("checks channel requirements", () => {
    expect(recipientSkipReason({ leadId: "l", email: "A@B.co" }, "EMAIL")).toBeNull();
    expect(recipientSkipReason({ leadId: "l", email: "x" }, "EMAIL")).toBe("noEmail");
    expect(recipientSkipReason({ institutionId: "i", phone: "05321234567" }, "WHATSAPP")).toBeNull();
    expect(recipientSkipReason({ leadId: "l", phone: "" }, "SMS")).toBe("noPhone");
    expect(recipientSkipReason({ leadId: "l" }, "LINK")).toBeNull();
    expect(recipientSkipReason({ email: "a@b.co" }, "LINK")).toBe("noIdentity");
  });
  it("dedupes by leadId then institutionId", () => {
    const out = dedupeRecipients([
      { leadId: "l1", institutionId: "i1" },
      { leadId: "l1", institutionId: "i2" },
      { leadId: null, institutionId: "i3" },
      { leadId: null, institutionId: "i3" },
    ]);
    expect(out).toHaveLength(2);
  });
});

describe("davet durumu", () => {
  it("süresi geçmiş ve yanıtlanmamış davet EXPIRED görünür", () => {
    expect(effectiveStatus({ status: "SENT", expiresAt: now - 1 }, now)).toBe("EXPIRED");
    expect(effectiveStatus({ status: "FAILED", expiresAt: now - 1 }, now)).toBe("EXPIRED");
    expect(effectiveStatus({ status: "RESPONDED", expiresAt: now - 1 }, now)).toBe("RESPONDED");
    expect(effectiveStatus({ status: "OPENED", expiresAt: now + 1 }, now)).toBe("OPENED");
    expect(isInvitationOpen({ status: "CREATED", expiresAt: now + day }, now)).toBe(true);
    expect(isInvitationOpen({ status: "CREATED", expiresAt: now }, now)).toBe(false);
    expect(isInvitationOpen({ status: "RESPONDED", expiresAt: now + day }, now)).toBe(false);
  });
});

describe("isAwaitingFollowUp", () => {
  const exp = now + 30 * day;
  it("flags sent/opened invitations silent for 5+ days", () => {
    expect(isAwaitingFollowUp({ status: "SENT", sentAt: now - 5 * day, expiresAt: exp }, now)).toBe(true);
    expect(isAwaitingFollowUp({ status: "OPENED", sentAt: now - 4 * day, expiresAt: exp }, now)).toBe(false);
    expect(isAwaitingFollowUp({ status: "OPENED", sentAt: now - 4 * day, expiresAt: exp }, now, 3)).toBe(true);
  });
  it("gönderildiği bilinmeyen (CREATED), yanıtlanan, başarısız ve süresi dolan davet aranmaz", () => {
    expect(isAwaitingFollowUp({ status: "CREATED", sentAt: null, expiresAt: exp }, now)).toBe(false);
    expect(isAwaitingFollowUp({ status: "RESPONDED", sentAt: 0, expiresAt: exp }, now)).toBe(false);
    expect(isAwaitingFollowUp({ status: "FAILED", sentAt: 0, expiresAt: exp }, now)).toBe(false);
    expect(isAwaitingFollowUp({ status: "SENT", sentAt: 0, expiresAt: now - 1 }, now)).toBe(false);
  });
});

describe("awaitingSurveyByLead (Görevlerim girdisi)", () => {
  const base = { status: "SENT" as const, expiresAt: now + day, institutionId: null };
  it("aday başına en son gönderilmiş, yanıt bekleyen davet; adayı yoksa kurumun adayı", () => {
    const out = awaitingSurveyByLead(
      [
        { ...base, leadId: "l1", sentAt: now - 9 * day },
        { ...base, leadId: "l1", sentAt: now - 2 * day, status: "OPENED" },
        { ...base, leadId: null, institutionId: "i1", sentAt: now - 6 * day },
        { ...base, leadId: null, institutionId: "i2", sentAt: now - 6 * day },
        { ...base, leadId: "l3", sentAt: now - 6 * day, status: "RESPONDED" },
        { ...base, leadId: "l4", sentAt: null, status: "CREATED" },
        { ...base, leadId: "l5", sentAt: now - 40 * day, expiresAt: now - day },
      ],
      new Map([["i1", "l9"]]),
      now
    );
    expect(Object.fromEntries(out)).toEqual({ l1: now - 2 * day, l9: now - 6 * day });
  });
});

describe("memnuniyet dizini", () => {
  const inv = (over: Record<string, unknown>) => ({
    id: "v",
    token: "t",
    status: "SENT" as const,
    sentAt: now - day,
    createdAt: now - day,
    expiresAt: now + day,
    leadId: null,
    institutionId: null,
    ...over,
  });

  it("son yanıt, yanıt sayısı ve bekleyen son davet", () => {
    const index = buildSatisfactionIndex(
      [
        { leadId: "l1", institutionId: "i1", nps: 3, csat: 2, createdAt: 10 },
        { leadId: "l1", institutionId: "i1", nps: 10, csat: 5, createdAt: 20 },
      ],
      [
        inv({ id: "a", leadId: "l1", sentAt: now - 3 * day }),
        inv({ id: "b", leadId: "l1", sentAt: now - day }),
        inv({ id: "c", leadId: "l1", status: "FAILED", sentAt: null, createdAt: now }),
        inv({ id: "d", leadId: "l1", expiresAt: now - 1 }),
        inv({ id: "e", leadId: "l2", status: "RESPONDED" }),
      ],
      now
    );
    expect(index.byLead.l1).toMatchObject({ responseCount: 2, lastNps: 10, lastCsat: 5, lastResponseAt: 20 });
    expect(index.byLead.l1.pendingInvitation?.id).toBe("b");
    expect(index.byInstitution.i1.responseCount).toBe(2);
    expect(index.byLead.l2).toBeUndefined();
  });

  it("aday + bağlı kurum birleşir; hiç veri yoksa null", () => {
    const index = buildSatisfactionIndex(
      [
        { leadId: "l1", institutionId: null, nps: 4, csat: null, createdAt: 10 },
        { leadId: null, institutionId: "i1", nps: 9, csat: null, createdAt: 30 },
      ],
      [],
      now
    );
    expect(satisfactionFor(index, { leadId: "l1", institutionId: "i1" })).toMatchObject({ lastNps: 9, responseCount: 1 });
    expect(satisfactionFor(index, { leadId: "l1" })?.lastNps).toBe(4);
    expect(satisfactionFor(index, { leadId: "x", institutionId: "y" })).toBeNull();
    expect(satisfactionFor(null, { leadId: "l1" })).toBeNull();
  });
});

describe("şemalar", () => {
  const L = "00000000-0000-4000-8000-000000000001";
  it("davet: aday ya da kurum zorunlu; alıcının iletişim bilgisi gövdeden okunmaz", () => {
    expect(createInvitationSchema.safeParse({ recipient: {}, channel: "LINK" }).success).toBe(false);
    expect(createInvitationSchema.safeParse({ recipient: { leadId: L }, channel: "FAX" }).success).toBe(false);
    const ok = createInvitationSchema.parse({ recipient: { leadId: L, email: "x@y.z" }, channel: "EMAIL", sendEmail: true, locale: "tr" });
    expect(ok).toEqual({ recipient: { leadId: L }, channel: "EMAIL" });
  });

  it("herkese açık yanıt: tam sayı ve aralık; yorum kırpılır, boşsa null", () => {
    expect(publicAnswerSchema.safeParse({ nps: 3.5, csat: 4 }).success).toBe(false);
    expect(publicAnswerSchema.safeParse({ nps: 11, csat: 4 }).success).toBe(false);
    expect(publicAnswerSchema.safeParse({ nps: 9, csat: 6 }).success).toBe(false);
    expect(publicAnswerSchema.parse({ nps: 9, csat: 5, comment: "  " })).toEqual({ nps: 9, csat: 5, comment: null });
    expect(publicAnswerSchema.parse({ nps: null, csat: 1, comment: " iyi " })).toEqual({ nps: null, csat: 1, comment: "iyi" });
  });

  it("token biçimi", () => {
    expect(isSurveyToken("a".repeat(43))).toBe(true);
    expect(isSurveyToken("A-_9".repeat(11))).toBe(true);
    expect(isSurveyToken("a".repeat(42))).toBe(false);
    expect(isSurveyToken(`${"a".repeat(43)}.`)).toBe(false);
    expect(isSurveyToken("../../etc")).toBe(false);
  });
});
