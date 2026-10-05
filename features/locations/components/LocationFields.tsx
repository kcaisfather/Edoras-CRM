"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Combobox } from "@/components/ui/combobox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  COUNTRY_NAMES,
  canonicalCountry,
  canonicalDistrict,
  canonicalProvince,
  districtsOf,
  isTurkey,
  normalizeSearch,
  provinceNames,
} from "@/lib/data/tr-locations";

export type LocationKey = "city" | "district" | "country";

export interface LocationValue {
  city: string;
  district: string;
  country: string;
}

export interface LocationFieldsProps {
  /** Input id öneki: `${idPrefix}-city`, `${idPrefix}-district`, `${idPrefix}-country`. */
  idPrefix: string;
  value: { city?: string | null; district?: string | null; country?: string | null };
  /** Yalnız değişen alanlar gelir (ör. il değişince `{ city, district: "" }`). */
  onChange: (patch: Partial<LocationValue>) => void;
  /** Ülke alanını göster (varsayılan true). */
  showCountry?: boolean;
  required?: Partial<Record<LocationKey, boolean>>;
  errors?: Partial<Record<LocationKey, ReactNode>>;
  disabled?: boolean;
  readOnly?: boolean;
  labels?: Partial<Record<LocationKey, ReactNode>>;
  placeholders?: Partial<Record<LocationKey, string>>;
  /** Her alan sarmalayıcısına (`space-y-1.5` div) eklenen sınıf. */
  className?: string;
  /** Alan bazında sarmalayıcı sınıfı (ör. `{ country: "col-span-2" }`). */
  classNames?: Partial<Record<LocationKey, string>>;
  /** Combobox input sınıfı. */
  inputClassName?: string;
  onBlur?: (field: LocationKey) => void;
}

/**
 * Ülke, İl, İlçe aranabilir açılır listeleri — bu sırayla. Fragment döndürür (2–3 `space-y-1.5` blok) →
 * çağıran kendi grid'ine (ör. `grid-cols-2`) yerleştirir.
 *
 * - Ülke Türkiye (veya boş) iken il/ilçe yalnız listeden seçilir; il seçimi resmî yazıma çevrilir,
 *   ilçe listesi seçili ile göre daralır (Türkçe alfabetik), il değişince ilçe temizlenir.
 * - Ülke yalnız listeden seçilir (BM'nin 193 üyesi + gözlemciler; lib/data/countries.ts).
 * - Türkiye dışı ülkede il/ilçe serbest metindir; Türkiye → yabancı ülke geçişinde il/ilçe temizlenir.
 * - Listede olmayan eski kayıtlar gösterilir ve "listede yok" uyarısı çıkar; listeden seçilerek düzeltilir.
 * - Varsayılanlar (Türkiye + İstanbul) bileşen tarafından yazılmaz: yeni kayıt formu başlangıç durumunu
 *   `withLocationDefaults` / `locationDefaults` ile kurar, mevcut kayıtlar kendi değerleriyle açılır.
 */
export function LocationFields({
  idPrefix,
  value,
  onChange,
  showCountry = true,
  required,
  errors,
  disabled,
  readOnly,
  labels,
  placeholders,
  className,
  classNames,
  inputClassName,
  onBlur,
}: LocationFieldsProps) {
  const t = useTranslations("locations");
  const city = value.city ?? "";
  const district = value.district ?? "";
  const country = value.country ?? "";

  const turkey = isTurkey(country);
  const province = turkey ? canonicalProvince(city) : null;
  const districtOptions = province ? districtsOf(province) : [];
  const districtLocked = turkey && !province && !district;

  const setCity = (next: string) => {
    const canon = turkey ? (canonicalProvince(next) ?? next) : next;
    const patch: Partial<LocationValue> = { city: canon };
    if (district && normalizeSearch(canon) !== normalizeSearch(city)) patch.district = "";
    onChange(patch);
  };

  const setDistrict = (next: string) => {
    onChange({ district: turkey ? (canonicalDistrict(city, next) ?? next) : next });
  };

  const setCountry = (next: string) => {
    const canon = canonicalCountry(next) ?? next;
    const patch: Partial<LocationValue> = { country: canon };
    // Türkiye'den yabancı ülkeye geçişte Türkiye il/ilçesi anlamsızlaşır → temizlenir.
    if (turkey && !isTurkey(canon)) {
      if (city) patch.city = "";
      if (district) patch.district = "";
    }
    // Türkiye'ye dönülünce mevcut il/ilçe yazımı tanınıyorsa resmî yazıma çevrilir.
    if (isTurkey(canon) && !turkey) {
      const c = canonicalProvince(city);
      if (c && c !== city) patch.city = c;
      const d = canonicalDistrict(c ?? city, district);
      if (d && d !== district) patch.district = d;
    }
    onChange(patch);
  };

  const common = {
    disabled,
    readOnly,
    clearLabel: t("clear"),
    emptyText: t("noResults"),
    notInListText: t("notInList"),
    className: inputClassName,
  };

  const field = (key: LocationKey, control: ReactNode) => {
    const err = errors?.[key];
    return (
      <div key={key} className={cn("space-y-1.5", className, classNames?.[key])}>
        <Label htmlFor={`${idPrefix}-${key}`}>
          {labels?.[key] ?? t(key)}
          {required?.[key] && !readOnly && <span className="text-destructive"> *</span>}
        </Label>
        {control}
        {err ? (
          <p id={`${idPrefix}-${key}-error`} className="text-xs text-destructive">
            {err}
          </p>
        ) : null}
      </div>
    );
  };

  const a11y = (key: LocationKey) => ({
    id: `${idPrefix}-${key}`,
    "aria-invalid": errors?.[key] ? true : undefined,
    "aria-describedby": errors?.[key] ? `${idPrefix}-${key}-error` : undefined,
    onBlur: onBlur ? () => onBlur(key) : undefined,
  });

  const cityField = field(
    "city",
    <Combobox
      {...common}
      {...a11y("city")}
      value={city}
      onChange={setCity}
      options={turkey ? provinceNames() : []}
      allowCustom={!turkey}
      placeholder={placeholders?.city ?? (turkey ? t("cityPlaceholder") : t("cityFreePlaceholder"))}
    />,
  );

  const districtField = field(
    "district",
    <Combobox
      {...common}
      {...a11y("district")}
      value={district}
      onChange={setDistrict}
      options={districtOptions}
      allowCustom={!turkey}
      disabled={disabled || districtLocked}
      placeholder={
        districtLocked
          ? t("districtPickCityFirst")
          : (placeholders?.district ?? (turkey ? t("districtPlaceholder") : t("districtFreePlaceholder")))
      }
    />,
  );

  const countryField = showCountry
    ? field(
        "country",
        <Combobox
          {...common}
          {...a11y("country")}
          value={country}
          onChange={setCountry}
          options={COUNTRY_NAMES}
          allowCustom={false}
          placeholder={placeholders?.country ?? t("countryPlaceholder")}
        />,
      )
    : null;

  return (
    <>
      {countryField}
      {cityField}
      {districtField}
    </>
  );
}
