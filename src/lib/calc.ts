import type {
  CartItem,
  LogisticsInput,
  LogisticsRow,
  ParamsMap,
  Quote,
  ServiceRow,
  TariffLabel
} from "./models";

const DEFAULT_THRESHOLDS = {
  first: 100,
  second: 500,
  third: 1000
};

function getNumberParam(params: ParamsMap | undefined, key: string, fallback: number): number {
  if (!params) return fallback;
  const raw = params[key];
  const num = typeof raw === "number" ? raw : Number(String(raw ?? "").replace(",", "."));
  return Number.isFinite(num) ? num : fallback;
}

function selectPrice(
  service: ServiceRow,
  qty: number,
  params: ParamsMap | undefined
): { price: number; label?: TariffLabel } {
  const fixed = service["Фикс. цена"];
  if (typeof fixed === "number" && fixed > 0) {
    return { price: fixed };
  }

  const t1 = getNumberParam(params, "Граница 1 (ед.)", DEFAULT_THRESHOLDS.first);
  const t2 = getNumberParam(params, "Граница 2 (ед.)", DEFAULT_THRESHOLDS.second);
  const t3 = getNumberParam(params, "Граница 3 (ед.)", DEFAULT_THRESHOLDS.third);

  const price1000 = service["от 1000 ед."];
  const price500 = service["от 500 ед."];
  const price100 = service["от 100 ед."];

  if (qty >= t3 && price1000 != null) {
    return { price: price1000, label: "от 1000 ед." };
  }

  if (qty >= t2 && price500 != null) {
    return { price: price500, label: "от 500 ед." };
  }

  if (price100 != null) {
    return { price: price100, label: "от 100 ед." };
  }

  // Fallback to the lowest non-null price
  const fallbackPrice = [price500, price1000].find((value) => value != null) ?? 0;
  return { price: fallbackPrice };
}

export function pickUnitPriceByQty(
  service: ServiceRow,
  qty: number,
  params: ParamsMap
): { unitPrice: number; tariffLabel?: TariffLabel } {
  const selection = selectPrice(service, qty, params);
  return {
    unitPrice: selection.price,
    tariffLabel: selection.label
  };
}

export function calcLineTotal(service: ServiceRow, qty: number, params: ParamsMap): number {
  const { unitPrice } = pickUnitPriceByQty(service, qty, params);
  const fixed = service["Фикс. цена"];
  if (fixed && fixed > 0) {
    return fixed;
  }
  return qty * unitPrice;
}

type Range = {
  min: number;
  max: number | null;
};

function parseRange(range: string): Range {
  const trimmed = range.trim();
  if (!trimmed) {
    return { min: 0, max: null };
  }
  if (trimmed.includes("-")) {
    const [minStr, maxStr] = trimmed.split("-").map((part) => Number(part.trim()));
    return {
      min: Number.isFinite(minStr) ? minStr : 0,
      max: Number.isFinite(maxStr) ? maxStr : null
    };
  }
  if (trimmed.startsWith(">=")) {
    const min = Number(trimmed.replace(">=", "").trim());
    return { min: Number.isFinite(min) ? min : 0, max: null };
  }
  if (trimmed.endsWith("+")) {
    const min = Number(trimmed.replace("+", "").trim());
    return { min: Number.isFinite(min) ? min : 0, max: null };
  }
  const single = Number(trimmed);
  return { min: Number.isFinite(single) ? single : 0, max: Number.isFinite(single) ? single : null };
}

export function matchLogisticsPrice(
  rows: LogisticsRow[],
  input: LogisticsInput
): { pricePerShipment: number; matchedRange?: string } {
  const candidates = rows.filter(
    (row) =>
      row.Маркетплейс === input.marketplace &&
      row.Локация === input.location &&
      row.Тип === input.kind
  );

  for (const row of candidates) {
    const { min, max } = parseRange(row["Диапазон коробов"]);
    if (input.count >= min && (max == null || input.count <= max)) {
      return { pricePerShipment: row["Цена, ₽"], matchedRange: row["Диапазон коробов"] };
    }
  }

  return { pricePerShipment: 0 };
}

export function palletDiscount(count: number, params: ParamsMap): number {
  const discount3 = getNumberParam(params, "Скидка палеты >=3", 0);
  const discount5 = getNumberParam(params, "Скидка палеты >=5", 0);
  if (count >= 5) return discount5;
  if (count >= 3) return discount3;
  return 0;
}

function calcPickupSurcharge(input: LogisticsInput, params: ParamsMap | undefined): number {
  if (typeof input.pickupVolumeCbm !== "number") {
    return 0;
  }
  const included = getNumberParam(params, "Включено куб.м при заборе", 0);
  const extraPrice = getNumberParam(params, "Цена за доп. куб.м", 0);
  const extraVolume = Math.max(0, input.pickupVolumeCbm - included);
  return extraVolume * extraPrice;
}

export function buildQuote(
  services: ServiceRow[],
  cart: CartItem[],
  logisticsRows: LogisticsRow[],
  logisticsInput?: LogisticsInput,
  params: ParamsMap = {}
): Quote {
  const items = cart
    .map((item) => {
      const service = services.find((row) => row.Код === item.code);
      if (!service) return null;
      const { unitPrice, tariffLabel } = pickUnitPriceByQty(service, item.qty, params);
      const lineTotal = calcLineTotal(service, item.qty, params);
      return {
        ...item,
        unit: item.unit ?? service["Ед. изм."],
        unitPrice,
        tariffLabel,
        lineTotal
      };
    })
    .filter((value): value is NonNullable<typeof value> => Boolean(value));

  const servicesTotal = items.reduce((sum, line) => sum + line.lineTotal, 0);

  let logisticsQuote: Quote["logistics"] | undefined;

  if (logisticsInput) {
    const { pricePerShipment, matchedRange } = matchLogisticsPrice(logisticsRows, logisticsInput);
    const discount =
      logisticsInput.kind === "Палет" ? palletDiscount(logisticsInput.count, params) : 0;
    const pickupExtra = calcPickupSurcharge(logisticsInput, params);
    const baseTotal = pricePerShipment * logisticsInput.count;
    const discounted = baseTotal * (1 - discount);
    const total = discounted + pickupExtra;
    logisticsQuote = {
      pricePerShipment,
      discount,
      total,
      matchedRange
    };
  }

  const logisticsTotal = logisticsQuote?.total ?? 0;
  const grandTotal = servicesTotal + logisticsTotal;

  return {
    items,
    logistics: logisticsQuote,
    grandTotal
  };
}
