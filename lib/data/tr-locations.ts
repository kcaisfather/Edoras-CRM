/**
 * Türkiye il / ilçe listesi (ülke listesi: ./countries) — İl, İlçe, Ülke alanlarındaki aranabilir açılır
 * listelerin (combobox) tek kaynağı. Serbest metin yerine listeden seçim → yazım hatası yok.
 *
 * Kaynak: İçişleri Bakanlığı güncel idari bölünüş (81 il, 973 ilçe; Derecik, Kemalpaşa
 * (Artvin) ve Sultanhanı dahil). Büyükşehir olmayan illerin merkez ilçesi "Merkez" olarak
 * tutulur (e-Fatura / adres formlarındaki kullanım).
 *
 * Saf veri + saf yardımcılar; React/Next bağımlılığı yok (vitest node ortamında test edilir).
 */

import { COUNTRIES, COUNTRY_NAMES, DEFAULT_COUNTRY, type Country } from "./countries";

export interface Province {
  /** Plaka kodu (1–81). */
  code: number;
  /** Resmî Türkçe yazım, ör. "İstanbul", "Şanlıurfa". */
  name: string;
  /** İlçeler, Türkçe alfabetik sırada. */
  districts: readonly string[];
}

// Ülke listesi (BM üyeleri — GKRY hariç — + gözlemciler + KKTC, Kosova) lib/data/countries.ts'te; buradan da dışa açılır.
export { COUNTRIES, COUNTRY_NAMES, DEFAULT_COUNTRY };
export type { Country };

/** Yeni kayıtlarda varsayılan il (ülke Türkiye iken). */
export const DEFAULT_PROVINCE = "İstanbul";

const collator = new Intl.Collator("tr", { sensitivity: "base", numeric: true });
const trSort = (a: string, b: string) => collator.compare(a, b);

// [plaka, il, "ilçe1,ilçe2,..."] — okunabilirlik için sıkıştırılmış; aşağıda sıralanıp dondurulur.
const RAW: ReadonlyArray<readonly [number, string, string]> = [
  [1, "Adana", "Aladağ,Ceyhan,Çukurova,Feke,İmamoğlu,Karaisalı,Karataş,Kozan,Pozantı,Saimbeyli,Sarıçam,Seyhan,Tufanbeyli,Yumurtalık,Yüreğir"],
  [2, "Adıyaman", "Besni,Çelikhan,Gerger,Gölbaşı,Kahta,Merkez,Samsat,Sincik,Tut"],
  [3, "Afyonkarahisar", "Başmakçı,Bayat,Bolvadin,Çay,Çobanlar,Dazkırı,Dinar,Emirdağ,Evciler,Hocalar,İhsaniye,İscehisar,Kızılören,Merkez,Sandıklı,Sinanpaşa,Sultandağı,Şuhut"],
  [4, "Ağrı", "Diyadin,Doğubayazıt,Eleşkirt,Hamur,Merkez,Patnos,Taşlıçay,Tutak"],
  [5, "Amasya", "Göynücek,Gümüşhacıköy,Hamamözü,Merkez,Merzifon,Suluova,Taşova"],
  [6, "Ankara", "Akyurt,Altındağ,Ayaş,Bala,Beypazarı,Çamlıdere,Çankaya,Çubuk,Elmadağ,Etimesgut,Evren,Gölbaşı,Güdül,Haymana,Kahramankazan,Kalecik,Keçiören,Kızılcahamam,Mamak,Nallıhan,Polatlı,Pursaklar,Sincan,Şereflikoçhisar,Yenimahalle"],
  [7, "Antalya", "Akseki,Aksu,Alanya,Demre,Döşemealtı,Elmalı,Finike,Gazipaşa,Gündoğmuş,İbradı,Kaş,Kemer,Kepez,Konyaaltı,Korkuteli,Kumluca,Manavgat,Muratpaşa,Serik"],
  [8, "Artvin", "Ardanuç,Arhavi,Borçka,Hopa,Kemalpaşa,Merkez,Murgul,Şavşat,Yusufeli"],
  [9, "Aydın", "Bozdoğan,Buharkent,Çine,Didim,Efeler,Germencik,İncirliova,Karacasu,Karpuzlu,Koçarlı,Köşk,Kuşadası,Kuyucak,Nazilli,Söke,Sultanhisar,Yenipazar"],
  [10, "Balıkesir", "Altıeylül,Ayvalık,Balya,Bandırma,Bigadiç,Burhaniye,Dursunbey,Edremit,Erdek,Gömeç,Gönen,Havran,İvrindi,Karesi,Kepsut,Manyas,Marmara,Savaştepe,Sındırgı,Susurluk"],
  [11, "Bilecik", "Bozüyük,Gölpazarı,İnhisar,Merkez,Osmaneli,Pazaryeri,Söğüt,Yenipazar"],
  [12, "Bingöl", "Adaklı,Genç,Karlıova,Kiğı,Merkez,Solhan,Yayladere,Yedisu"],
  [13, "Bitlis", "Adilcevaz,Ahlat,Güroymak,Hizan,Merkez,Mutki,Tatvan"],
  [14, "Bolu", "Dörtdivan,Gerede,Göynük,Kıbrıscık,Mengen,Merkez,Mudurnu,Seben,Yeniçağa"],
  [15, "Burdur", "Ağlasun,Altınyayla,Bucak,Çavdır,Çeltikçi,Gölhisar,Karamanlı,Kemer,Merkez,Tefenni,Yeşilova"],
  [16, "Bursa", "Büyükorhan,Gemlik,Gürsu,Harmancık,İnegöl,İznik,Karacabey,Keles,Kestel,Mudanya,Mustafakemalpaşa,Nilüfer,Orhaneli,Orhangazi,Osmangazi,Yenişehir,Yıldırım"],
  [17, "Çanakkale", "Ayvacık,Bayramiç,Biga,Bozcaada,Çan,Eceabat,Ezine,Gelibolu,Gökçeada,Lapseki,Merkez,Yenice"],
  [18, "Çankırı", "Atkaracalar,Bayramören,Çerkeş,Eldivan,Ilgaz,Kızılırmak,Korgun,Kurşunlu,Merkez,Orta,Şabanözü,Yapraklı"],
  [19, "Çorum", "Alaca,Bayat,Boğazkale,Dodurga,İskilip,Kargı,Laçin,Mecitözü,Merkez,Oğuzlar,Ortaköy,Osmancık,Sungurlu,Uğurludağ"],
  [20, "Denizli", "Acıpayam,Babadağ,Baklan,Bekilli,Beyağaç,Bozkurt,Buldan,Çal,Çameli,Çardak,Çivril,Güney,Honaz,Kale,Merkezefendi,Pamukkale,Sarayköy,Serinhisar,Tavas"],
  [21, "Diyarbakır", "Bağlar,Bismil,Çermik,Çınar,Çüngüş,Dicle,Eğil,Ergani,Hani,Hazro,Kayapınar,Kocaköy,Kulp,Lice,Silvan,Sur,Yenişehir"],
  [22, "Edirne", "Enez,Havsa,İpsala,Keşan,Lalapaşa,Meriç,Merkez,Süloğlu,Uzunköprü"],
  [23, "Elazığ", "Ağın,Alacakaya,Arıcak,Baskil,Karakoçan,Keban,Kovancılar,Maden,Merkez,Palu,Sivrice"],
  [24, "Erzincan", "Çayırlı,İliç,Kemah,Kemaliye,Merkez,Otlukbeli,Refahiye,Tercan,Üzümlü"],
  [25, "Erzurum", "Aşkale,Aziziye,Çat,Hınıs,Horasan,İspir,Karaçoban,Karayazı,Köprüköy,Narman,Oltu,Olur,Palandöken,Pasinler,Pazaryolu,Şenkaya,Tekman,Tortum,Uzundere,Yakutiye"],
  [26, "Eskişehir", "Alpu,Beylikova,Çifteler,Günyüzü,Han,İnönü,Mahmudiye,Mihalgazi,Mihalıççık,Odunpazarı,Sarıcakaya,Seyitgazi,Sivrihisar,Tepebaşı"],
  [27, "Gaziantep", "Araban,İslahiye,Karkamış,Nizip,Nurdağı,Oğuzeli,Şahinbey,Şehitkamil,Yavuzeli"],
  [28, "Giresun", "Alucra,Bulancak,Çamoluk,Çanakçı,Dereli,Doğankent,Espiye,Eynesil,Görele,Güce,Keşap,Merkez,Piraziz,Şebinkarahisar,Tirebolu,Yağlıdere"],
  [29, "Gümüşhane", "Kelkit,Köse,Kürtün,Merkez,Şiran,Torul"],
  [30, "Hakkari", "Çukurca,Derecik,Merkez,Şemdinli,Yüksekova"],
  [31, "Hatay", "Altınözü,Antakya,Arsuz,Belen,Defne,Dörtyol,Erzin,Hassa,İskenderun,Kırıkhan,Kumlu,Payas,Reyhanlı,Samandağ,Yayladağı"],
  [32, "Isparta", "Aksu,Atabey,Eğirdir,Gelendost,Gönen,Keçiborlu,Merkez,Senirkent,Sütçüler,Şarkikaraağaç,Uluborlu,Yalvaç,Yenişarbademli"],
  [33, "Mersin", "Akdeniz,Anamur,Aydıncık,Bozyazı,Çamlıyayla,Erdemli,Gülnar,Mezitli,Mut,Silifke,Tarsus,Toroslar,Yenişehir"],
  [34, "İstanbul", "Adalar,Arnavutköy,Ataşehir,Avcılar,Bağcılar,Bahçelievler,Bakırköy,Başakşehir,Bayrampaşa,Beşiktaş,Beykoz,Beylikdüzü,Beyoğlu,Büyükçekmece,Çatalca,Çekmeköy,Esenler,Esenyurt,Eyüpsultan,Fatih,Gaziosmanpaşa,Güngören,Kadıköy,Kağıthane,Kartal,Küçükçekmece,Maltepe,Pendik,Sancaktepe,Sarıyer,Silivri,Sultanbeyli,Sultangazi,Şile,Şişli,Tuzla,Ümraniye,Üsküdar,Zeytinburnu"],
  [35, "İzmir", "Aliağa,Balçova,Bayındır,Bayraklı,Bergama,Beydağ,Bornova,Buca,Çeşme,Çiğli,Dikili,Foça,Gaziemir,Güzelbahçe,Karabağlar,Karaburun,Karşıyaka,Kemalpaşa,Kınık,Kiraz,Konak,Menderes,Menemen,Narlıdere,Ödemiş,Seferihisar,Selçuk,Tire,Torbalı,Urla"],
  [36, "Kars", "Akyaka,Arpaçay,Digor,Kağızman,Merkez,Sarıkamış,Selim,Susuz"],
  [37, "Kastamonu", "Abana,Ağlı,Araç,Azdavay,Bozkurt,Cide,Çatalzeytin,Daday,Devrekani,Doğanyurt,Hanönü,İhsangazi,İnebolu,Küre,Merkez,Pınarbaşı,Seydiler,Şenpazar,Taşköprü,Tosya"],
  [38, "Kayseri", "Akkışla,Bünyan,Develi,Felahiye,Hacılar,İncesu,Kocasinan,Melikgazi,Özvatan,Pınarbaşı,Sarıoğlan,Sarız,Talas,Tomarza,Yahyalı,Yeşilhisar"],
  [39, "Kırklareli", "Babaeski,Demirköy,Kofçaz,Lüleburgaz,Merkez,Pehlivanköy,Pınarhisar,Vize"],
  [40, "Kırşehir", "Akçakent,Akpınar,Boztepe,Çiçekdağı,Kaman,Merkez,Mucur"],
  [41, "Kocaeli", "Başiskele,Çayırova,Darıca,Derince,Dilovası,Gebze,Gölcük,İzmit,Kandıra,Karamürsel,Kartepe,Körfez"],
  [42, "Konya", "Ahırlı,Akören,Akşehir,Altınekin,Beyşehir,Bozkır,Cihanbeyli,Çeltik,Çumra,Derbent,Derebucak,Doğanhisar,Emirgazi,Ereğli,Güneysınır,Hadim,Halkapınar,Hüyük,Ilgın,Kadınhanı,Karapınar,Karatay,Kulu,Meram,Sarayönü,Selçuklu,Seydişehir,Taşkent,Tuzlukçu,Yalıhüyük,Yunak"],
  [43, "Kütahya", "Altıntaş,Aslanapa,Çavdarhisar,Domaniç,Dumlupınar,Emet,Gediz,Hisarcık,Merkez,Pazarlar,Simav,Şaphane,Tavşanlı"],
  [44, "Malatya", "Akçadağ,Arapgir,Arguvan,Battalgazi,Darende,Doğanşehir,Doğanyol,Hekimhan,Kale,Kuluncak,Pütürge,Yazıhan,Yeşilyurt"],
  [45, "Manisa", "Ahmetli,Akhisar,Alaşehir,Demirci,Gölmarmara,Gördes,Kırkağaç,Köprübaşı,Kula,Salihli,Sarıgöl,Saruhanlı,Selendi,Soma,Şehzadeler,Turgutlu,Yunusemre"],
  [46, "Kahramanmaraş", "Afşin,Andırın,Çağlayancerit,Dulkadiroğlu,Ekinözü,Elbistan,Göksun,Nurhak,Onikişubat,Pazarcık,Türkoğlu"],
  [47, "Mardin", "Artuklu,Dargeçit,Derik,Kızıltepe,Mazıdağı,Midyat,Nusaybin,Ömerli,Savur,Yeşilli"],
  [48, "Muğla", "Bodrum,Dalaman,Datça,Fethiye,Kavaklıdere,Köyceğiz,Marmaris,Menteşe,Milas,Ortaca,Seydikemer,Ula,Yatağan"],
  [49, "Muş", "Bulanık,Hasköy,Korkut,Malazgirt,Merkez,Varto"],
  [50, "Nevşehir", "Acıgöl,Avanos,Derinkuyu,Gülşehir,Hacıbektaş,Kozaklı,Merkez,Ürgüp"],
  [51, "Niğde", "Altunhisar,Bor,Çamardı,Çiftlik,Merkez,Ulukışla"],
  [52, "Ordu", "Akkuş,Altınordu,Aybastı,Çamaş,Çatalpınar,Çaybaşı,Fatsa,Gölköy,Gülyalı,Gürgentepe,İkizce,Kabadüz,Kabataş,Korgan,Kumru,Mesudiye,Perşembe,Ulubey,Ünye"],
  [53, "Rize", "Ardeşen,Çamlıhemşin,Çayeli,Derepazarı,Fındıklı,Güneysu,Hemşin,İkizdere,İyidere,Kalkandere,Merkez,Pazar"],
  [54, "Sakarya", "Adapazarı,Akyazı,Arifiye,Erenler,Ferizli,Geyve,Hendek,Karapürçek,Karasu,Kaynarca,Kocaali,Pamukova,Sapanca,Serdivan,Söğütlü,Taraklı"],
  [55, "Samsun", "19 Mayıs,Alaçam,Asarcık,Atakum,Ayvacık,Bafra,Canik,Çarşamba,Havza,İlkadım,Kavak,Ladik,Salıpazarı,Tekkeköy,Terme,Vezirköprü,Yakakent"],
  [56, "Siirt", "Baykan,Eruh,Kurtalan,Merkez,Pervari,Şirvan,Tillo"],
  [57, "Sinop", "Ayancık,Boyabat,Dikmen,Durağan,Erfelek,Gerze,Merkez,Saraydüzü,Türkeli"],
  [58, "Sivas", "Akıncılar,Altınyayla,Divriği,Doğanşar,Gemerek,Gölova,Gürün,Hafik,İmranlı,Kangal,Koyulhisar,Merkez,Suşehri,Şarkışla,Ulaş,Yıldızeli,Zara"],
  [59, "Tekirdağ", "Çerkezköy,Çorlu,Ergene,Hayrabolu,Kapaklı,Malkara,Marmaraereğlisi,Muratlı,Saray,Süleymanpaşa,Şarköy"],
  [60, "Tokat", "Almus,Artova,Başçiftlik,Erbaa,Merkez,Niksar,Pazar,Reşadiye,Sulusaray,Turhal,Yeşilyurt,Zile"],
  [61, "Trabzon", "Akçaabat,Araklı,Arsin,Beşikdüzü,Çarşıbaşı,Çaykara,Dernekpazarı,Düzköy,Hayrat,Köprübaşı,Maçka,Of,Ortahisar,Sürmene,Şalpazarı,Tonya,Vakfıkebir,Yomra"],
  [62, "Tunceli", "Çemişgezek,Hozat,Mazgirt,Merkez,Nazımiye,Ovacık,Pertek,Pülümür"],
  [63, "Şanlıurfa", "Akçakale,Birecik,Bozova,Ceylanpınar,Eyyübiye,Halfeti,Haliliye,Harran,Hilvan,Karaköprü,Siverek,Suruç,Viranşehir"],
  [64, "Uşak", "Banaz,Eşme,Karahallı,Merkez,Sivaslı,Ulubey"],
  [65, "Van", "Bahçesaray,Başkale,Çaldıran,Çatak,Edremit,Erciş,Gevaş,Gürpınar,İpekyolu,Muradiye,Özalp,Saray,Tuşba"],
  [66, "Yozgat", "Akdağmadeni,Aydıncık,Boğazlıyan,Çandır,Çayıralan,Çekerek,Kadışehri,Merkez,Saraykent,Sarıkaya,Sorgun,Şefaatli,Yenifakılı,Yerköy"],
  [67, "Zonguldak", "Alaplı,Çaycuma,Devrek,Ereğli,Gökçebey,Kilimli,Kozlu,Merkez"],
  [68, "Aksaray", "Ağaçören,Eskil,Gülağaç,Güzelyurt,Merkez,Ortaköy,Sarıyahşi,Sultanhanı"],
  [69, "Bayburt", "Aydıntepe,Demirözü,Merkez"],
  [70, "Karaman", "Ayrancı,Başyayla,Ermenek,Kazımkarabekir,Merkez,Sarıveliler"],
  [71, "Kırıkkale", "Bahşılı,Balışeyh,Çelebi,Delice,Karakeçili,Keskin,Merkez,Sulakyurt,Yahşihan"],
  [72, "Batman", "Beşiri,Gercüş,Hasankeyf,Kozluk,Merkez,Sason"],
  [73, "Şırnak", "Beytüşşebap,Cizre,Güçlükonak,İdil,Merkez,Silopi,Uludere"],
  [74, "Bartın", "Amasra,Kurucaşile,Merkez,Ulus"],
  [75, "Ardahan", "Çıldır,Damal,Göle,Hanak,Merkez,Posof"],
  [76, "Iğdır", "Aralık,Karakoyunlu,Merkez,Tuzluca"],
  [77, "Yalova", "Altınova,Armutlu,Çınarcık,Çiftlikköy,Merkez,Termal"],
  [78, "Karabük", "Eflani,Eskipazar,Merkez,Ovacık,Safranbolu,Yenice"],
  [79, "Kilis", "Elbeyli,Merkez,Musabeyli,Polateli"],
  [80, "Osmaniye", "Bahçe,Düziçi,Hasanbeyli,Kadirli,Merkez,Sumbas,Toprakkale"],
  [81, "Düzce", "Akçakoca,Cumayeri,Çilimli,Gölyaka,Gümüşova,Kaynaşlı,Merkez,Yığılca"],
];

/** 81 il, plaka koduna göre sıralı; her ilin ilçeleri Türkçe alfabetik. */
export const PROVINCES: readonly Province[] = Object.freeze(
  RAW.map(([code, name, list]) =>
    Object.freeze({ code, name, districts: Object.freeze(list.split(",").sort(trSort)) }),
  ),
);

/** Sık görülen eski/alternatif ilçe yazımları → güncel resmî ad (il bazında). */
const DISTRICT_ALIASES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  İstanbul: { eyup: "Eyüpsultan" },
  Ankara: { kazan: "Kahramankazan" },
  Samsun: { ondokuzmayis: "19 Mayıs", "ondokuz mayis": "19 Mayıs" },
};

// ---------------------------------------------------------------------------
// Arama / normalizasyon
// ---------------------------------------------------------------------------

/**
 * Türkçe duyarlı arama anahtarı: tr küçük harf, ı/İ → i, ğüşöç ve şapkalı harfler → ASCII,
 * baş/son boşluk kırpılır, çoklu boşluk teke iner. "İSTANBUL", "Istanbul", "ıstanbul" → "istanbul".
 */
export function normalizeSearch(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

type Filterable = string | { label: string };
const labelOf = (o: Filterable) => (typeof o === "string" ? o : o.label);

/**
 * Normalize edilmiş alt dize eşleşmesi. Sıralama: önce baştan eşleşenler, sonra bir kelimenin
 * başından eşleşenler, sonra geri kalanlar; her grupta orijinal sıra korunur. Boş sorgu → hepsi.
 */
export function filterOptions<T extends Filterable>(query: string, options: readonly T[]): T[] {
  const q = normalizeSearch(query);
  if (!q) return options.slice();
  const prefix: T[] = [];
  const word: T[] = [];
  const rest: T[] = [];
  for (const o of options) {
    const n = normalizeSearch(labelOf(o));
    const idx = n.indexOf(q);
    if (idx < 0) continue;
    if (idx === 0) prefix.push(o);
    else if (/[\s\-(/]/.test(n[idx - 1])) word.push(o);
    else rest.push(o);
  }
  return [...prefix, ...word, ...rest];
}

// ---------------------------------------------------------------------------
// İl / ilçe / ülke yardımcıları
// ---------------------------------------------------------------------------

const PROVINCE_BY_KEY = new Map(PROVINCES.map((p) => [normalizeSearch(p.name), p]));
// Yaygın alternatif yazımlar.
PROVINCE_BY_KEY.set("afyon", PROVINCE_BY_KEY.get("afyonkarahisar")!);
PROVINCE_BY_KEY.set("maras", PROVINCE_BY_KEY.get("kahramanmaras")!);
PROVINCE_BY_KEY.set("urfa", PROVINCE_BY_KEY.get("sanliurfa")!);
PROVINCE_BY_KEY.set("antep", PROVINCE_BY_KEY.get("gaziantep")!);
PROVINCE_BY_KEY.set("icel", PROVINCE_BY_KEY.get("mersin")!);

const PROVINCE_NAMES_SORTED: readonly string[] = Object.freeze(PROVINCES.map((p) => p.name).sort(trSort));

/** İl adları, Türkçe alfabetik (Adana, Adıyaman, Afyonkarahisar, Ağrı, …). */
export function provinceNames(): readonly string[] {
  return PROVINCE_NAMES_SORTED;
}

/** Normalize eşitlikle il bulur ("sanliurfa" → Şanlıurfa); yoksa null. */
export function findProvince(name: string | null | undefined): Province | null {
  const key = normalizeSearch(name);
  if (!key) return null;
  return PROVINCE_BY_KEY.get(key) ?? null;
}

/** İlin resmî ilçe listesi; il tanınmıyorsa []. */
export function districtsOf(city: string | null | undefined): readonly string[] {
  return findProvince(city)?.districts ?? [];
}

/** İl adının resmî yazımı ("istanbul" → "İstanbul"); tanınmıyorsa null. */
export function canonicalProvince(name: string | null | undefined): string | null {
  return findProvince(name)?.name ?? null;
}

/** İlçenin il içindeki resmî yazımı ("cankaya", Ankara → "Çankaya"); tanınmıyorsa null. */
export function canonicalDistrict(city: string | null | undefined, district: string | null | undefined): string | null {
  const province = findProvince(city);
  const key = normalizeSearch(district);
  if (!province || !key) return null;
  const hit = province.districts.find((d) => normalizeSearch(d) === key);
  if (hit) return hit;
  return DISTRICT_ALIASES[province.name]?.[key] ?? null;
}

const COUNTRY_BY_KEY = new Map<string, Country>();
for (const c of COUNTRIES) {
  for (const k of [c.name, c.code, ...(c.aliases ?? [])]) {
    const key = normalizeSearch(k);
    if (key && !COUNTRY_BY_KEY.has(key)) COUNTRY_BY_KEY.set(key, c);
  }
}

/** Ad, ISO kodu veya bilinen alternatif yazımdan ülkeyi bulur ("TR", "Turkey" → Türkiye). */
export function findCountry(name: string | null | undefined): Country | null {
  const key = normalizeSearch(name);
  if (!key) return null;
  return COUNTRY_BY_KEY.get(key) ?? null;
}

/** Ülkenin listedeki Türkçe adı ("turkey" → "Türkiye", "DE" → "Almanya"); tanınmıyorsa null. */
export function canonicalCountry(name: string | null | undefined): string | null {
  return findCountry(name)?.name ?? null;
}

/** Ülkenin ISO alpha-2 kodu ("Türkiye" → "TR"); tanınmıyor/kodsuzsa null. */
export function countryCode(name: string | null | undefined): string | null {
  return findCountry(name)?.code ?? null;
}

/** Boş ülke Türkiye kabul edilir (kayıtların çoğu ülke alanı olmadan girilmiş). */
export function isTurkey(country: string | null | undefined): boolean {
  const key = normalizeSearch(country);
  if (!key) return true;
  return findCountry(key)?.code === "TR";
}

// ---------------------------------------------------------------------------
// Yeni kayıt varsayılanları
// ---------------------------------------------------------------------------

export interface LocationDraft {
  city?: string | null;
  district?: string | null;
  country?: string | null;
}

/**
 * Yeni kayıt varsayılanları (Ülke = Türkiye, İl = İstanbul): yalnız BOŞ alanlar için yama döner.
 * Dolu değerlere (eski kayıtlar, listede olmayan yazımlar dahil) dokunulmaz; ülke Türkiye dışıysa
 * il doldurulmaz; ilçe hiçbir zaman varsayılanla doldurulmaz. Doldurulacak alan yoksa `{}`.
 */
export function locationDefaults(value: LocationDraft): { city?: string; country?: string } {
  const patch: { city?: string; country?: string } = {};
  const country = (value.country ?? "").trim();
  if (!country) patch.country = DEFAULT_COUNTRY;
  const cityEmpty = !(value.city ?? "").trim();
  const districtEmpty = !(value.district ?? "").trim();
  if (cityEmpty && districtEmpty && isTurkey(country)) patch.city = DEFAULT_PROVINCE;
  return patch;
}

/** `locationDefaults` uygulanmış kopya (yeni kayıt formlarının başlangıç durumu için). */
export function withLocationDefaults<T extends LocationDraft>(value: T): T {
  return { ...value, ...locationDefaults(value) } as T;
}

/**
 * Eski serbest metin konumları okunurken listedeki resmî yazıma eşler ("istanbul" → "İstanbul", "TR" → "Türkiye").
 * Tanınmayan değerler olduğu gibi kalır (formda "listede yok" uyarısı çıkar). Yeni kayıt varsayılanı uygulamaz.
 */
export function canonicalLocation(value: LocationDraft): { city: string; district: string; country: string } {
  const rawCountry = (value.country ?? "").trim();
  const country = rawCountry ? (canonicalCountry(rawCountry) ?? rawCountry) : "";
  const rawCity = (value.city ?? "").trim();
  const rawDistrict = (value.district ?? "").trim();
  if (!isTurkey(country)) return { city: rawCity, district: rawDistrict, country };
  const city = canonicalProvince(rawCity) ?? rawCity;
  const district = canonicalDistrict(city, rawDistrict) ?? rawDistrict;
  return { city, district, country };
}
