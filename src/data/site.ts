export type Spec = { name: string; value: string };
export type Doc = { type?: string; name?: string; url?: string; public_path?: string; size_kb?: number };
export type Product = {
  id: string;
  sku: string;
  okpd2?: string;
  tnved?: string;
  title: string;
  section: "intercom" | "switches" | "nodes" | "rlock";
  subcategory: string;
  description: string;
  features: string[];
  specs: Spec[];
  price: number;
  stock_qty: number;
  stock_status: "in_stock" | "pre_order";
  images: string[];
  documents: Doc[];
  status: "found" | "placeholder";
  flags: { isHit?: boolean; isNew?: boolean };
};

export const SECTIONS = [
  {
    id: "intercom",
    href: "#/intercom",
    title: "Домофонная система",
    desc: "IP-домофония SpaceCam: станции вызова, мониторы, аксессуары. PoE-питание, единая сеть с видеонаблюдением.",
    bullets: ["Станции вызова 2 МП", "Мониторы 7\"–10\" Linux", "Питание PoE 802.3af"],
  },
  {
    id: "switches",
    href: "#/switches",
    title: "Коммутаторы",
    desc: "Управляемые и неуправляемые коммутаторы с PoE, промышленные серии SC-I, SFP-модули до 10G.",
    bullets: ["PoE+ / PoE++ до 90 Вт", "Управляемые L2/L3", "Промышленные −40…+85 °C"],
  },
  {
    id: "nodes",
    href: "#/nodes",
    title: "Узлы коммутации",
    desc: "Всепогодные шкафы SC-Box со встроенным коммутатором, ИБП и термостабилизацией. IP66, −60…+60 °C.",
    bullets: ["Всепогодные IP66", "−60…+60 °C, ИБП до 2 ч", "Грозозащита 6 кВ"],
  },
  {
    id: "rlock",
    href: "#/rlock",
    title: "Замки и доводчики R-Lock",
    desc: "Электромагнитные замки 180–1200 кг (в том числе сдвиговые врезные), дверные доводчики EN2–EN5, кронштейны и уголки для монтажа. Комплектация СКУД на дверях любого типа: металлических, деревянных, из профиля.",
    bullets: ["Электромагнитные замки 180–1200 кг", "Доводчики EN2–EN5, −40…+50 °C", "Кронштейны L/Z/U для любых дверей"],
  },
] as const;

export const FEATURES = [
  { title: "Высокая надежность", text: "Оборудование рассчитано на круглосуточную работу в сложных условиях: узлы SC-Box — IP66 и −60…+60 °C." },
  { title: "PoE-питание", text: "Домофония и камеры получают питание по Ethernet: 802.3af/at/bt, бюджеты до 680 Вт — монтаж без отдельных БП." },
  { title: "Пропускная способность", text: "Стабильная работа многоканального видео: от 26 Гбит/с на коммутаторах, uplink-оптика SFP до 10G." },
  { title: "Кибербезопасность", text: "Встроенные механизмы защиты: VLAN, ACL, 802.1X, SNMPv3, шифрование трафика и контроль доступа." },
  { title: "Интеграция", text: "Совместимость с IP-камерами, СКУД и домофонией — единая сеть безопасности на одном оборудовании." },
  { title: "Гарантия и поддержка", text: "До 60 месяцев гарантии на узлы коммутации, техподдержка производителя и проектный отдел." },
];

export const PROJECTS = [
  { title: "Благоустройство Платовского проспекта", place: "Новочеркасск", text: "15 всепогодных узлов SC-Box. Победитель IX Всероссийского конкурса комфортной городской среды 2024.", tags: ["Конкурс 2024", "Уличный монтаж", "Видеонаблюдение"], equip: "Узлы коммутации SC-Box — 15 шт", equipText: "Всепогодные узлы коммутации SC-Box обеспечили питание и связь уличного видеонаблюдения и SOS-стел. Проект стал победителем IX Всероссийского конкурса комфортной городской среды 2024 года.", date: null },
  { title: "ФОК «Южное Бутово»", place: "ул. Поляны 35, Москва", text: "15 станций вызова, централизованная связь с диспетчерской. Открыт в марте 2026 года.", tags: ["Открыт 03.2026", "Домофония", "СКУД", "Спортивные объекты"], equip: "Станции вызова SpaceCam — 15 шт", equipText: "Физкультурно-оздоровительный комплекс: домофонная связь всех зон с диспетчерской, контроль доступа и видеонаблюдение на единой сетевой инфраструктуре SpaceCam.", date: "Открыт 03.2026" },
  { title: "ЖК, 5 секций, этажи −2…+12", place: "Москва", text: "IP-домофония на узлах SC: 44 этажных узла PoE, оптика 1G, 110+ абонентов, 3 АРМ консьержа.", tags: ["Миграция с аналога", "IP-домофония", "Оптика 1G"], equip: "44 этажных узла PoE, 110+ абонентов", equipText: "Замена аналоговой домофонии на IP: переиспользование кабельных трасс UTP, этажные узлы PoE 120 Вт, оптические линки 1G между секциями, 3 АРМ консьержа. Состав рассчитан проектным отделом.", date: null },
];

export const SCHEME = [
  { title: "Станции вызова", code: "SC-INT-D100/D200/D500", tag: "PoE 802.3af" },
  { title: "Этажные узлы", code: "SC-8GP-120 / SC-L2-8GP-120", tag: "PoE+ · до 8 устройств" },
  { title: "Агрегация", code: "SC-L2-24G-4G + SFP", tag: "оптика 1G SM до 3 км" },
  { title: "Ядро и АРМ", code: "SC-L3-48G-6GX", tag: "мониторы V007/V010" },
];

// T4: лого брендов из ПТК Бренд Бук 2025 (каждому бренду — своё лого)
export type Brand = { name: string; logo: string; desc: string; primary: boolean; url?: string; linkLabel?: string };
// R-Safe убран из витрины по решению владельца (26.10.2026)
export const BRANDS: Brand[] = [
  { name: "ПТК", logo: "/brands/ptk.png", desc: "Огнестойкие кабельные линии и СКС, модули газового пожаротушения", primary: true, url: "https://ptcab.ru", linkLabel: "ptcab.ru" },
  { name: "R-LOCK", logo: "/brands/rlock.png", desc: "Электромагнитные замки 180–1200 кг, доводчики и кронштейны для СКУД", primary: false, url: "https://layta.ru/brands/r_lock-936", linkLabel: "Каталог R-Lock на layta.ru" },
  { name: "SpaceCam", logo: "/brands/spacecam.png", desc: "Сетевое оборудование и IP-домофония для систем безопасности", primary: true },
];

export const ABOUT = {
  intro: [
    { lead: "ООО «Технолайт»", rest: " — компания дистрибутор, разработчик и производитель продуктов и решений для систем безопасности и автоматизации зданий. Наши офисы, склады, производственные площадки находятся как в РФ так и Китае." },
    { lead: "", rest: "Целевая аудитория — монтажные и проектные организации, системные интеграторы, промышленные предприятия, ЦОД, девелоперы жилой недвижимости." },
    { lead: "", rest: "Узлы коммутации выпускаются по ТУ 26.30.23-002-02123310-2023, декларация соответствия ЕАЭС N RU Д-RU.РА10.В.82587/23. Гарантия — до 60 месяцев." },
  ],
  supportNote: "Паспорта, руководства и сертификаты доступны в карточках товаров — блок «Документация и сертификаты». Дополнительные материалы — по запросу через проектный отдел.",
};

export type DealerLink = { label: string; url: string };
export type Dealer = { name: string; brand: string; logo?: string; text: string; url?: string; linkLabel?: string; links?: DealerLink[] };
export const WHERE = {
  retail: { title: "Розница и опт — layta.ru", text: "Официальная витрина производителя: актуальные цены, остатки и оформление заказа онлайн. Каталоги по направлениям:" },
  marketplaces: ["Сбер Мегамаркет", "Яндекс Маркет"],
  dealers: [
    {
      name: "layta.ru",
      brand: "SpaceCam · R-Lock",
      logo: "/dealers/layta.svg",
      text: "Официальная витрина производителя: актуальные цены, остатки и оформление заказа онлайн. Каталоги по направлениям:",
      links: [
        { label: "SpaceCam домофония", url: "https://layta.ru/brands/spacecam_domofoniya-2813" },
        { label: "SpaceCam коммутаторы", url: "https://layta.ru/brands/spacecam_kommutatory-2805" },
        { label: "SpaceCam узлы коммутации", url: "https://layta.ru/brands/spacecam_uzly_kommutacii-2804" },
        { label: "R-Lock замки и доводчики", url: "https://layta.ru/brands/r_lock-936" },
      ],
    },
    { name: "ЭТМ", brand: "R-Lock", logo: "/dealers/etm.png", text: "Федеральный дистрибьютор электронных компонентов и оборудования для СКУД: замки и монтажные аксессуары R-Lock в наличии и под заказ.", url: "https://www.etm.ru/catalog/90_bezopasnost_i_sks-4032_r_lock", linkLabel: "R-Lock в каталоге ЭТМ" },
    { name: "Тинко", brand: "R-Lock", logo: "/dealers/tinko.png", text: "Замки и доводчики R-Lock на брендовой странице каталога Тинко.", url: "https://www.tinko.ru/brands/r_lock/", linkLabel: "R-Lock на tinko.ru" },
    { name: "Тинко", brand: "SpaceCam", logo: "/dealers/tinko.png", text: "Коммутаторы SpaceCam на брендовой странице каталога Тинко.", url: "https://www.tinko.ru/brands/spacecam/", linkLabel: "SpaceCam на tinko.ru" },
    { name: "Московские системы безопасности", brand: "SpaceCam", logo: "/dealers/mossb.png", text: "Коммутаторы и узлы коммутации SpaceCam в каталоге МСБ.", url: "https://mossb.ru/info/brands/brand-spacecam/", linkLabel: "SpaceCam на mossb.ru" },
  ] as Dealer[],
  project: { title: "Проектные поставки", text: "Подбор состава под объект, расчёт бюджета PoE, схема сети, спецификация и поэтапная поставка. Работаем с проектными и монтажными организациями." },
  consult: { title: "Техническая консультация", text: "Поможем выбрать модели, проверить совместимость и бюджет питания. Поддержка производителя: понедельник–пятница, 9:00–18:00 МСК." },
};

export const CONTACTS = {
  phone: "8 800 444-35-00",
  phoneHref: "tel:88004443500",
  email: "support@layta.ru",
  production: "Производство: г. Санкт-Петербург",
  // T3: единый адрес по всему бренду
  office: "121471 г. Москва, Рябиновая 45А, стр. 24",
};
