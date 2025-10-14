import { Fragment, useMemo } from "react";
import type { LogisticsInput, LogisticsRow, Quote } from "../lib/models";

type LogisticsFormProps = {
  rows: LogisticsRow[];
  value: LogisticsInput;
  onChange: (value: LogisticsInput) => void;
  formatCurrency: (value: number) => string;
  quote?: Quote["logistics"];
};

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b, "ru"));
}

const kinds: LogisticsInput["kind"][] = ["Короб", "Палет"];

export function LogisticsForm({ rows, value, onChange, quote, formatCurrency }: LogisticsFormProps) {
  const marketplaces = useMemo(() => unique(rows.map((row) => row.Маркетплейс)), [rows]);

  const locations = useMemo(() => {
    return unique(
      rows
        .filter((row) => !value.marketplace || row.Маркетплейс === value.marketplace)
        .map((row) => row.Локация)
    );
  }, [rows, value.marketplace]);

  const kindOptions = useMemo(() => {
    return unique(
      rows
        .filter((row) => {
          if (value.marketplace && row.Маркетплейс !== value.marketplace) return false;
          if (value.location && row.Локация !== value.location) return false;
          return true;
        })
        .map((row) => row.Тип)
    ).filter((k): k is LogisticsInput["kind"] => kinds.includes(k as LogisticsInput["kind"]));
  }, [rows, value.marketplace, value.location]);

  const matchedRange = quote?.matchedRange;

  const handleFieldChange = <Key extends keyof LogisticsInput>(field: Key, fieldValue: LogisticsInput[Key]) => {
    onChange({ ...value, [field]: fieldValue });
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm text-white/70">
          <span className="font-medium text-white/80">Маркетплейс</span>
          <select
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-[#ff7a00]/60 focus:outline-none focus:ring-2 focus:ring-[#ff7a00]/40"
            value={value.marketplace}
            onChange={(event) => handleFieldChange("marketplace", event.target.value)}
          >
            <option value="">Выберите...</option>
            {marketplaces.map((marketplace) => (
              <option key={marketplace} value={marketplace}>
                {marketplace}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-2 text-sm text-white/70">
          <span className="font-medium text-white/80">Локация</span>
          <select
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-[#ff7a00]/60 focus:outline-none focus:ring-2 focus:ring-[#ff7a00]/40"
            value={value.location}
            onChange={(event) => handleFieldChange("location", event.target.value)}
            disabled={!value.marketplace}
          >
            <option value="">Выберите...</option>
            {locations.map((location) => (
              <option key={location} value={location}>
                {location}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-2 text-sm text-white/70">
          <span className="font-medium text-white/80">Тип отправки</span>
          <select
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-[#ff7a00]/60 focus:outline-none focus:ring-2 focus:ring-[#ff7a00]/40"
            value={value.kind}
            onChange={(event) => handleFieldChange("kind", event.target.value as LogisticsInput["kind"])}
            disabled={!value.location}
          >
            {kindOptions.length === 0 && <option value="">—</option>}
            {kindOptions.map((kind) => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ))}
            {kindOptions.length === 0 &&
              kinds.map((kind) => (
                <Fragment key={kind}>
                  {!kindOptions.includes(kind) && <option value={kind}>{kind}</option>}
                </Fragment>
              ))}
          </select>
        </label>

        <label className="flex flex-col gap-2 text-sm text-white/70">
          <span className="font-medium text-white/80">
            {value.kind === "Палет" ? "Количество палет" : "Количество коробов"}
          </span>
          <input
            type="number"
            min={0}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-right text-sm text-white focus:border-[#ff7a00]/60 focus:outline-none focus:ring-2 focus:ring-[#ff7a00]/35"
            value={Number.isFinite(value.count) ? value.count : 0}
            onChange={(event) =>
              handleFieldChange("count", Math.max(0, Number(event.target.value) || 0))
            }
          />
        </label>
      </div>

      <label className="flex flex-col gap-2 text-sm text-white/70">
        <span className="font-medium text-white/80">Объем при заборе (м³)</span>
        <input
          type="number"
          min={0}
          step="0.1"
          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-right text-sm text-white focus:border-[#ff7a00]/60 focus:outline-none focus:ring-2 focus:ring-[#ff7a00]/35"
          value={value.pickupVolumeCbm ?? 0}
          onChange={(event) =>
            handleFieldChange(
              "pickupVolumeCbm",
              Math.max(0, Number(event.target.value) || 0)
            )
          }
        />
      </label>

      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-white/70 shadow-inner shadow-white/5">
        <p className="text-white">
          Стоимость отправки:{" "}
          <span className="font-semibold text-[#ff9a33]">
            {formatCurrency(quote?.pricePerShipment ?? 0)} × {value.count}
          </span>
        </p>
        {matchedRange && (
          <p className="mt-2 text-xs text-white/60">
            Попали в диапазон <span className="font-medium text-white">{matchedRange}</span>
          </p>
        )}
        {quote && quote.discount > 0 && (
          <p className="mt-2 text-xs text-[#5de4c7]">
            Применена скидка {Math.round(quote.discount * 100)}%
          </p>
        )}
      </div>
    </div>
  );
}
