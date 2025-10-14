import { Tab } from "@headlessui/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LogisticsForm } from "./components/LogisticsForm";
import { ServicesTab } from "./components/ServiceRow";
import { Summary } from "./components/Summary";
import { buildQuote, getMinimumBillableQty } from "./lib/calc";
import {
  type CartItem,
  type LogisticsInput,
  type MountOptions,
  type ParamsMap,
  type Quote,
  type ServiceRow,
  type LogisticsRow,
  type ThemeTokens
} from "./lib/models";
import {
  loadCsvWithCache,
  parseCsv,
  toLogisticsRows,
  toParamsMap,
  toServiceRows
} from "./lib/csv";
import "./styles.css";

type Status = "idle" | "loading" | "success" | "error";

const defaultTheme: ThemeTokens = {
  background: "#050b13",
  surface: "rgba(9, 18, 31, 0.82)",
  border: "rgba(255, 255, 255, 0.08)",
  primary: "#ff7a00",
  primaryText: "#05070c",
  text: "#f5f9ff",
  mutedText: "#8ea2bf",
  accent: "#5de4c7"
};

type ShareState = {
  cart: CartItem[];
  logistics?: Partial<LogisticsInput>;
};

const defaultLogisticsInput: LogisticsInput = {
  marketplace: "",
  location: "",
  kind: "Короб",
  count: 0,
  pickupVolumeCbm: 0
};

function dedupeCart(items: CartItem[]): CartItem[] {
  const map = new Map<string, CartItem>();
  for (const item of items) {
    const existing = map.get(item.code);
    if (existing) {
      map.set(item.code, { ...existing, qty: existing.qty + item.qty });
    } else {
      map.set(item.code, item);
    }
  }
  return Array.from(map.values());
}

function formatNumber(value: number, locale: string) {
  const formatter = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0
  });
  return formatter.format(value);
}

function parseShare(search: string): ShareState {
  if (!search) return { cart: [] };
  const params = new URLSearchParams(search);
  const itemsParam = params.get("items");
  const logistics: Partial<LogisticsInput> = {};
  if (params.has("marketplace")) logistics.marketplace = params.get("marketplace") ?? "";
  if (params.has("location")) logistics.location = params.get("location") ?? "";
  if (params.has("kind")) logistics.kind = params.get("kind") as LogisticsInput["kind"];
  if (params.has("count")) logistics.count = Number(params.get("count")) || 0;
  if (params.has("volume")) logistics.pickupVolumeCbm = Number(params.get("volume")) || 0;

  const cart: CartItem[] =
    itemsParam
      ?.split(";")
      .map((pair) => {
        const [code, qtyStr] = pair.split(":");
        const qty = Number(qtyStr);
        if (!code || !Number.isFinite(qty)) return null;
        return { code, name: code, qty: Math.max(0, qty) };
      })
      .filter((item): item is CartItem => Boolean(item)) ?? [];

  return { cart, logistics };
}

function encodeShareUrl(cart: CartItem[], logistics: LogisticsInput | undefined): string {
  if (typeof window === "undefined") return "";
  const url = new URL(window.location.href);
  const params = url.searchParams;
  if (cart.length > 0) {
    params.set(
      "items",
      cart
        .map((item) => `${item.code}:${Math.max(0, Math.round(item.qty))}`)
        .join(";")
    );
  } else {
    params.delete("items");
  }

  if (logistics && logistics.marketplace && logistics.location && logistics.count > 0) {
    params.set("marketplace", logistics.marketplace);
    params.set("location", logistics.location);
    params.set("kind", logistics.kind);
    params.set("count", String(Math.round(logistics.count)));
    if (typeof logistics.pickupVolumeCbm === "number") {
      params.set("volume", String(Number(logistics.pickupVolumeCbm)));
    } else {
      params.delete("volume");
    }
  } else {
    params.delete("marketplace");
    params.delete("location");
    params.delete("kind");
    params.delete("count");
    params.delete("volume");
  }

  url.search = params.toString();
  return url.toString();
}

function mergeTheme(custom?: Partial<ThemeTokens>): ThemeTokens {
  return { ...defaultTheme, ...custom };
}

export type KorobkinoCalculatorProps = MountOptions;

export function KorobkinoCalculator({
  urls,
  locale = "ru",
  onQuoteChange,
  theme
}: KorobkinoCalculatorProps) {
  const shareState = useMemo(() => {
    if (typeof window === "undefined") return { cart: [] };
    return parseShare(window.location.search);
  }, []);

  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [cacheOnly, setCacheOnly] = useState(false);
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [logisticsRows, setLogisticsRows] = useState<LogisticsRow[]>([]);
  const [params, setParams] = useState<ParamsMap>({});
  const [cart, setCart] = useState<CartItem[]>(() => dedupeCart(shareState.cart));
  const [logisticsInput, setLogisticsInput] = useState<LogisticsInput>(() => ({
    ...defaultLogisticsInput,
    ...shareState.logistics
  }));
  const [copyStatus, setCopyStatus] = useState<"idle" | "success" | "error">("idle");

  const formatCurrency = useCallback(
    (value: number) => formatNumber(value, locale === "en" ? "en-US" : "ru-RU"),
    [locale]
  );

  useEffect(() => {
    let cancelled = false;
    const abort = new AbortController();
    async function load() {
      setStatus("loading");
      setError(null);
      try {
        const [servicesRaw, logisticsRaw, paramsRaw] = await Promise.all([
          loadCsvWithCache("services", urls.servicesCsvUrl, abort.signal),
          loadCsvWithCache("logistics", urls.logisticsCsvUrl, abort.signal),
          loadCsvWithCache("params", urls.paramsCsvUrl, abort.signal)
        ]);

        if (cancelled) return;
        const serviceRows = toServiceRows(parseCsv(servicesRaw.payload));
        const logisticsRowsParsed = toLogisticsRows(parseCsv(logisticsRaw.payload));
        const paramsMap = toParamsMap(parseCsv(paramsRaw.payload));
        setCacheOnly(servicesRaw.cacheOnly || logisticsRaw.cacheOnly || paramsRaw.cacheOnly);
        setServices(serviceRows);
        setLogisticsRows(logisticsRowsParsed);
        setParams(paramsMap);
        setStatus("success");
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        setError(err instanceof Error ? err.message : "Не удалось загрузить данные");
      }
    }
    load();
    return () => {
      cancelled = true;
      abort.abort();
    };
  }, [urls]);

  useEffect(() => {
    if (services.length === 0) return;
    setCart((prev) =>
      prev.map((item) => {
        const service = services.find((row) => row.Код === item.code);
        if (!service) {
          return item;
        }
        const minQty = getMinimumBillableQty(service, params);
        const clampedQty = Math.max(minQty, Math.floor(item.qty));
        if (
          item.name === service.Наименование &&
          item.unit === service["Ед. изм."] &&
          item.qty === clampedQty
        ) {
          return item;
        }
        return {
          ...item,
          name: service.Наименование,
          unit: service["Ед. изм."],
          qty: clampedQty
        };
      })
    );
  }, [services, params]);

  const activeLogisticsInput = useMemo(() => {
    if (!logisticsInput.marketplace || !logisticsInput.location || logisticsInput.count <= 0) {
      return undefined;
    }
    return logisticsInput;
  }, [logisticsInput]);

  const quote = useMemo<Quote>(() => {
    if (services.length === 0) {
      return { items: [], grandTotal: 0 };
    }
    return buildQuote(services, cart, logisticsRows, activeLogisticsInput, params);
  }, [services, cart, logisticsRows, activeLogisticsInput, params]);

  useEffect(() => {
    if (quote && onQuoteChange) {
      onQuoteChange(quote);
    }
  }, [quote, onQuoteChange]);

  const handleAddService = useCallback(
    (service: ServiceRow) => {
      setCart((prev) => {
        if (prev.some((item) => item.code === service.Код)) {
          return prev;
        }
        const minQty = getMinimumBillableQty(service, params);
        return [
          ...prev,
          {
            code: service.Код,
            name: service.Наименование,
            qty: Math.max(1, minQty),
            unit: service["Ед. изм."]
          }
        ];
      });
    },
    [setCart, params]
  );

  const handleQtyChange = useCallback(
    (code: string, qty: number | undefined) => {
      setCart((prev) =>
        prev.map((item) => {
          if (item.code !== code) {
            return item;
          }
          const service = services.find((row) => row.Код === code);
          if (!service) {
            const parsedFallback =
              typeof qty === "number" && Number.isFinite(qty) ? Math.max(0, Math.floor(qty)) : 0;
            return { ...item, qty: parsedFallback };
          }
          const minQty = getMinimumBillableQty(service, params);
          const baseMin = Math.max(1, minQty);
          const parsed =
            typeof qty === "number" && Number.isFinite(qty) ? Math.floor(qty) : baseMin;
          const nextQty = Math.max(baseMin, parsed);
          if (nextQty === item.qty) {
            return item;
          }
          return { ...item, qty: nextQty };
        })
      );
    },
    [services, params]
  );

  const handleRemove = useCallback((code: string) => {
    setCart((prev) => prev.filter((item) => item.code !== code));
  }, []);

  const handleExportCsv = useCallback(() => {
    if (quote.items.length === 0) return;
    const header = [
      "Код",
      "Наименование",
      "Количество",
      "Тариф",
      "Цена за единицу",
      "Ед.",
      "Сумма"
    ];
    const rows = quote.items.map((line) => [
      line.code,
      line.name,
      String(line.qty),
      line.tariffLabel ?? "Фикс",
      String(line.unitPrice),
      line.unit ?? "",
      String(line.lineTotal)
    ]);
    if (quote.logistics) {
      rows.push([
        "LOG",
        "Логистика",
        String(logisticsInput.count),
        quote.logistics.discount > 0 ? `Скидка ${Math.round(quote.logistics.discount * 100)}%` : "-",
        String(quote.logistics.pricePerShipment),
        logisticsInput.kind,
        String(quote.logistics.total)
      ]);
    }
    const csv = [header, ...rows]
      .map((line) => line.map(quoteCsvCell).join(","))
      .join("\r\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" });
    const filename = `korobkino-quote-${new Date().toISOString().slice(0, 10)}.csv`;
    if (typeof window !== "undefined") {
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(link.href), 2000);
    }
  }, [quote, logisticsInput]);

  const shareUrl = useMemo(() => encodeShareUrl(cart, activeLogisticsInput), [cart, activeLogisticsInput]);

  const handleCopyLink = useCallback(async () => {
    if (!shareUrl) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = shareUrl;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "absolute";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopyStatus("success");
      setTimeout(() => setCopyStatus("idle"), 2000);
    } catch (err) {
      console.error(err);
      setCopyStatus("error");
      setTimeout(() => setCopyStatus("idle"), 2000);
    }
  }, [shareUrl]);

  useEffect(() => {
    if (typeof window !== "undefined" && shareUrl) {
      window.history.replaceState(null, "", shareUrl);
    }
  }, [shareUrl]);

  const mergedTheme = useMemo(() => mergeTheme(theme), [theme]);

  useEffect(() => {
    setCopyStatus("idle");
  }, [cart, logisticsInput]);

  if (status === "loading" && services.length === 0) {
    return (
      <div
        className="w-full animate-pulse rounded-2xl border border-slate-800 bg-slate-900/80 p-6"
        style={{
          backgroundColor: mergedTheme.surface,
          color: mergedTheme.text,
          borderColor: mergedTheme.border
        }}
      >
        Загрузка калькулятора...
      </div>
    );
  }

  if (status === "error") {
    return (
      <div
        className="w-full rounded-2xl border border-rose-600/60 bg-rose-500/10 p-6 text-rose-200"
        style={{
          backgroundColor: mergedTheme.surface,
          borderColor: mergedTheme.border
        }}
      >
        <p className="font-semibold">Ошибка загрузки данных</p>
        <p className="mt-2 text-sm opacity-80">{error}</p>
      </div>
    );
  }

  return (
    <div
      className="w-full rounded-[28px] border px-6 py-7 shadow-[0_40px_120px_rgba(5,13,24,0.55)] backdrop-blur-xl sm:px-10 sm:py-10"
      style={{
        background: `linear-gradient(155deg, rgba(13,24,41,0.92) 0%, rgba(8,16,27,0.88) 52%, rgba(5,11,19,0.92) 100%)`,
        color: mergedTheme.text,
        borderColor: mergedTheme.border,
        boxShadow: "0 60px 120px rgba(3, 8, 16, 0.45)"
      }}
    >
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.25em] text-white/70">
            <img
              src="/icons/favicon.svg"
              alt="Korobkino"
              className="h-4 w-4"
            />
            Korobkino
          </span>
          <h1 className="text-2xl font-semibold text-white sm:text-3xl">
            Korobkino Calculator
          </h1>
          <p className="text-sm text-white/60">
            Детерминированный расчёт сметы по прайс-листу и логистике.
          </p>
        </div>
        {cacheOnly && (
          <span className="rounded-full border border-amber-400/40 bg-amber-400/15 px-3 py-1 text-xs font-medium text-amber-200 shadow-[0_10px_30px_rgba(255,163,67,0.2)]">
            Показаны кешированные данные
          </span>
        )}
      </header>

      <Tab.Group as="div" className="mt-8">
        <Tab.List className="flex gap-2 rounded-2xl border border-white/10 bg-white/5 p-2 backdrop-blur">
          {["Услуги", "Логистика", "Итог"].map((label) => (
            <Tab
              key={label}
              className={({ selected }) =>
                `flex-1 rounded-xl px-4 py-2 text-sm font-semibold transition ${
                  selected
                    ? "bg-[#ff7a00] text-[#05070c] shadow-[0_12px_35px_rgba(255,122,0,0.35)]"
                    : "text-white/60 hover:text-white"
                }`
              }
            >
              {label}
            </Tab>
          ))}
        </Tab.List>

        <Tab.Panels className="mt-8 space-y-6">
          <Tab.Panel>
            <ServicesTab
              services={services}
              cartItems={cart}
              quoteLines={quote.items}
              formatCurrency={formatCurrency}
              onAdd={handleAddService}
              onQtyChange={handleQtyChange}
              onRemove={handleRemove}
            />
          </Tab.Panel>
          <Tab.Panel>
            <LogisticsForm
              rows={logisticsRows}
              value={logisticsInput}
              onChange={setLogisticsInput}
              formatCurrency={formatCurrency}
              quote={quote.logistics}
            />
          </Tab.Panel>
          <Tab.Panel>
            <Summary
              quote={quote}
              formatCurrency={formatCurrency}
              onExportCsv={handleExportCsv}
              onCopyLink={handleCopyLink}
              copyStatus={copyStatus}
              shareUrl={shareUrl}
              shipmentsCount={activeLogisticsInput?.count ?? 0}
            />
          </Tab.Panel>
        </Tab.Panels>
      </Tab.Group>
    </div>
  );
}

function quoteCsvCell(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
