import { Combobox } from "@headlessui/react";
import { useMemo, useState } from "react";
import type { CartItem, QuoteLine, ServiceRow } from "../lib/models";

type ServicesTabProps = {
  services: ServiceRow[];
  cartItems: CartItem[];
  quoteLines: QuoteLine[];
  formatCurrency: (value: number) => string;
  onAdd: (service: ServiceRow) => void;
  onQtyChange: (code: string, qty: number) => void;
  onRemove: (code: string) => void;
};

type Option = {
  id: string;
  label: string;
  service: ServiceRow;
};

const columns = [
  "Код",
  "Наименование",
  "Кол-во",
  "Тариф",
  "Цена",
  "Ед.",
  "Сумма",
  ""
] as const;

export function ServicesTab({ services, cartItems, quoteLines, formatCurrency, onAdd, onQtyChange, onRemove }: ServicesTabProps) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Option | null>(null);

  const options = useMemo<Option[]>(() => {
    return services.map((service) => ({
      id: service.Код,
      label: `${service.Код} — ${service.Наименование}`,
      service
    }));
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

  return (
    <div className="space-y-4">
      <div>
        <Combobox value={selected} onChange={handleAdd}>
          <div className="relative">
            <Combobox.Input
              className="w-full rounded-lg border border-slate-600 bg-slate-900/50 px-4 py-2 text-sm text-white placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              displayValue={(option: Option | null) => option?.label ?? ""}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Найти услугу по коду или названию..."
            />
            {filtered.length > 0 && (
              <Combobox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-slate-700 bg-slate-900/95 py-1 text-sm shadow-xl">
                {filtered.map((option) => (
                  <Combobox.Option
                    key={option.id}
                    value={option}
                    className={({ active }) =>
                      `cursor-pointer px-3 py-2 ${
                        active ? "bg-emerald-500/20 text-white" : "text-slate-200"
                      }`
                    }
                  >
                    <span className="font-medium text-emerald-300">{option.service.Код}</span>
                    <span className="ml-2 text-slate-300">{option.service.Наименование}</span>
                  </Combobox.Option>
                ))}
              </Combobox.Options>
            )}
          </div>
        </Combobox>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-700 bg-slate-900/70">
        <table className="min-w-full divide-y divide-slate-700">
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column}
                  scope="col"
                  className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {quoteLines.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-6 py-10 text-center text-sm text-slate-400">
                  Добавьте услуги, чтобы рассчитать смету
                </td>
              </tr>
            )}
            {quoteLines.map((line) => (
              <tr key={line.code} className="text-sm text-slate-200">
                <td className="whitespace-nowrap px-3 py-3 font-medium text-emerald-300">
                  {line.code}
                </td>
                <td className="px-3 py-3">
                  <div className="font-medium text-slate-100">{line.name}</div>
                  {line.tariffLabel && (
                    <p className="text-xs text-slate-400">{line.tariffLabel}</p>
                  )}
                </td>
                <td className="px-3 py-3">
                  <input
                    type="number"
                    min={0}
                    className="w-24 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-right text-slate-100 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                    value={cartItems.find((item) => item.code === line.code)?.qty ?? line.qty}
                    onChange={(event) => onQtyChange(line.code, Number(event.target.value) || 0)}
                  />
                </td>
                <td className="px-3 py-3 text-slate-300">{line.tariffLabel ?? "Фикс"}</td>
                <td className="px-3 py-3 font-mono text-right text-slate-100">
                  {formatCurrency(line.unitPrice)}
                </td>
                <td className="px-3 py-3 text-slate-300">{line.unit ?? "ед."}</td>
                <td className="px-3 py-3 font-mono text-right font-semibold text-white">
                  {formatCurrency(line.lineTotal)}
                </td>
                <td className="px-3 py-3 text-right">
                  <button
                    type="button"
                    className="rounded-md border border-transparent px-2 py-1 text-xs font-semibold text-rose-400 hover:bg-rose-500/10 focus:outline-none focus:ring-2 focus:ring-rose-500/40"
                    onClick={() => onRemove(line.code)}
                  >
                    Удалить
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
