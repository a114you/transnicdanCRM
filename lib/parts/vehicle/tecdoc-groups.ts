/**
 * Unified service catalog (TecDoc-like assembly groups).
 * `enormId` maps to ENORM/APS products_by_car category tree IDs when known.
 * Expanded for workshop coverage — not only TО items.
 */

export interface ServicePartType {
  id: string;
  nameRu: string;
  nameRo: string;
  /** ENORM/APS category id when known */
  enormId?: number;
  parentId?: string;
  /** Keywords for fallback article search */
  searchHints?: string[];
  /** Typical for scheduled maintenance */
  maintenance?: boolean;
}

export interface ServiceGroup {
  id: string;
  nameRu: string;
  nameRo: string;
  enormId?: number;
  children: ServicePartType[];
}

/** Root groups — broad workshop coverage */
export const SERVICE_GROUPS: ServiceGroup[] = [
  {
    id: "filters",
    nameRu: "Фильтры",
    nameRo: "Filtre",
    enormId: 477,
    children: [
      { id: "filter-oil", nameRu: "Масляный фильтр", nameRo: "Filtru ulei", enormId: 478, parentId: "filters", maintenance: true, searchHints: ["OC90", "W712"] },
      { id: "filter-air", nameRu: "Воздушный фильтр", nameRo: "Filtru aer", enormId: 479, parentId: "filters", maintenance: true },
      { id: "filter-fuel", nameRu: "Топливный фильтр", nameRo: "Filtru combustibil", enormId: 480, parentId: "filters", maintenance: true },
      { id: "filter-cabin", nameRu: "Фильтр салона", nameRo: "Filtru habitaclu", enormId: 482, parentId: "filters", maintenance: true },
      { id: "filter-trans", nameRu: "Фильтр АКПП / ГУР", nameRo: "Filtru cutie / servodirecție", parentId: "filters" },
    ],
  },
  {
    id: "brakes",
    nameRu: "Тормозная система",
    nameRo: "Sistem de frânare",
    enormId: 485,
    children: [
      { id: "brake-pads", nameRu: "Тормозные колодки", nameRo: "Plăcuțe frână", parentId: "brakes", maintenance: true, searchHints: ["GDB"] },
      { id: "brake-discs", nameRu: "Тормозные диски", nameRo: "Discuri frână", parentId: "brakes", maintenance: true },
      { id: "brake-drums", nameRu: "Тормозные барабаны / колодки барабан", nameRo: "Tamburi / plăcuțe", parentId: "brakes" },
      { id: "brake-fluid", nameRu: "Тормозная жидкость", nameRo: "Lichid frână", enormId: 518, parentId: "brakes", maintenance: true, searchHints: ["DOT4"] },
      { id: "brake-hoses", nameRu: "Тормозные шланги", nameRo: "Furtune frână", enormId: 494, parentId: "brakes" },
      { id: "brake-master", nameRu: "Главный тормозной цилиндр", nameRo: "Cilindru principal frână", enormId: 487, parentId: "brakes" },
      { id: "brake-caliper", nameRu: "Суппорт", nameRo: "Etrier", enormId: 488, parentId: "brakes" },
      { id: "brake-abs", nameRu: "ABS / датчики / блок", nameRo: "ABS / senzori", parentId: "brakes" },
      { id: "brake-hand", nameRu: "Стояночный тормоз", nameRo: "Frână de mână", parentId: "brakes" },
    ],
  },
  {
    id: "ignition",
    nameRu: "Зажигание / накал",
    nameRo: "Aprindere / bujii",
    enormId: 557,
    children: [
      { id: "spark-plugs", nameRu: "Свечи зажигания", nameRo: "Bujii aprindere", parentId: "ignition", maintenance: true, searchHints: ["BKR6E", "IK20"] },
      { id: "glow-plugs", nameRu: "Свечи накаливания", nameRo: "Bujii incandescente", parentId: "ignition", maintenance: true },
      { id: "ignition-coils", nameRu: "Катушки зажигания", nameRo: "Bobine", parentId: "ignition" },
      { id: "ignition-wires", nameRu: "ВВ-провода", nameRo: "Cabluri bujii", parentId: "ignition" },
    ],
  },
  {
    id: "cooling",
    nameRu: "Система охлаждения",
    nameRo: "Sistem de răcire",
    enormId: 529,
    children: [
      { id: "coolant", nameRu: "Охлаждающая жидкость", nameRo: "Antigel", parentId: "cooling", maintenance: true, searchHints: ["G12"] },
      { id: "thermostat", nameRu: "Термостат", nameRo: "Termostat", parentId: "cooling" },
      { id: "water-pump", nameRu: "Помпа водяная", nameRo: "Pompă apă", parentId: "cooling" },
      { id: "radiator", nameRu: "Радиатор", nameRo: "Radiator", parentId: "cooling" },
      { id: "radiator-fan", nameRu: "Вентилятор / диффузор", nameRo: "Ventilator", parentId: "cooling" },
      { id: "coolant-hose", nameRu: "Патрубки охлаждения", nameRo: "Furtune răcire", parentId: "cooling" },
      { id: "expansion-tank", nameRu: "Бачок расширительный", nameRo: "Vas expansiune", parentId: "cooling" },
    ],
  },
  {
    id: "fuel",
    nameRu: "Топливная система",
    nameRo: "Sistem de alimentare",
    children: [
      { id: "fuel-pump", nameRu: "Бензонасос / ТНВД", nameRo: "Pompă combustibil", parentId: "fuel" },
      { id: "injectors", nameRu: "Форсунки", nameRo: "Injectoare", parentId: "fuel" },
      { id: "fuel-rail", nameRu: "Рампа / регулятор давления", nameRo: "Rampă / regulator", parentId: "fuel" },
      { id: "throttle", nameRu: "Дроссельная заслонка", nameRo: "Clapetă accelerație", parentId: "fuel" },
      { id: "turbo", nameRu: "Турбина / интеркулер", nameRo: "Turbocompresor", parentId: "fuel" },
      { id: "egr", nameRu: "EGR / клапаны", nameRo: "EGR", parentId: "fuel" },
    ],
  },
  {
    id: "exhaust",
    nameRu: "Выхлопная система",
    nameRo: "Sistem de evacuare",
    children: [
      { id: "lambda", nameRu: "Лямбда-зонд", nameRo: "Sondă lambda", parentId: "exhaust" },
      { id: "catalyst", nameRu: "Катализатор / сажевый фильтр", nameRo: "Catalizator / FAP", parentId: "exhaust" },
      { id: "muffler", nameRu: "Глушитель / гофра", nameRo: "Toba / compensator", parentId: "exhaust" },
      { id: "manifold", nameRu: "Коллектор выпускной", nameRo: "Colector evacuare", parentId: "exhaust" },
    ],
  },
  {
    id: "suspension",
    nameRu: "Подвеска / амортизация",
    nameRo: "Suspensie / amortizoare",
    enormId: 678,
    children: [
      { id: "shock-absorber", nameRu: "Амортизаторы", nameRo: "Amortizoare", parentId: "suspension" },
      { id: "strut-mount", nameRu: "Опоры амортизатора", nameRo: "Suport amortizor", parentId: "suspension" },
      { id: "coil-spring", nameRu: "Пружины", nameRo: "Arcuri", parentId: "suspension" },
      { id: "control-arm", nameRu: "Рычаги", nameRo: "Brațe", parentId: "suspension" },
      { id: "ball-joint", nameRu: "Шаровые опоры", nameRo: "Pivot", parentId: "suspension" },
      { id: "stabilizer", nameRu: "Стабилизатор / стойки", nameRo: "Stabilizator", parentId: "suspension" },
      { id: "hub-bearing", nameRu: "Ступицы / подшипники", nameRo: "Rulmenți roată", parentId: "suspension" },
      { id: "silentblock", nameRu: "Сайлентблоки", nameRo: "Bucșe", parentId: "suspension" },
    ],
  },
  {
    id: "steering",
    nameRu: "Рулевое управление",
    nameRo: "Direcție",
    enormId: 692,
    children: [
      { id: "tie-rod", nameRu: "Наконечники / тяги", nameRo: "Capete de bară", parentId: "steering" },
      { id: "steering-rack", nameRu: "Рейка / редуктор", nameRo: "Cremalieră", parentId: "steering" },
      { id: "power-steering-pump", nameRu: "Насос ГУР", nameRo: "Pompă servodirecție", parentId: "steering" },
      { id: "steering-hose", nameRu: "Шланги ГУР", nameRo: "Furtune servodirecție", parentId: "steering" },
    ],
  },
  {
    id: "belts",
    nameRu: "Ременный / цепной привод",
    nameRo: "Transmisie curea / lanț",
    enormId: 767,
    children: [
      { id: "timing-belt", nameRu: "Ремень ГРМ / комплект", nameRo: "Curea distribuție", parentId: "belts", maintenance: true },
      { id: "timing-chain", nameRu: "Цепь ГРМ / комплект", nameRo: "Lanț distribuție", parentId: "belts" },
      { id: "serpentine-belt", nameRu: "Ремень генератора", nameRo: "Curea alternator", parentId: "belts", maintenance: true },
      { id: "tensioner", nameRu: "Ролики / натяжители", nameRo: "Role / întinzătoare", parentId: "belts" },
    ],
  },
  {
    id: "clutch",
    nameRu: "Сцепление",
    nameRo: "Ambreiaj",
    enormId: 812,
    children: [
      { id: "clutch-kit", nameRu: "Комплект сцепления", nameRo: "Kit ambreiaj", parentId: "clutch" },
      { id: "clutch-bearing", nameRu: "Выжимной подшипник", nameRo: "Rulment presiune", parentId: "clutch" },
      { id: "clutch-cylinder", nameRu: "Цилиндр сцепления", nameRo: "Cilindru ambreiaj", parentId: "clutch" },
      { id: "flywheel", nameRu: "Маховик", nameRo: "Volantă", parentId: "clutch" },
    ],
  },
  {
    id: "transmission",
    nameRu: "КПП / приводы",
    nameRo: "Cutie / transmisie",
    children: [
      { id: "cv-joint", nameRu: "ШРУС / пыльники", nameRo: "Planetară / burduf", parentId: "transmission" },
      { id: "drive-shaft", nameRu: "Приводной вал", nameRo: "Ax cardanic", parentId: "transmission" },
      { id: "gearbox-mount", nameRu: "Подушки КПП / двигателя", nameRo: "Suport cutie / motor", parentId: "transmission" },
      { id: "gearbox-seal", nameRu: "Сальники КПП", nameRo: "Simeringuri cutie", parentId: "transmission" },
    ],
  },
  {
    id: "engine",
    nameRu: "Двигатель",
    nameRo: "Motor",
    enormId: 229,
    children: [
      { id: "gaskets", nameRu: "Прокладки / ГБЦ", nameRo: "Garnituri", enormId: 258, parentId: "engine" },
      { id: "oil-pump", nameRu: "Система смазки / насос", nameRo: "Ungere / pompă", enormId: 273, parentId: "engine" },
      { id: "timing", nameRu: "ГРМ (распредвалы / клапана)", nameRo: "Distribuție", enormId: 230, parentId: "engine" },
      { id: "engine-mount", nameRu: "Подушки двигателя", nameRo: "Suport motor", parentId: "engine" },
      { id: "valve-cover", nameRu: "Крышка клапанов", nameRo: "Capac culbutori", parentId: "engine" },
      { id: "pistons", nameRu: "Поршневая группа", nameRo: "Pistoane", parentId: "engine" },
    ],
  },
  {
    id: "electrics",
    nameRu: "Электрика",
    nameRo: "Electrică",
    enormId: 573,
    children: [
      { id: "battery", nameRu: "АКБ", nameRo: "Baterie", parentId: "electrics", maintenance: true },
      { id: "starter", nameRu: "Стартер", nameRo: "Electromotor", parentId: "electrics" },
      { id: "alternator", nameRu: "Генератор", nameRo: "Alternator", parentId: "electrics" },
      { id: "lamps", nameRu: "Лампы", nameRo: "Becuri", parentId: "electrics", searchHints: ["H7", "H4"] },
      { id: "sensors", nameRu: "Датчики (ABS, ДПКВ, ДМРВ…)", nameRo: "Senzori", parentId: "electrics" },
      { id: "relays-fuses", nameRu: "Реле / предохранители", nameRo: "Relee / siguranțe", parentId: "electrics" },
      { id: "window-regulator", nameRu: "Стеклоподъёмник", nameRo: "Macara geam", parentId: "electrics" },
    ],
  },
  {
    id: "body",
    nameRu: "Кузов / оптика / салон",
    nameRo: "Caroserie / optică",
    children: [
      { id: "headlight", nameRu: "Фары / фонари", nameRo: "Faruri / stopuri", parentId: "body" },
      { id: "bumper", nameRu: "Бампер / усилитель", nameRo: "Bara / armătură", parentId: "body" },
      { id: "mirror", nameRu: "Зеркала", nameRo: "Oglinzi", parentId: "body" },
      { id: "door-handle", nameRu: "Ручки / замки дверей", nameRo: "Mânere / yala", parentId: "body" },
      { id: "radiator-support", nameRu: "Панель / телевизор", nameRo: "Panou față", parentId: "body" },
    ],
  },
  {
    id: "hvac",
    nameRu: "Отопление / кондиционер",
    nameRo: "Climatizare",
    children: [
      { id: "ac-compressor", nameRu: "Компрессор кондиционера", nameRo: "Compresor AC", parentId: "hvac" },
      { id: "ac-radiator", nameRu: "Радиатор кондиционера", nameRo: "Radiator AC", parentId: "hvac" },
      { id: "heater-radiator", nameRu: "Радиатор печки", nameRo: "Radiator habitaclu", parentId: "hvac" },
      { id: "blower", nameRu: "Мотор печки", nameRo: "Ventilator habitaclu", parentId: "hvac" },
    ],
  },
  {
    id: "oils",
    nameRu: "Масла и жидкости (ТО)",
    nameRo: "Uleiuri și lichide",
    children: [
      { id: "oil-motor", nameRu: "Моторное масло", nameRo: "Ulei motor", parentId: "oils", maintenance: true, searchHints: ["5W30", "5W40"] },
      { id: "oil-trans", nameRu: "Трансмиссионное масло", nameRo: "Ulei transmisie", parentId: "oils", maintenance: true },
      { id: "washer-fluid", nameRu: "Омыватель / химия", nameRo: "Lichid parbriz", parentId: "oils" },
    ],
  },
  {
    id: "wipers",
    nameRu: "Очистка стёкол",
    nameRo: "Ștergătoare",
    enormId: 798,
    children: [
      { id: "wiper-blades", nameRu: "Щётки стеклоочистителя", nameRo: "Lamele ștergător", parentId: "wipers", maintenance: true },
      { id: "wiper-motor", nameRu: "Мотор дворников", nameRo: "Motor ștergător", parentId: "wipers" },
    ],
  },
];

/** Flat list for quick lookup */
export function allPartTypes(): ServicePartType[] {
  return SERVICE_GROUPS.flatMap((g) =>
    g.children.map((c) => ({ ...c, parentId: c.parentId || g.id }))
  );
}

export function findPartType(id: string): ServicePartType | undefined {
  return allPartTypes().find((p) => p.id === id);
}

export function findGroup(id: string): ServiceGroup | undefined {
  return SERVICE_GROUPS.find((g) => g.id === id);
}

/** Map common makes from VIN decode → ENORM brand slug */
export const MAKE_TO_ENORM_SLUG: Record<string, string> = {
  DACIA: "dacia",
  RENAULT: "renault",
  VOLKSWAGEN: "vw",
  VW: "vw",
  SKODA: "skoda",
  "ŠKODA": "skoda",
  AUDI: "audi",
  SEAT: "seat",
  BMW: "bmw",
  MINI: "mini",
  MERCEDES: "mercedes-benz",
  "MERCEDES-BENZ": "mercedes-benz",
  MERCEDESBENZ: "mercedes-benz",
  OPEL: "opel",
  VAUXHALL: "vauxhall",
  FORD: "ford",
  TOYOTA: "toyota",
  HONDA: "honda",
  HYUNDAI: "hyundai",
  KIA: "kia",
  NISSAN: "nissan",
  MITSUBISHI: "mitsubishi",
  MAZDA: "mazda",
  SUZUKI: "suzuki",
  SUBARU: "subaru",
  CHEVROLET: "chevrolet",
  PEUGEOT: "peugeot",
  CITROEN: "citroen",
  "CITROËN": "citroen",
  FIAT: "fiat",
  ALFAROMEO: "alfa-romeo",
  "ALFA ROMEO": "alfa-romeo",
  JEEP: "jeep",
  CHRYSLER: "chrysler",
  VOLVO: "volvo",
  LANDROVER: "land-rover",
  "LAND ROVER": "land-rover",
  LEXUS: "lexus",
  INFINITI: "infiniti",
  PORSCHE: "porsche",
  LADA: "lada",
  VAZ: "lada",
  JAGUAR: "jaguar",
};

export function makeToEnormSlug(make?: string): string | null {
  if (!make) return null;
  const key = make.trim().toUpperCase().replace(/\s+/g, " ");
  if (MAKE_TO_ENORM_SLUG[key]) return MAKE_TO_ENORM_SLUG[key]!;
  const compact = key.replace(/[\s\-]/g, "");
  for (const [k, v] of Object.entries(MAKE_TO_ENORM_SLUG)) {
    if (k.replace(/[\s\-]/g, "") === compact) return v;
  }
  return (
    make
      .trim()
      .toLowerCase()
      .replace(/[^\w]+/g, "-")
      .replace(/^-|-$/g, "") || null
  );
}
