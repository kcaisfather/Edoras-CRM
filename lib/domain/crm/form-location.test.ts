import { describe, expect, it } from "vitest";
import { emptyLeadForm, leadToForm } from "./form";
import type { CrmLead } from "./types";

describe("aday formu konum", () => {
  it("yeni aday Türkiye / İstanbul ile başlar, ilçe boş", () => {
    expect(emptyLeadForm()).toMatchObject({ country: "Türkiye", city: "İstanbul", district: "" });
  });

  it("eski serbest yazımlar okunurken resmî yazıma eşlenir; boş kayıt varsayılanla doldurulmaz", () => {
    const base = { id: "l1", status: "ARANACAK" } as CrmLead;
    expect(leadToForm({ ...base, city: "izmir", district: "bornova", country: "TR" })).toMatchObject({ city: "İzmir", district: "Bornova", country: "Türkiye" });
    expect(leadToForm(base)).toMatchObject({ city: "", district: "", country: "" });
  });
});
