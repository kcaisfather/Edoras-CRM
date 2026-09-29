import { describe, expect, it } from "vitest";
import { displayName, staffChangeBlock, validateInvite, type StaffMember } from "./logic";

const u = (id: string, role: StaffMember["role"], status: StaffMember["status"] = "ACTIVE") => ({ id, role, status });

describe("validateInvite", () => {
  it("geçersiz e-posta, mevcut e-posta ve boş ad", () => {
    expect(validateInvite({ email: "x", firstName: "", lastName: "", panelRole: "CRM_AGENT" }, [])).toEqual([
      "emailInvalid",
      "nameRequired",
    ]);
    expect(
      validateInvite({ email: " Ali@Edoras.AI ", firstName: "Ali", lastName: "", panelRole: "ADMIN" }, [{ email: "ali@edoras.ai" }])
    ).toEqual(["emailExists"]);
    expect(validateInvite({ email: "ali@edoras.ai", firstName: "Ali", lastName: "V", panelRole: "ADMIN" }, [])).toEqual([]);
  });
});

describe("staffChangeBlock", () => {
  const users = [u("a", "ADMIN"), u("b", "CRM_AGENT")];

  it("aynı değer, kendi hesabı", () => {
    expect(staffChangeBlock(u("b", "CRM_AGENT"), { role: "CRM_AGENT" }, "a", users)).toBe("same");
    expect(staffChangeBlock(u("a", "ADMIN"), { status: "DISABLED" }, "a", users)).toBe("self");
  });

  it("son aktif yönetici temsilci yapılamaz ve kapatılamaz", () => {
    expect(staffChangeBlock(u("a", "ADMIN"), { role: "CRM_AGENT" }, "x", users)).toBe("lastAdmin");
    expect(staffChangeBlock(u("a", "ADMIN"), { status: "DISABLED" }, "x", users)).toBe("lastAdmin");
    const two = [...users, u("c", "ADMIN")];
    expect(staffChangeBlock(u("a", "ADMIN"), { status: "DISABLED" }, "c", two)).toBeNull();
  });

  it("kapalı yönetici son aktif sayılmaz; temsilci serbest", () => {
    const list = [u("a", "ADMIN"), u("d", "ADMIN", "DISABLED")];
    expect(staffChangeBlock(u("a", "ADMIN"), { role: "CRM_AGENT" }, "x", list)).toBe("lastAdmin");
    expect(staffChangeBlock(u("b", "CRM_AGENT"), { status: "DISABLED" }, "a", users)).toBeNull();
  });
});

describe("displayName", () => {
  it("ad yoksa e-posta", () => {
    expect(displayName({ fullName: "  ", email: "a@b.c" })).toBe("a@b.c");
    expect(displayName({ fullName: "Kamil Atik", email: "a@b.c" })).toBe("Kamil Atik");
  });
});
