import { Combobox } from "@headlessui/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CartItem, QuoteLine, ServiceRow } from "../lib/models";

type ServicesTabProps = {
  services: ServiceRow[];
  cartItems: CartItem[];
  quoteLines: QuoteLine[];
  formatCurrency: (value: number) => string;
  onAdd: (service: ServiceRow) => void;
  onQtyChange: (code: string, qty: number) => void;
  onRemove: (code: string) => void;
  isMobileView?: boolean;
  shouldFocusSearch?: boolean;
};

type Option = {
  id: string;
  label: string;
  service: ServiceRow;
  tariffType: string;
};

type SortColumn = "code" | "total";

type SortState = {
  column: SortColumn | null;
  direction: "asc" | "desc" | null;
};

const getTariffType = (service: ServiceRow): string => {
  const fixedPrice = service["Фикс. цена"];
  if (fixedPrice != null) {
    return fixedPrice === 0 ? "Бесплатно" : "Фикс";
  }
  if (service["от 100 ед."] != null) return "до 100";
  if (service["от 500 ед."] != null) return "100-499";
  if (service["от 1000 ед."] != null) return "500+";
  return "—";
};

const columns = [
  "Код",
  "Наименование",
  "Кол-во",
  "Ед.",
  "Тариф",
  "Цена",
  "Сумма",
  "Примечание",
  ""
] as const;

export function ServicesTab({ services, cartItems, quoteLines, formatCurrency, onAdd, onQtyChange, onRemove, isMobileView = false, shouldFocusSearch = false }: ServicesTabProps) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Option | null>(null);
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [sortState, setSortState] = useState<SortState>({ column: null, direction: null });

  // Auto-focus search input on desktop when shouldFocusSearch is true
  useEffect(() => {
    if (shouldFocusSearch && !isMobileView && searchInputRef.current) {
      // Small delay to ensure the component is fully rendered
      const timeoutId = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
      
      return () => clearTimeout(timeoutId);
    }
  }, [shouldFocusSearch, isMobileView]);

  const servicesTotal = useMemo(
    () => quoteLines.reduce((sum, line) => sum + line.lineTotal, 0),
    [quoteLines]
  );

  const codeCollator = useMemo(
    () => new Intl.Collator("ru", { numeric: true, sensitivity: "base" }),
    []
  );

  const options = useMemo<Option[]>(() => {
    return services.map((service) => {
      const tariffType = getTariffType(service);
      return {
        id: service.Код,
        label: `${service.Код} — ${service.Наименование}`,
        service,
        tariffType
      };
    });
  }, [services]);

  const filtered =
    query === ""
      ? options
      : options.filter((option) => {
          const value = query.toLowerCase();
          return option.label.toLowerCase().includes(value);
        });

  const handleAdd = (option: Option | null) => {
    if (!option) return;
    setSelected(null);
    setQuery("");
    const isAlreadyInCart = cartItems.some((item) => item.code === option.service.Код);
    if (!isAlreadyInCart) {
      onAdd(option.service);
    }
  };

  const handleSort = (column: SortColumn) => {
    setSortState((prev) => {
      if (prev.column !== column) {
        return { column, direction: "asc" };
      }
      if (prev.direction === "asc") {
        return { column, direction: "desc" };
      }
      return { column: null, direction: null };
    });
  };

  const displayLines = useMemo(() => {
    if (!sortState.column || !sortState.direction) {
      return quoteLines;
    }

    const sorted = [...quoteLines];
    const modifier = sortState.direction === "asc" ? 1 : -1;

    if (sortState.column === "code") {
      sorted.sort((a, b) => modifier * codeCollator.compare(a.code, b.code));
    } else {
      sorted.sort((a, b) => modifier * (a.lineTotal - b.lineTotal));
    }

    return sorted;
  }, [codeCollator, quoteLines, sortState]);

  const renderSortIndicator = (column: SortColumn) => {
    if (sortState.column !== column || !sortState.direction) {
      return " ";
    }
    return sortState.direction === "asc" ? "^" : "v";
  };

  return (
    <div className="space-y-4">
      <div>
        <Combobox value={selected} onChange={handleAdd} nullable>
          {({ open }) => (
            <div className="relative">
              <Combobox.Input
                ref={searchInputRef}
                className="w-full rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2 text-sm text-white placeholder-white/40 backdrop-blur focus:border-[#ff7a00]/60 focus:outline-none focus:ring-2 focus:ring-[#ff7a00]/40"
                displayValue={(option: Option | null) => option?.label ?? ""}
                onChange={(event) => setQuery(event.target.value)}
                onFocus={() => {
                  if (!open) toggleRef.current?.click();
                }}
                onClick={() => {
                  if (!open) toggleRef.current?.click();
                }}
                placeholder="Найти услугу по коду или названию..."
              />
              <Combobox.Button
                className="absolute inset-y-0 right-3 flex items-center text-white/50 transition hover:text-white/70"
                ref={toggleRef}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 011.08 1.04l-4.25 4.25a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
                    clipRule="evenodd"
                  />
                </svg>
              </Combobox.Button>
              {open && (
                <Combobox.Options className="absolute z-20 mt-2 max-h-80 w-full overflow-auto rounded-2xl border border-white/10 bg-[#08111e]/95 py-2 text-sm shadow-[0_24px_60px_rgba(2,8,16,0.65)] backdrop-blur">
                  {filtered.length === 0 ? (
                    <div className="px-4 py-6 text-center text-sm text-white/50">
                      Ничего не найдено
                    </div>
                  ) : (
                    filtered.map((option) => (
                      <Combobox.Option
                        key={option.id}
                        value={option}
                        className={({ active }) =>
                          `cursor-pointer px-3 py-2 transition ${
                            active
                              ? "bg-[#ff7a00]/20 text-white"
                              : "text-white/80 hover:bg-white/5"
                          }`
                        }
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="shrink-0 font-semibold text-[#ff9a33]">
                              {option.service.Код}
                            </span>
                            <span className="truncate text-white/80">{option.service.Наименование}</span>
                          </div>
                          {option.tariffType !== "—" && (
                            <span className="shrink-0 rounded-full border border-white/10 bg-white/10 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-white/60">
                              {option.tariffType}
                            </span>
                          )}
                        </div>
                      </Combobox.Option>
                    ))
                  )}
                </Combobox.Options>
              )}
            </div>
          )}
        </Combobox>
      </div>

      {/* Mobile Card Layout */}
      {isMobileView && (
        <div className="space-y-3 pb-8">
          {quoteLines.length === 0 && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-6 py-10 text-center text-sm text-white/40">
              Добавьте услуги, чтобы рассчитать смету
            </div>
          )}
          {displayLines.map((line) => (
            <div
              key={line.code}
              className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 shadow-inner shadow-white/5"
            >
              {/* Code and Name */}
              <div className="mb-3 flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-[#ff9a33]">{line.code}</div>
                  <div className="mt-1 text-sm font-medium text-white">{line.name}</div>
                  {line.tariffLabel && (
                    <p className="mt-1 text-xs text-white/50">{line.tariffLabel}</p>
                  )}
                </div>
                <button
                  type="button"
                  className="shrink-0 rounded-lg border border-transparent px-3 py-1.5 text-xs font-semibold text-rose-300 transition hover:bg-rose-500/20 focus:outline-none focus:ring-2 focus:ring-rose-400/40"
                  onClick={() => onRemove(line.code)}
                >
                  Удалить
                </button>
              </div>

              {/* Details Grid */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-xs text-white/50 mb-1">Количество</div>
                  <input
                    type="number"
                    className="w-full appearance-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-right text-white focus:border-[#ff7a00]/50 focus:outline-none focus:ring-2 focus:ring-[#ff7a00]/30"
                    step={1}
                    min={line.minQty ?? 1}
                    value={cartItems.find((item) => item.code === line.code)?.qty ?? line.qty}
                    onChange={(event) => onQtyChange(line.code, Number(event.target.value))}
                  />
                </div>
                <div>
                  <div className="text-xs text-white/50 mb-1">Единица</div>
                  <div className="bg-white/5 px-3 py-2 text-right text-white/70">
                    {line.unit ?? "ед."}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-white/50 mb-1">Цена за ед.</div>
                  <div className="bg-white/5 px-3 py-2 font-mono text-right text-white">
                    {formatCurrency(line.unitPrice)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-white/50 mb-1">Сумма</div>
                  <div className="bg-[#ff7a00]/10 px-3 py-2 font-mono text-right font-semibold text-white">
                    {formatCurrency(line.lineTotal)}
                  </div>
                </div>
              </div>

              {/* Note */}
              {line.note?.trim() && (
                <div className="mt-3 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white/60">
                  {line.note}
                </div>
              )}
            </div>
          ))}

          {/* Mobile Total */}
          {quoteLines.length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold uppercase tracking-wide text-white/60">
                  Итого за услуги
                </div>
                <div className="font-mono text-lg font-semibold text-white">
                  {formatCurrency(servicesTotal)}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Desktop Table Layout */}
      {!isMobileView && (
        <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.04] shadow-inner shadow-white/5 mb-5">
          <table className="min-w-full divide-y divide-white/8">
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column}
                  scope="col"
                  className={`px-3 py-3 text-xs font-semibold uppercase tracking-wide text-white/50 ${
                    column === "Сумма" ? "text-right" : "text-left"
                  }`}
                >
                  {column === "Код" || column === "Сумма" ? (
                    <button
                      type="button"
                      onClick={() => handleSort(column === "Код" ? "code" : "total")}
                      className={`inline-flex items-center gap-1 transition ${
                        sortState.column === (column === "Код" ? "code" : "total")
                          ? "text-white"
                          : "text-white/60 hover:text-white"
                      }`}
                    >
                      <span>{column}</span>
                      <span className="inline-block w-3 text-[10px] leading-none text-white/40 text-center">
                        {renderSortIndicator(column === "Код" ? "code" : "total")}
                      </span>
                    </button>
                  ) : (
                    column
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {quoteLines.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-6 py-10 text-center text-sm text-white/40">
                  Добавьте услуги, чтобы рассчитать смету
                </td>
              </tr>
            )}
            {displayLines.map((line) => (
              <tr key={line.code} className="text-sm text-white/80 hover:bg-white/5">
                <td className="whitespace-nowrap px-3 py-3 font-semibold text-[#ff9a33]">
                  {line.code}
                </td>
                <td className="px-3 py-3">
                  <div className="font-medium text-white">{line.name}</div>
                  {line.tariffLabel && (
                    <p className="text-xs text-white/50">{line.tariffLabel}</p>
                  )}
                </td>
                <td className="px-3 py-3">
                  <input
                    type="number"
                    className="w-24 appearance-none rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-right text-white focus:border-[#ff7a00]/50 focus:outline-none focus:ring-2 focus:ring-[#ff7a00]/30"
                    step={1}
                    min={line.minQty ?? 1}
                    title={line.minQty && line.minQty > 1 ? `Минимум ${line.minQty}` : undefined}
                    value={cartItems.find((item) => item.code === line.code)?.qty ?? line.qty}
                    onChange={(event) => onQtyChange(line.code, Number(event.target.value))}
                  />
                </td>
                <td className="px-3 py-3 text-white/70">{line.unit ?? "ед."}</td>
                <td className="px-3 py-3 text-white/70">{line.tariffLabel ?? "Фикс"}</td>
                <td className="px-3 py-3 font-mono text-right text-white">
                  {formatCurrency(line.unitPrice)}
                </td>
                <td className="px-3 py-3 font-mono text-right font-semibold text-white">
                  {formatCurrency(line.lineTotal)}
                </td>
                <td className="px-3 py-3 text-xs text-white/60">
                  {line.note?.trim() ? line.note : "—"}
                </td>
                <td className="px-3 py-3 text-right">
                  <button
                    type="button"
                    className="rounded-lg border border-transparent px-3 py-1 text-xs font-semibold text-rose-300 transition hover:bg-rose-500/20 focus:outline-none focus:ring-2 focus:ring-rose-400/40"
                    onClick={() => onRemove(line.code)}
                  >
                    Удалить
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          {quoteLines.length > 0 && (
            <tfoot>
              <tr className="border-t border-white/10 bg-white/[0.03] text-sm">
                <td
                  colSpan={6}
                  className="px-3 py-4 text-right text-xs font-semibold uppercase tracking-wide text-white/60 sm:text-sm"
                >
                  Итого за услуги
                </td>
                <td className="px-3 py-4 font-mono text-right text-base font-semibold text-white sm:text-lg">
                  {formatCurrency(servicesTotal)}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      )}
    </div>
  );
}
