import { describe, expect, it } from "vitest";
import { createCompensator } from "./compensation";

describe("createCompensator", () => {
  it("geri almaları ters sırayla çalıştırır", async () => {
    const calls: string[] = [];
    const c = createCompensator();
    c.push("auth", async () => void calls.push("auth"));
    c.push("kurum", async () => void calls.push("kurum"));
    c.push("üyelik", async () => void calls.push("üyelik"));
    expect(await c.rollback()).toEqual([]);
    expect(calls).toEqual(["üyelik", "kurum", "auth"]);
  });

  it("biri patlasa da diğerlerini dener ve patlayanları bildirir", async () => {
    const calls: string[] = [];
    const c = createCompensator();
    c.push("auth", async () => void calls.push("auth"));
    c.push("kurum", async () => {
      throw new Error("x");
    });
    expect(await c.rollback()).toEqual(["kurum"]);
    expect(calls).toEqual(["auth"]);
  });

  it("ikinci rollback bir şey yapmaz", async () => {
    let n = 0;
    const c = createCompensator();
    c.push("a", async () => void n++);
    await c.rollback();
    await c.rollback();
    expect(n).toBe(1);
  });
});
