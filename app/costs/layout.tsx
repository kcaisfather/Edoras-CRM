import { CostsAccessGuard, CostsTabs } from "@/features/costs";

// Sunucu bileşeni: yetki kontrolü ve aktif sekme istemci bileşenlerinde (DeepSport costs/layout.tsx).
export default function CostsLayout({ children }: { children: React.ReactNode }) {
  return (
    <CostsAccessGuard>
      <div className="mx-auto max-w-[1800px] space-y-6 px-6 pb-8 pt-6 md:px-8">
        <CostsTabs />
        <div className="space-y-6">{children}</div>
      </div>
    </CostsAccessGuard>
  );
}
