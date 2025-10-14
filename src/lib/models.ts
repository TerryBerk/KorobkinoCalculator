export type TariffLabel = "от 100 ед." | "от 500 ед." | "от 1000 ед.";

export type ServiceRow = {
  Код: string;
  Категория: string;
  Наименование: string;
  "Ед. изм.": string;
  "от 100 ед.": number | null;
  "от 500 ед.": number | null;
  "от 1000 ед.": number | null;
  "Фикс. цена": number | null;
  Примечание?: string;
};

export type LogisticsRow = {
  Маркетплейс: string;
  Локация: string;
  Тип: "Короб" | "Палет";
  "Диапазон коробов": string;
  "Цена, ₽": number;
};

export type ParamsMap = Record<string, number | string>;

export type CartItem = {
  code: string;
  name: string;
  qty: number;
  unit?: string;
};

export type LogisticsInput = {
  marketplace: string;
  location: string;
  kind: "Короб" | "Палет";
  count: number;
  pickupVolumeCbm?: number;
};

export type QuoteLine = CartItem & {
  unitPrice: number;
  tariffLabel?: TariffLabel;
  lineTotal: number;
  minQty?: number;
  note?: string;
};

export type Quote = {
  items: QuoteLine[];
  logistics?: {
    pricePerShipment: number;
    discount: number;
    total: number;
    matchedRange?: string;
  };
  grandTotal: number;
};

export type Urls = {
  servicesCsvUrl: string;
  logisticsCsvUrl: string;
  paramsCsvUrl: string;
};

export type ThemeTokens = {
  background: string;
  surface: string;
  border: string;
  primary: string;
  primaryText: string;
  text: string;
  mutedText: string;
  accent: string;
};

export type MountOptions = {
  urls: Urls;
  locale?: "ru" | "en";
  onQuoteChange?: (quote: Quote) => void;
  theme?: Partial<ThemeTokens>;
};

export type DatasetCacheKey = "services" | "logistics" | "params";

export type DatasetCacheEntry = {
  timestamp: number;
  payload: string;
};
