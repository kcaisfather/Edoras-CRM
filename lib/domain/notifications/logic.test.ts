import { describe, expect, it } from "vitest";
import { isUnread, markAllSeen, parseSeen, sortNotifications, unreadCount, type NotificationItem } from "./logic";

const item = (id: string, signature: string, kind: NotificationItem["kind"] = "TASKS_DUE"): NotificationItem => ({
  id,
  kind,
  signature,
  href: "/crm",
});

describe("görüldü mantığı", () => {
  it("imza eşleşirse okunmuş, değişirse ya da hiç görülmediyse okunmamış", () => {
    expect(isUnread(item("tasks", "3"), { tasks: "3" })).toBe(false);
    expect(isUnread(item("tasks", "4"), { tasks: "3" })).toBe(true);
    expect(isUnread(item("tasks", "3"), {})).toBe(true);
  });
  it("okunmamış sayısı", () => {
    const list = [item("a", "1"), item("b", "2"), item("c", "3")];
    expect(unreadCount(list, { a: "1", b: "x" })).toBe(2);
    expect(unreadCount([], {})).toBe(0);
  });
  it("markAllSeen yalnız mevcut bildirimleri tutar (eski kayıtlar atılır)", () => {
    expect(markAllSeen([item("a", "1"), item("b", "2")])).toEqual({ a: "1", b: "2" });
    expect(markAllSeen([])).toEqual({});
  });
});

describe("parseSeen", () => {
  it("geçerli JSON nesnesini okur; metin olmayan değerleri atar", () => {
    expect(parseSeen('{"a":"1","b":2}')).toEqual({ a: "1" });
  });
  it("bozuk, dizi, null ve metin olmayan girdi boş döner", () => {
    expect(parseSeen("{bozuk")).toEqual({});
    expect(parseSeen("[1,2]")).toEqual({});
    expect(parseSeen("null")).toEqual({});
    expect(parseSeen(null)).toEqual({});
    expect(parseSeen(undefined)).toEqual({});
  });
});

describe("sortNotifications", () => {
  it("türe göre sıralar, aynı türde sırayı korur", () => {
    const sorted = sortNotifications([
      item("s", "1", "SURVEY_RESPONSES"),
      item("l", "1", "LICENSE_ENDING"),
      item("a2", "1", "APPOINTMENT"),
      item("t", "1", "TASKS_DUE"),
      item("a1", "1", "APPOINTMENT"),
      item("k", "1", "TICKETS_OPEN"),
    ]);
    expect(sorted.map((x) => x.id)).toEqual(["a2", "a1", "t", "k", "l", "s"]);
  });
});
