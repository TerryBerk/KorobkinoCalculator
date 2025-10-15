import { useEffect, useMemo, useRef } from "react";
import type { LogisticsInput, LogisticsQuote, LogisticsRow } from "../lib/models";

type LogisticsFormProps = {
  rows: LogisticsRow[];
  value: LogisticsInput[];
  onChange: (value: LogisticsInput[]) => void;
  formatCurrency: (value: number) => string;
  quote?: LogisticsQuote;
};

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b, "ru"));
}

const kinds: LogisticsInput["kind"][] = ["Короб", "Палет"];
const emptyShipment: LogisticsInput = {
  marketplace: "",
  location: "",
  kind: "Короб",
  count: 0,
  pickupVolumeCbm: 0,
  mode: "auto"
};

function createShipment(seed?: Partial<LogisticsInput>): LogisticsInput {
  const kind =
    seed?.kind === "Палет" ? "Палет" : seed?.kind === "Короб" ? "Короб" : emptyShipment.kind;
  const count = Number.isFinite(seed?.count) ? Number(seed?.count) : emptyShipment.count;
  const pickupVolumeCbm = Number.isFinite(seed?.pickupVolumeCbm)
    ? Number(seed?.pickupVolumeCbm)
    : emptyShipment.pickupVolumeCbm;
  const mode = seed?.mode === "manual" ? "manual" : "auto";
  const marketplace =
    seed?.marketplace ?? (mode === "manual" ? "Дополнительно" : emptyShipment.marketplace);
  const location = seed?.location ?? emptyShipment.location;

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

export function LogisticsForm({ rows, value, onChange, quote, formatCurrency }: LogisticsFormProps) {
  const shipments = value.length > 0 ? value : [createShipment()];
  const shipmentRefs = useRef<(HTMLDivElement | null)[]>([]);
  const prevShipmentsLength = useRef(shipments.length);

  const marketplaces = useMemo(() => unique(rows.map((row) => row.Маркетплейс)), [rows]);

  // Auto-scroll to newly added shipment
  useEffect(() => {
    if (shipments.length > prevShipmentsLength.current) {
      const lastIndex = shipments.length - 1;
      const lastShipmentEl = shipmentRefs.current[lastIndex];
      if (lastShipmentEl) {
        setTimeout(() => {
          lastShipmentEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
      }
    }
    prevShipmentsLength.current = shipments.length;
  }, [shipments.length]);

  const handleShipmentFieldChange = <Key extends keyof LogisticsInput>(
    index: number,
    field: Key,
    fieldValue: LogisticsInput[Key]
  ) => {
    const next = shipments.map((shipment, idx) =>
      idx === index
        ? {
            ...shipment,
            [field]: fieldValue
          }
        : shipment
    );
    onChange(next);
  };

  const handleAddShipment = () => {
    onChange([...shipments, createShipment()]);
  };

  const handleAddManualShipment = () => {
    onChange([
      ...shipments,
      createShipment({
        mode: "manual",
        marketplace: "Дополнительно",
        location: "",
        customPricePerShipment: 0
      })
    ]);
  };

  const handleRemoveShipment = (index: number) => {
    if (shipments.length <= 1) {
      onChange([createShipment()]);
      return;
    }
    onChange(shipments.filter((_, idx) => idx !== index));
  };

  const overallTotal = quote?.total ?? 0;
  const totalCount = quote?.shipments.reduce((sum, shipment) => sum + shipment.count, 0) ?? 0;

  return (
    <div className="space-y-6 pb-8">
      {shipments.map((shipment, index) => {
        const mode = shipment.mode ?? "auto";
        const isManual = mode === "manual";
        const locations = unique(
          isManual
            ? []
            : rows
            .filter((row) => !shipment.marketplace || row.Маркетплейс === shipment.marketplace)
            .map((row) => row.Локация)
        );

        const kindOptions = unique(
          isManual
            ? []
            : rows
            .filter((row) => {
              if (shipment.marketplace && row.Маркетплейс !== shipment.marketplace) return false;
              if (shipment.location && row.Локация !== shipment.location) return false;
              return true;
            })
            .map((row) => row.Тип)
        ).filter((option): option is LogisticsInput["kind"] =>
          kinds.includes(option as LogisticsInput["kind"])
        );
        const displayKindOptions =
          kindOptions.length > 0 && !isManual ? kindOptions : kinds;

        const shipmentQuote = quote?.shipments.find((item) => item.inputIndex === index);
        const count = Number.isFinite(shipment.count) ? Math.max(0, shipment.count) : 0;
        const pricePerShipment =
          shipmentQuote?.pricePerShipment ??
          (Number.isFinite(shipment.customPricePerShipment)
            ? Number(shipment.customPricePerShipment)
            : 0);
        const hasSelection =
          count > 0 &&
          (isManual
            ? Number.isFinite(pricePerShipment)
            : Boolean(shipment.marketplace && shipment.location));
        const totalForShipment = shipmentQuote?.total ?? 0;
        const pickupExtra = shipmentQuote?.pickupSurcharge ?? 0;
        const discountPercent =
          !isManual && shipmentQuote && shipmentQuote.discount > 0
            ? Math.round(shipmentQuote.discount * 100)
            : 0;
        const baseTotal = shipmentQuote?.baseTotal ?? pricePerShipment * count;
        const discountedTotal = shipmentQuote?.discountedTotal ?? baseTotal;

        return (
          <div
            key={`shipment-${index}`}
            ref={(el) => (shipmentRefs.current[index] = el)}
            className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.04] p-3 shadow-inner shadow-white/5 sm:space-y-5 sm:p-5"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-white/60">
                  Отправка #{index + 1}
                </h3>
                <p className="text-xs text-white/40">Заполните параметры ниже</p>
              </div>
              {shipments.length > 1 && (
                <button
                  type="button"
                  onClick={() => handleRemoveShipment(index)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-lg font-semibold text-white/70 transition hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                  aria-label={`Удалить отправку ${index + 1}`}
                >
                  ×
                </button>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
              <label className="flex flex-col gap-2 text-sm text-white/70">
                <span className="font-medium text-white/80">Маркетплейс</span>
                {isManual ? (
                  <div className="flex h-10 items-center rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white/70">
                    {shipment.marketplace || "Дополнительно"}
                  </div>
                ) : (
                  <select
                    className="truncate rounded-xl border border-white/10 bg-white/5 px-2 py-2 text-sm text-white focus:border-[#ff7a00]/60 focus:outline-none focus:ring-2 focus:ring-[#ff7a00]/40 sm:px-3"
                    value={shipment.marketplace}
                    onChange={(event) =>
                      handleShipmentFieldChange(index, "marketplace", event.target.value)
                    }
                  >
                    <option value="">Выберите...</option>
                    {marketplaces.map((marketplace) => (
                      <option key={marketplace} value={marketplace}>
                        {marketplace}
                      </option>
                    ))}
                  </select>
                )}
              </label>

              <label className="flex flex-col gap-2 text-sm text-white/70">
                <span className="font-medium text-white/80">Локация</span>
                {isManual ? (
                  <input
                    type="text"
                    placeholder="..."
                    className="rounded-xl border border-white/10 bg-white/5 px-2 py-2 text-sm text-white placeholder:text-white/30 focus:border-[#ff7a00]/60 focus:outline-none focus:ring-2 focus:ring-[#ff7a00]/40 sm:px-3"
                    value={shipment.location}
                    onChange={(event) =>
                      handleShipmentFieldChange(index, "location", event.target.value)
                    }
                  />
                ) : (
                  <select
                    className="truncate rounded-xl border border-white/10 bg-white/5 px-2 py-2 text-sm text-white focus:border-[#ff7a00]/60 focus:outline-none focus:ring-2 focus:ring-[#ff7a00]/40 sm:px-3"
                    value={shipment.location}
                    onChange={(event) =>
                      handleShipmentFieldChange(index, "location", event.target.value)
                    }
                    disabled={!shipment.marketplace}
                  >
                    <option value="">Выберите...</option>
                    {locations.map((location) => (
                      <option key={location} value={location}>
                        {location}
                      </option>
                    ))}
                  </select>
                )}
              </label>

              <label className="flex flex-col gap-2 text-sm text-white/70">
                <span className="font-medium text-white/80">Тип отправки</span>
                <select
                  className="truncate rounded-xl border border-white/10 bg-white/5 px-2 py-2 text-sm text-white focus:border-[#ff7a00]/60 focus:outline-none focus:ring-2 focus:ring-[#ff7a00]/40 sm:px-3"
                  value={shipment.kind}
                  onChange={(event) =>
                    handleShipmentFieldChange(index, "kind", event.target.value as LogisticsInput["kind"])
                  }
                  disabled={!shipment.location}
                >
                  {displayKindOptions.map((kind) => (
                    <option key={kind} value={kind}>
                      {kind}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-2 text-sm text-white/70">
                <span className="font-medium text-white/80">
                  {shipment.kind === "Палет" ? "Количество палет" : "Количество коробов"}
                </span>
                <input
                  type="number"
                  min={0}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-2 py-2 text-right text-sm text-white focus:border-[#ff7a00]/60 focus:outline-none focus:ring-2 focus:ring-[#ff7a00]/35 sm:px-3"
                  placeholder={String(Number.isFinite(shipment.count) ? shipment.count : 0)}
                  value={shipment.count === 0 ? "" : (Number.isFinite(shipment.count) ? shipment.count : "")}
                  onChange={(event) =>
                    handleShipmentFieldChange(
                      index,
                      "count",
                      Math.max(0, Number(event.target.value) || 0)
                    )
                  }
                />
              </label>
            </div>

            {isManual && (
              <label className="flex flex-col gap-2 text-sm text-white/70">
                <span className="font-medium text-white/80">Стоимость за отправку</span>
                <input
                  type="number"
                  min={0}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-2 py-2 text-right text-sm text-white focus:border-[#ff7a00]/60 focus:outline-none focus:ring-2 focus:ring-[#ff7a00]/35 sm:px-3"
                  placeholder={String(Number.isFinite(shipment.customPricePerShipment) ? Number(shipment.customPricePerShipment) : 0)}
                  value={shipment.customPricePerShipment === 0 ? "" : (Number.isFinite(shipment.customPricePerShipment) ? Number(shipment.customPricePerShipment) : "")}
                  onChange={(event) =>
                    handleShipmentFieldChange(
                      index,
                      "customPricePerShipment",
                      Math.max(0, Number(event.target.value) || 0)
                    )
                  }
                />
              </label>
            )}

            <label className="flex flex-col gap-2 text-sm text-white/70">
              <span className="font-medium text-white/80">Объем при заборе (м³)</span>
              <input
                type="number"
                min={0}
                step="0.1"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-2 py-2 text-right text-sm text-white focus:border-[#ff7a00]/60 focus:outline-none focus:ring-2 focus:ring-[#ff7a00]/35 sm:px-3"
                placeholder={String(shipment.pickupVolumeCbm ?? 0)}
                value={shipment.pickupVolumeCbm === 0 ? "" : (shipment.pickupVolumeCbm ?? "")}
                onChange={(event) =>
                  handleShipmentFieldChange(
                    index,
                    "pickupVolumeCbm",
                    Math.max(0, Number(event.target.value) || 0)
                  )
                }
              />
            </label>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/70 shadow-inner shadow-white/5">
              {hasSelection ? (
                <>
                  <p className="text-white">
                    Стоимость отправки:{" "}
                    <span className="font-semibold text-[#ff9a33]">
                      {formatCurrency(pricePerShipment)} × {count}
                    </span>
                  </p>
                  {mode === "auto" && shipmentQuote?.matchedRange && (
                    <p className="mt-2 text-xs text-white/60">
                      Диапазон{" "}
                      <span className="font-medium text-white">{shipmentQuote.matchedRange}</span>
                    </p>
                  )}
                  {discountPercent > 0 && (
                    <p className="mt-2 text-xs text-[#5de4c7]">
                      Применена скидка {discountPercent}% (−
                      {formatCurrency(baseTotal - discountedTotal)})
                    </p>
                  )}
                  {pickupExtra > 0 && (
                    <p className="mt-1 text-xs text-white/60">
                      Доп. сбор за объём:{" "}
                      <span className="font-medium text-white">
                        {formatCurrency(pickupExtra)}
                      </span>
                    </p>
                  )}
                  <p className="mt-3 text-sm font-semibold text-white">
                    Итого по отправке: {formatCurrency(totalForShipment)}
                  </p>
                </>
              ) : (
                <p className="text-xs text-white/60">
                  {isManual
                    ? "Введите количество, локацию и стоимость за отправку."
                    : "Цена появится после выбора маркетплейса, локации и количества."}
                </p>
              )}
            </div>
          </div>
        );
      })}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-white/60">
          Всего блоков: <span className="font-semibold text-white">{shipments.length}</span>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={handleAddManualShipment}
            className="inline-flex items-center justify-center rounded-xl border border-dashed border-white/15 px-4 py-2 text-sm font-medium text-white/50 transition hover:border-white/30 hover:text-white"
          >
            + Доп. отправка
          </button>
          <button
            type="button"
            onClick={handleAddShipment}
            className="inline-flex items-center justify-center rounded-xl border border-dashed border-white/25 px-4 py-2 text-sm font-semibold text-white/80 transition hover:border-white/40 hover:text-white"
          >
            + отправка
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-4 text-sm text-white/70 shadow-inner shadow-white/5">
        <p className="text-white">
          Общая стоимость логистики:{" "}
          <span className="font-semibold text-[#ff9a33]">{formatCurrency(overallTotal)}</span>
        </p>
        <p className="mt-1 text-xs text-white/60">
          Суммарно отправлений: <span className="font-medium text-white">{totalCount}</span>
        </p>
      </div>
    </div>
  );
}
