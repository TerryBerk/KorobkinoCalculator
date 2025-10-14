import { Dialog, Tab, Transition } from "@headlessui/react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  logistics: LogisticsInput[];
};

const tabLabels = ["Услуги", "Логистика", "Итог"] as const;

const defaultLogisticsShipment: LogisticsInput = {
  marketplace: "",
  location: "",
  kind: "Короб",
  count: 0,
  pickupVolumeCbm: 0,
  mode: "auto"
};

function createEmptyShipment(seed?: Partial<LogisticsInput>): LogisticsInput {
  const kind =
    seed?.kind === "Палет" ? "Палет" : seed?.kind === "Короб" ? "Короб" : defaultLogisticsShipment.kind;
  const count = Number.isFinite(seed?.count) ? Number(seed?.count) : defaultLogisticsShipment.count;
  const pickupVolumeCbm = Number.isFinite(seed?.pickupVolumeCbm)
    ? Number(seed?.pickupVolumeCbm)
    : defaultLogisticsShipment.pickupVolumeCbm;
  const mode = seed?.mode === "manual" ? "manual" : "auto";
  const marketplace = seed?.marketplace ?? defaultLogisticsShipment.marketplace;
  const location = seed?.location ?? defaultLogisticsShipment.location;
  const shipment: LogisticsInput = {
    marketplace,
    location,
    kind,
    count,
    pickupVolumeCbm,
    mode
  };
  if (mode === "manual") {
    shipment.customPricePerShipment = Number.isFinite(seed?.customPricePerShipment)
      ? Number(seed?.customPricePerShipment)
      : 0;
  } else if (Number.isFinite(seed?.customPricePerShipment)) {
    shipment.customPricePerShipment = seed?.customPricePerShipment;
  }
  return shipment;
}

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
  if (!search) return { cart: [], logistics: [] };
  const params = new URLSearchParams(search);
  const itemsParam = params.get("items");
  const logistics: LogisticsInput[] = [];
  const shipmentsParam = params.get("shipments");
  if (shipmentsParam) {
    shipmentsParam
      .split(";")
      .map((chunk) => chunk.trim())
      .filter(Boolean)
      .forEach((chunk) => {
        const [
          marketplace = "",
          location = "",
          kind = "Короб",
          countStr = "0",
          volumeStr = "0",
          modeStr,
          priceStr
        ] = chunk.split("|");
        const count = Number(countStr);
        const pickupVolumeCbm = Number(volumeStr);
        const mode = modeStr === "manual" ? "manual" : "auto";
        const customPrice = Number(priceStr);
        logistics.push(
          createEmptyShipment({
            marketplace,
            location,
            kind: kind === "Палет" ? "Палет" : "Короб",
            count: Number.isFinite(count) ? count : 0,
            pickupVolumeCbm: Number.isFinite(pickupVolumeCbm) ? pickupVolumeCbm : 0,
            mode,
            customPricePerShipment:
              mode === "manual" && Number.isFinite(customPrice) ? customPrice : undefined
          })
        );
      });
  }

  if (logistics.length === 0) {
    const marketplace = params.get("marketplace");
    const location = params.get("location");
    const kind = params.get("kind") as LogisticsInput["kind"] | null;
    const count = Number(params.get("count"));
    const volume = Number(params.get("volume"));
    if (marketplace || location || kind || params.has("count")) {
      logistics.push(
        createEmptyShipment({
          marketplace: marketplace ?? "",
          location: location ?? "",
          kind: kind === "Палет" ? "Палет" : "Короб",
          count: Number.isFinite(count) ? count : 0,
          pickupVolumeCbm: Number.isFinite(volume) ? volume : 0
        })
      );
    }
  }

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

function encodeShareUrl(cart: CartItem[], logistics: LogisticsInput[]): string {
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

  const encodedShipments = logistics
    .filter((shipment) => {
      if (!shipment.marketplace || !(shipment.count > 0)) return false;
      const mode = shipment.mode ?? "auto";
      if (mode === "auto") {
        return Boolean(shipment.location);
      }
      return true;
    })
    .map((shipment) => {
      const volume =
        typeof shipment.pickupVolumeCbm === "number" && Number.isFinite(shipment.pickupVolumeCbm)
          ? shipment.pickupVolumeCbm
          : 0;
      const mode = shipment.mode ?? "auto";
      const customPrice =
        mode === "manual" && typeof shipment.customPricePerShipment === "number"
          ? shipment.customPricePerShipment
          : "";
      return [
        shipment.marketplace,
        shipment.location,
        shipment.kind,
        Math.round(shipment.count),
        Number(volume.toFixed(2)),
        mode,
        customPrice !== "" ? Number(Number(customPrice).toFixed(2)) : ""
      ].join("|");
    });

  if (encodedShipments.length > 0) {
    params.set("shipments", encodedShipments.join(";"));
  } else {
    params.delete("shipments");
  }

  // Clean up legacy params
  params.delete("marketplace");
  params.delete("location");
  params.delete("kind");
  params.delete("count");
  params.delete("volume");

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
    if (typeof window === "undefined") return { cart: [], logistics: [] };
    return parseShare(window.location.search);
  }, []);

  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [cacheOnly, setCacheOnly] = useState(false);
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [logisticsRows, setLogisticsRows] = useState<LogisticsRow[]>([]);
  const [params, setParams] = useState<ParamsMap>({});
  const [cart, setCart] = useState<CartItem[]>(() => dedupeCart(shareState.cart));
  const [logisticsInputs, setLogisticsInputs] = useState<LogisticsInput[]>(() => {
    if (shareState.logistics.length > 0) {
      return shareState.logistics.map((shipment) => createEmptyShipment(shipment));
    }
    return [createEmptyShipment()];
  });
  const [copyStatus, setCopyStatus] = useState<"idle" | "success" | "error">("idle");
  const [isResetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [personalDiscountEnabled, setPersonalDiscountEnabled] = useState(false);
  const [personalDiscountPercent, setPersonalDiscountPercent] = useState(0);
  const calculatorRef = useRef<HTMLDivElement | null>(null);
  const [activeTabIndex, setActiveTabIndex] = useState(0);
  const [isMobileView, setIsMobileView] = useState(false);

  const formatCurrency = useCallback(
    (value: number) => formatNumber(value, locale === "en" ? "en-US" : "ru-RU"),
    [locale]
  );

  // Detect mobile view based on screen width
  useEffect(() => {
    if (typeof window === "undefined") return;
    
    const checkMobileView = () => {
      setIsMobileView(window.innerWidth < 640); // 640px is Tailwind's sm breakpoint
    };
    
    checkMobileView();
    window.addEventListener("resize", checkMobileView);
    return () => window.removeEventListener("resize", checkMobileView);
  }, []);

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
        if (import.meta.env?.DEV) {
          console.log("[Korobkino] datasets loaded", {
            services: serviceRows.length,
            logistics: logisticsRowsParsed.length,
            params: Object.keys(paramsMap).length,
            logisticsPreview: logisticsRowsParsed.slice(0, 3)
          });
        }
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

  const quote = useMemo<Quote>(() => {
    if (services.length === 0) {
      return { items: [], grandTotal: 0 };
    }
    return buildQuote(services, cart, logisticsRows, logisticsInputs, params);
  }, [services, cart, logisticsRows, logisticsInputs, params]);

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

  const handlePersonalDiscountToggle = useCallback((enabled: boolean) => {
    setPersonalDiscountEnabled(enabled);
    if (!enabled) {
      setPersonalDiscountPercent(0);
    }
  }, []);

  const handlePersonalDiscountPercentChange = useCallback((percent: number) => {
    if (!Number.isFinite(percent)) {
      setPersonalDiscountPercent(0);
      return;
    }
    const clamped = Math.min(100, Math.max(0, Math.round(percent)));
    setPersonalDiscountPercent(clamped);
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
      quote.logistics.shipments.forEach((shipment, index) => {
        rows.push([
          `LOG-${index + 1}`,
          [
            "Логистика",
            shipment.input.marketplace,
            shipment.input.location,
            shipment.input.kind
          ]
            .filter(Boolean)
            .join(" · "),
          String(shipment.count),
          shipment.discount > 0
            ? `Скидка ${Math.round(shipment.discount * 100)}%${
                shipment.matchedRange ? ` · Диапазон ${shipment.matchedRange}` : ""
              }`
            : shipment.matchedRange
              ? `Диапазон ${shipment.matchedRange}`
              : "-",
          String(shipment.pricePerShipment),
          shipment.input.kind,
          String(shipment.total)
        ]);
      });
      if (quote.logistics.shipments.length > 1) {
        rows.push([
          "LOG",
          "Логистика · Итого",
          String(
            quote.logistics.shipments.reduce((sum, shipment) => sum + shipment.count, 0)
          ),
          "-",
          "-",
          "-",
          String(quote.logistics.total)
        ]);
      }
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
  }, [quote]);

  const shareUrl = useMemo(() => encodeShareUrl(cart, logisticsInputs), [cart, logisticsInputs]);

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

  const handleResetCalculator = useCallback(() => {
    setCart([]);
    setLogisticsInputs([createEmptyShipment()]);
    setPersonalDiscountEnabled(false);
    setPersonalDiscountPercent(0);
    setCopyStatus("idle");
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.search = "";
      url.hash = "";
      window.history.replaceState(null, "", url.toString());
    }
  }, [setCart, setLogisticsInputs, setPersonalDiscountEnabled, setPersonalDiscountPercent]);

  const handleOpenResetConfirm = useCallback(() => {
    setResetConfirmOpen(true);
  }, []);

  const handleCancelReset = useCallback(() => {
    setResetConfirmOpen(false);
  }, []);

  const handleConfirmReset = useCallback(() => {
    handleResetCalculator();
    setResetConfirmOpen(false);
  }, [handleResetCalculator]);

  const handleOpenNewCalculator = useCallback(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.search = "";
    url.hash = "";
    window.open(url.toString(), "_blank", "noopener");
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && shareUrl) {
      window.history.replaceState(null, "", shareUrl);
    }
  }, [shareUrl]);

  const mergedTheme = useMemo(() => mergeTheme(theme), [theme]);

  useEffect(() => {
    setCopyStatus("idle");
  }, [cart, logisticsInputs]);

  useEffect(() => {
    const handleTabSwitch = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      if (isResetConfirmOpen) return;
      const root = calculatorRef.current;
      if (!root) return;
      const target = event.target as HTMLElement | null;
      if (!target || !root.contains(target)) {
        return;
      }
      const tagName = target.tagName;
      if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT" || target.isContentEditable) {
        return;
      }
      event.preventDefault();
      setActiveTabIndex((prev) => {
        const reverse = event.shiftKey || event.altKey;
        if (reverse) {
          return (prev - 1 + tabLabels.length) % tabLabels.length;
        }
        return (prev + 1) % tabLabels.length;
      });
    };

    window.addEventListener("keydown", handleTabSwitch);
    return () => window.removeEventListener("keydown", handleTabSwitch);
  }, [isResetConfirmOpen]);

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

  // Mobile Layout
  if (isMobileView) {
    return (
      <div
        ref={calculatorRef}
        className="fixed inset-0 flex flex-col overflow-hidden"
        style={{
          background: mergedTheme.background,
          color: mergedTheme.text
        }}
      >
        {/* Mobile Header */}
        <header className="shrink-0 border-b border-white/10 bg-[rgba(9,18,31,0.95)] px-4 py-3 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <img src="/icons/favicon.svg" alt="Korobkino" className="h-5 w-5 shrink-0" />
              <h1 className="text-lg font-semibold text-white truncate">
                Korobkino Calculator
              </h1>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleOpenResetConfirm}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-lg font-semibold text-white/70 transition hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                aria-label="Сбросить калькулятор"
              >
                ×
              </button>
              <button
                type="button"
                onClick={handleOpenNewCalculator}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-[#ff7a00]/50 bg-[#ff7a00] text-xl font-semibold text-[#05070c] shadow-[0_12px_35px_rgba(255,122,0,0.35)] transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-[#ff7a00]/50"
                aria-label="Открыть новый калькулятор"
              >
                +
              </button>
            </div>
          </div>
        </header>

        <Tab.Group
          as="div"
          className="flex flex-1 flex-col overflow-hidden"
          selectedIndex={activeTabIndex}
          onChange={setActiveTabIndex}
        >
          {/* Mobile Content */}
          <Tab.Panels className="flex-1 overflow-y-auto px-3 py-4 sm:px-4">
            <Tab.Panel className="h-full">
              <ServicesTab
                services={services}
                cartItems={cart}
                quoteLines={quote.items}
                formatCurrency={formatCurrency}
                onAdd={handleAddService}
                onQtyChange={handleQtyChange}
                onRemove={handleRemove}
                isMobileView={true}
              />
            </Tab.Panel>
            <Tab.Panel className="h-full">
              <LogisticsForm
                rows={logisticsRows}
                value={logisticsInputs}
                onChange={setLogisticsInputs}
                formatCurrency={formatCurrency}
                quote={quote.logistics}
              />
            </Tab.Panel>
            <Tab.Panel className="h-full">
              <Summary
                quote={quote}
                formatCurrency={formatCurrency}
                onExportCsv={handleExportCsv}
                onCopyLink={handleCopyLink}
                copyStatus={copyStatus}
                shareUrl={shareUrl}
                personalDiscountEnabled={personalDiscountEnabled}
                personalDiscountPercent={personalDiscountPercent}
                onPersonalDiscountToggle={handlePersonalDiscountToggle}
                onPersonalDiscountPercentChange={handlePersonalDiscountPercentChange}
              />
            </Tab.Panel>
          </Tab.Panels>

          {/* Mobile Bottom Tabs */}
          <Tab.List className="shrink-0 flex gap-0 border-t border-white/10 bg-[rgba(9,18,31,0.95)] backdrop-blur-xl">
            {tabLabels.map((label) => (
              <Tab
                key={label}
                className={({ selected }) =>
                  `flex-1 px-4 py-4 text-sm font-semibold transition ${
                    selected
                      ? "bg-[#ff7a00] text-[#05070c]"
                      : "text-white/60 hover:text-white hover:bg-white/5"
                  }`
                }
              >
                {label}
              </Tab>
            ))}
          </Tab.List>
        </Tab.Group>

        <Transition show={isResetConfirmOpen} as={Fragment}>
          <Dialog as="div" className="relative z-50" onClose={setResetConfirmOpen}>
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-200"
              enterFrom="opacity-0"
              enterTo="opacity-100"
              leave="ease-in duration-150"
              leaveFrom="opacity-100"
              leaveTo="opacity-0"
            >
              <div className="fixed inset-0 bg-[#050b13]/80 backdrop-blur-sm" />
            </Transition.Child>

            <div className="fixed inset-0 overflow-y-auto">
              <div className="flex min-h-full items-center justify-center p-6">
                <Transition.Child
                  as={Fragment}
                  enter="ease-out duration-200"
                  enterFrom="opacity-0 scale-95 translate-y-4"
                  enterTo="opacity-100 scale-100 translate-y-0"
                  leave="ease-in duration-150"
                  leaveFrom="opacity-100 scale-100 translate-y-0"
                  leaveTo="opacity-0 scale-95 translate-y-4"
                >
                  <Dialog.Panel className="w-full max-w-sm rounded-3xl border border-white/10 bg-[radial-gradient(120%_160%_at_50%_0%,rgba(27,42,63,0.95)_0%,rgba(9,18,31,0.98)_100%)] p-6 shadow-[0_35px_90px_rgba(5,13,24,0.65)]">
                    <Dialog.Title className="text-lg font-semibold text-white">
                      Сбросить калькулятор?
                    </Dialog.Title>
                    <Dialog.Description className="mt-2 text-sm text-white/60">
                      Все выбранные услуги, данные логистики и скидки будут удалены. Действие нельзя отменить.
                    </Dialog.Description>
                    <div className="mt-6 flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={handleCancelReset}
                        className="inline-flex flex-1 items-center justify-center rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white/80 transition hover:bg-white/15 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/20"
                      >
                        Отмена
                      </button>
                      <button
                        type="button"
                        onClick={handleConfirmReset}
                        className="inline-flex flex-1 items-center justify-center rounded-xl border border-[#ff7a00]/60 bg-[#ff7a00] px-4 py-2 text-sm font-semibold text-[#05070c] shadow-[0_12px_35px_rgba(255,122,0,0.35)] transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-[#ff7a00]/50"
                      >
                        Сбросить
                      </button>
                    </div>
                  </Dialog.Panel>
                </Transition.Child>
              </div>
            </div>
          </Dialog>
        </Transition>
      </div>
    );
  }

  // Desktop Layout (Original)
  return (
    <div
      ref={calculatorRef}
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
        <div className="flex items-center gap-3 self-end sm:self-auto">
          {cacheOnly && (
            <span className="rounded-full border border-amber-400/40 bg-amber-400/15 px-3 py-1 text-xs font-medium text-amber-200 shadow-[0_10px_30px_rgba(255,163,67,0.2)]">
              Показаны кешированные данные
            </span>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleOpenResetConfirm}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-lg font-semibold text-white/70 transition hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/30"
              aria-label="Сбросить калькулятор"
            >
              ×
            </button>
            <button
              type="button"
              onClick={handleOpenNewCalculator}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-[#ff7a00]/50 bg-[#ff7a00] text-xl font-semibold text-[#05070c] shadow-[0_12px_35px_rgba(255,122,0,0.35)] transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-[#ff7a00]/50"
              aria-label="Открыть новый калькулятор"
            >
              +
            </button>
          </div>
        </div>
      </header>

      <Tab.Group
        as="div"
        className="mt-8"
        selectedIndex={activeTabIndex}
        onChange={setActiveTabIndex}
      >
        <Tab.List className="flex gap-2 rounded-2xl border border-white/10 bg-white/5 p-2 backdrop-blur">
          {tabLabels.map((label) => (
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
              value={logisticsInputs}
              onChange={setLogisticsInputs}
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
              personalDiscountEnabled={personalDiscountEnabled}
              personalDiscountPercent={personalDiscountPercent}
              onPersonalDiscountToggle={handlePersonalDiscountToggle}
              onPersonalDiscountPercentChange={handlePersonalDiscountPercentChange}
            />
          </Tab.Panel>
        </Tab.Panels>
      </Tab.Group>

      <Transition show={isResetConfirmOpen} as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={setResetConfirmOpen}>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-200"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-150"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-[#050b13]/80 backdrop-blur-sm" />
          </Transition.Child>

          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-6">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-200"
                enterFrom="opacity-0 scale-95 translate-y-4"
                enterTo="opacity-100 scale-100 translate-y-0"
                leave="ease-in duration-150"
                leaveFrom="opacity-100 scale-100 translate-y-0"
                leaveTo="opacity-0 scale-95 translate-y-4"
              >
                <Dialog.Panel className="w-full max-w-sm rounded-3xl border border-white/10 bg-[radial-gradient(120%_160%_at_50%_0%,rgba(27,42,63,0.95)_0%,rgba(9,18,31,0.98)_100%)] p-6 shadow-[0_35px_90px_rgba(5,13,24,0.65)]">
                  <Dialog.Title className="text-lg font-semibold text-white">
                    Сбросить калькулятор?
                  </Dialog.Title>
                  <Dialog.Description className="mt-2 text-sm text-white/60">
                    Все выбранные услуги, данные логистики и скидки будут удалены. Действие нельзя отменить.
                  </Dialog.Description>
                  <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      onClick={handleCancelReset}
                      className="inline-flex flex-1 items-center justify-center rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white/80 transition hover:bg-white/15 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/20 sm:flex-none sm:px-5"
                    >
                      Отмена
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmReset}
                      className="inline-flex flex-1 items-center justify-center rounded-xl border border-[#ff7a00]/60 bg-[#ff7a00] px-4 py-2 text-sm font-semibold text-[#05070c] shadow-[0_12px_35px_rgba(255,122,0,0.35)] transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-[#ff7a00]/50 sm:flex-none sm:px-5"
                    >
                      Сбросить
                    </button>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>
    </div>
  );
}

function quoteCsvCell(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
