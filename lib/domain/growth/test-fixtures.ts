/** Yalnız testler için: GrowthCustomer / UsageSignals üreticileri. */
import { emptyCounts, emptyDates, latestDate } from "./usage";
import type { ActivitySource, GrowthCustomer, GrowthLicense, UsageSignals } from "./types";

type UsageOverrides = Omit<Partial<UsageSignals>, "lastDates" | "counts"> & {
  lastDates?: Partial<Record<ActivitySource, string | null>>;
  counts?: Partial<Record<ActivitySource, number>>;
};

export function usage(over: UsageOverrides = {}): UsageSignals {
  const lastDates = { ...emptyDates(), ...(over.lastDates ?? {}) };
  const counts = { ...emptyCounts(), ...(over.counts ?? {}) };
  return {
    windowDays: 30,
    students: 100,
    teachers: 5,
    classes: 4,
    enrolledStudents: 90,
    activeTeachers: 3,
    activeTeachersLowerBound: false,
    unavailable: [],
    ...over,
    counts,
    lastDates,
    lastActivityOn: over.lastActivityOn !== undefined ? over.lastActivityOn : latestDate(lastDates),
  };
}

export function license(over: Partial<GrowthLicense> & Pick<GrowthLicense, "startsOn" | "endsOn">): GrowthLicense {
  const price = over.price === undefined ? 12000 : over.price;
  return { free: price === 0, ...over, price };
}

export function customer(over: Partial<GrowthCustomer> & { id: string }): GrowthCustomer {
  return {
    name: over.id,
    program: "yks",
    isActive: true,
    createdAt: "2025-01-10T09:00:00Z",
    status: "UCRETLI",
    state: "UCRETLI",
    demoEndsAt: null,
    licenseEndsOn: null,
    contactName: null,
    contactPhone: null,
    contactEmail: null,
    licenses: [],
    payments: [],
    usage: usage(),
    ...over,
  };
}
