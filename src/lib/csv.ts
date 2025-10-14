import type {
  DatasetCacheEntry,
  DatasetCacheKey,
  ParamsMap,
  ServiceRow,
  LogisticsRow
} from "./models";

const CACHE_TTL_MS = 60_000;

const CACHE_PREFIX = "korobkino-calculator-cache::";

const CSV_NEWLINE = /\r?\n/;

type RawRecord = Record<string, string>;

const numberRegex = /^-?\d+(?:[.,]\d+)?$/;

export function parseCsv(text: string): RawRecord[] {
  const lines = text.split(CSV_NEWLINE).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return [];
  }

  const headers = splitCsvLine(lines[0]);
  const data: RawRecord[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.trim()) continue;
    const cells = splitCsvLine(line);
    const record: RawRecord = {};
    headers.forEach((header, index) => {
      record[header] = cells[index] ?? "";
    });
    data.push(record);
  }
  return data;
}

function splitCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
}

function getCacheKey(key: DatasetCacheKey, url: string): string {
  return `${CACHE_PREFIX}${key}::${url}`;
}

function readCache(key: string): DatasetCacheEntry | null {
  if (typeof window === "undefined" || !window.localStorage) {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as DatasetCacheEntry;
  } catch {
    return null;
  }
}

function writeCache(key: string, value: DatasetCacheEntry): void {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota/storage errors – cache is a best-effort optimisation
  }
}

async function fetchCsv(url: string, signal?: AbortSignal): Promise<string> {
  const response = await fetch(url, { cache: "no-store", signal });
  if (!response.ok) {
    throw new Error(`Failed to fetch CSV: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

export type DatasetLoadResult = {
  payload: string;
  isCacheHit: boolean;
  cacheOnly: boolean;
};

export async function loadCsvWithCache(
  key: DatasetCacheKey,
  url: string,
  signal?: AbortSignal
): Promise<DatasetLoadResult> {
  const storageKey = getCacheKey(key, url);
  const cached = readCache(storageKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return { payload: cached.payload, isCacheHit: true, cacheOnly: false };
  }

  try {
    const payload = await fetchCsv(url, signal);
    writeCache(storageKey, { payload, timestamp: Date.now() });
    return { payload, isCacheHit: false, cacheOnly: false };
  } catch (error) {
    if (cached) {
      return { payload: cached.payload, isCacheHit: true, cacheOnly: true };
    }
    throw error;
  }
}

function parseNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!numberRegex.test(trimmed.replace(/\s+/g, ""))) {
    return null;
  }
  const normalised = trimmed.replace(/\s+/g, "").replace(",", ".");
  const num = Number(normalised);
  return Number.isFinite(num) ? num : null;
}

export function toServiceRows(records: RawRecord[]): ServiceRow[] {
  return records
    .filter((row) => row["Код"])
    .map<ServiceRow>((row) => ({
      Код: row["Код"],
      Категория: row["Категория"] ?? "",
      Наименование: row["Наименование"] ?? "",
      "Ед. изм.": row["Ед. изм."] ?? "",
      "от 100 ед.": parseNumber(row["от 100 ед."] ?? "") ?? null,
      "от 500 ед.": parseNumber(row["от 500 ед."] ?? "") ?? null,
      "от 1000 ед.": parseNumber(row["от 1000 ед."] ?? "") ?? null,
      "Фикс. цена": parseNumber(row["Фикс. цена"] ?? "") ?? null,
      Примечание: row["Примечание"] ?? ""
    }));
}

export function toLogisticsRows(records: RawRecord[]): LogisticsRow[] {
  return records
    .filter((row) => row["Маркетплейс"])
    .map<LogisticsRow>((row) => ({
      Маркетплейс: row["Маркетплейс"] ?? "",
      Локация: row["Локация"] ?? "",
      Тип: (row["Тип"] ?? "Короб") as LogisticsRow["Тип"],
      "Диапазон коробов": row["Диапазон коробов"] ?? "",
      "Цена, ₽": parseNumber(row["Цена, ₽"] ?? "") ?? 0
    }));
}

export function toParamsMap(records: RawRecord[]): ParamsMap {
  return records.reduce<ParamsMap>((acc, row) => {
    const key = row[Object.keys(row)[0] ?? ""] ?? "";
    const value =
      row[Object.keys(row)[1] ?? ""] ??
      row["Value"] ??
      row["Значение"] ??
      row["value"] ??
      "";
    if (!key) return acc;
    const numeric = parseNumber(value);
    acc[key] = numeric ?? value;
    return acc;
  }, {});
}
