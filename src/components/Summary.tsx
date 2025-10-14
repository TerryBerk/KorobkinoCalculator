import { useMemo } from "react";
import type { Quote } from "../lib/models";

type SummaryProps = {
  quote: Quote;
  formatCurrency: (value: number) => string;
  onExportCsv: () => void;
  onExportPdf: () => void;
  onCopyLink: () => Promise<void>;
  copyStatus: "idle" | "success" | "error";
  shareUrl: string;
  personalDiscountEnabled: boolean;
  personalDiscountPercent: number;
  onPersonalDiscountToggle: (enabled: boolean) => void;
  onPersonalDiscountPercentChange: (percent: number) => void;
};

export function Summary({
  quote,
  formatCurrency,
  onExportCsv,
  onExportPdf,
  onCopyLink,
  copyStatus,
  shareUrl,
  personalDiscountEnabled,
  personalDiscountPercent,
  onPersonalDiscountToggle,
  onPersonalDiscountPercentChange
}: SummaryProps) {
  const servicesTotal = quote.items.reduce((sum, line) => sum + line.lineTotal, 0);
  const logisticsTotal = quote.logistics?.total ?? 0;
  const logisticsShipments = quote.logistics?.shipments ?? [];
  const logisticsCount = logisticsShipments.reduce((sum, shipment) => sum + shipment.count, 0);
  const hasSummaryData = quote.items.length > 0 || logisticsShipments.length > 0;
  const clampedDiscount = useMemo(
    () => Math.min(100, Math.max(0, personalDiscountPercent)),
    [personalDiscountPercent]
  );
  const hasPersonalDiscount = personalDiscountEnabled && clampedDiscount > 0;
  const discountedTotal = hasPersonalDiscount
    ? Math.max(0, quote.grandTotal * (1 - clampedDiscount / 100))
    : quote.grandTotal;
  const discountSavings = hasPersonalDiscount ? quote.grandTotal - discountedTotal : 0;

  return (
    <div className="space-y-6 pb-5">
      <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 shadow-inner shadow-white/5">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-white/50">Услуги</h3>
        <div className="mt-2 flex items-baseline justify-between">
          <span className="text-sm text-white/60">
            {quote.items.length} позиций ·{" "}
            {quote.items.map((item) => item.qty).reduce((sum, qty) => sum + qty, 0)} ед.
          </span>
          <span className="font-mono text-2xl font-semibold text-white">
            {formatCurrency(servicesTotal)}
          </span>
        </div>
        {quote.items.length > 0 ? (
          <ul className="mt-4 space-y-3 text-sm text-white/75">
            {quote.items.map((line) => (
              <li
                key={line.code}
                className="flex items-center justify-between rounded-xl border border-white/8 bg-white/5 px-3 py-2"
              >
                <div className="space-y-1">
                  <p className="font-medium text-white">
                    {line.name}
                    <span className="ml-2 rounded-full border border-white/10 bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-white/60">
                      {line.code}
                    </span>
                  </p>
                  <p className="text-xs text-white/50">
                    {line.qty} × {formatCurrency(line.unitPrice)}{" "}
                    {line.unit ? `(${line.unit})` : ""}
                    {line.tariffLabel ? ` · ${line.tariffLabel}` : ""}
                  </p>
                </div>
                <span className="font-mono text-base font-semibold text-[#ffbf80]">
                  {formatCurrency(line.lineTotal)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-xs text-white/50">Услуги ещё не выбраны.</p>
        )}
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 shadow-inner shadow-white/5">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-white/50">Логистика</h3>
        {quote.logistics ? (
          <div className="mt-3 space-y-3">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-white/60">
                {logisticsShipments.length} отправок · {logisticsCount} шт.
              </span>
              <span className="font-mono text-xl font-semibold text-white">
                {formatCurrency(logisticsTotal)}
              </span>
            </div>
            {logisticsShipments.length > 0 ? (
              <ul className="space-y-3 text-sm text-white/75">
                {logisticsShipments.map((shipment, index) => (
                  <li
                    key={`logistics-${index}`}
                    className="rounded-xl border border-white/8 bg-white/5 px-3 py-3"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <p className="font-medium text-white">
                          Отправка #{index + 1}
                          {shipment.input.marketplace && (
                            <span className="ml-2 rounded-full border border-white/10 bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-white/60">
                              {shipment.input.marketplace}
                            </span>
                          )}
                          {(shipment.input.mode ?? "auto") === "manual" && (
                            <span className="ml-2 rounded-full border border-white/10 bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-white/50">
                              ручной тариф
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-white/50">
                          {shipment.input.location}
                          {shipment.input.location && " · "}
                          {shipment.input.kind} · {shipment.count} шт ×{" "}
                          {formatCurrency(shipment.pricePerShipment)}
                        </p>
                        {shipment.matchedRange && (
                          <p className="text-xs text-white/45">
                            Диапазон{" "}
                            <span className="font-medium text-white">
                              {shipment.matchedRange}
                            </span>
                          </p>
                        )}
                        {shipment.discount > 0 && (
                          <p className="text-xs text-[#5de4c7]">
                            Скидка {Math.round(shipment.discount * 100)}%
                          </p>
                        )}
                        {shipment.pickupSurcharge > 0 && (
                          <p className="text-xs text-white/45">
                            Доп. сбор за объём:{" "}
                            <span className="font-medium text-white">
                              {formatCurrency(shipment.pickupSurcharge)}
                            </span>
                          </p>
                        )}
                      </div>
                      <span className="font-mono text-base font-semibold text-[#ffbf80]">
                        {formatCurrency(shipment.total)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-white/50">Добавьте отправку, чтобы увидеть расчёт.</p>
            )}
          </div>
        ) : (
          <p className="mt-2 text-sm text-white/50">Не выбрана</p>
        )}
      </section>

      <section
        className={`rounded-2xl border p-5 shadow-inner shadow-white/5 transition ${
          personalDiscountEnabled ? "border-[#5de4c7]/50 bg-[#0c1929]/80" : "border-white/10 bg-white/[0.02]"
        }`}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className={personalDiscountEnabled ? "space-y-1" : "space-y-1 opacity-60"}>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-white/50">
              Персональная скидка
            </h3>
            <p className="text-xs text-white/50">Диапазон 0–100%</p>
            {hasPersonalDiscount && (
              <p className="text-xs text-[#5de4c7]">
                Экономия {formatCurrency(discountSavings)}
              </p>
            )}
          </div>

          {personalDiscountEnabled ? (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={clampedDiscount}
                  onChange={(event) =>
                    onPersonalDiscountPercentChange(Number(event.target.value))
                  }
                  onBlur={() => onPersonalDiscountPercentChange(clampedDiscount)}
                  className="w-16 bg-transparent text-right text-sm font-semibold text-white outline-none"
                />
                <span className="text-sm font-medium text-white/60">%</span>
              </div>
              <button
                type="button"
                onClick={() => onPersonalDiscountToggle(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-white/[0.08] text-xl font-semibold text-white transition hover:bg-white/[0.15] focus:outline-none focus:ring-2 focus:ring-white/30"
              >
                ×
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onPersonalDiscountToggle(true)}
              className="inline-flex h-12 w-full items-center justify-center rounded-xl border border-dashed border-white/25 bg-transparent text-2xl font-semibold text-white/70 transition hover:border-white/40 hover:text-white sm:w-12"
            >
              +
            </button>
          )}
        </div>
      </section>

      <section className="relative overflow-hidden rounded-2xl border border-[#ff9a33]/40 bg-[#ff7a00]/10 p-6 shadow-[0_20px_60px_rgba(255,122,0,0.25)]">
        <div className="pointer-events-none absolute inset-0 -translate-x-[30%] translate-y-[10%] scale-150 bg-[radial-gradient(circle_at_center,rgba(255,122,0,0.35),transparent_55%)]" />
        <h3 className="relative text-sm font-semibold uppercase tracking-wide text-[#ffbf80]">
          Итого
        </h3>
        <div className="relative mt-3 font-mono">
          {hasPersonalDiscount ? (
            <>
              <span className="block text-2xl font-semibold text-white/60 line-through">
                {formatCurrency(quote.grandTotal)}
              </span>
              <span className="mt-1 block text-3xl font-bold text-white">
                {formatCurrency(discountedTotal)}
              </span>
            </>
          ) : (
            <span className="block text-3xl font-bold text-white">
              {formatCurrency(quote.grandTotal)}
            </span>
          )}
        </div>
        {hasPersonalDiscount && (
          <p className="relative mt-2 text-xs font-medium uppercase tracking-wide text-white/70">
            Персональная скидка {clampedDiscount}%
          </p>
        )}
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <button
          type="button"
          onClick={onExportPdf}
          disabled={!hasSummaryData}
          className={`inline-flex items-center justify-center rounded-xl border border-white/15 px-5 py-3 text-sm font-semibold backdrop-blur transition focus:outline-none focus:ring-2 focus:ring-white/40 ${
            hasSummaryData
              ? "bg-[#ff7a00] text-[#05070c] shadow-[0_18px_40px_rgba(255,122,0,0.35)] hover:bg-[#ffa24c]"
              : "cursor-not-allowed bg-white/[0.06] text-white/50 opacity-70"
          }`}
        >
          Выгрузить в PDF
        </button>
        <button
          type="button"
          onClick={onExportCsv}
          className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/[0.08] px-5 py-3 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/[0.12] focus:outline-none focus:ring-2 focus:ring-white/40"
        >
          Экспорт CSV сметы
        </button>
        <button
          type="button"
          onClick={onCopyLink}
          className="inline-flex items-center justify-center rounded-xl border border-transparent bg-[#ff7a00] px-5 py-3 text-sm font-semibold text-[#05070c] shadow-[0_18px_40px_rgba(255,122,0,0.35)] transition hover:bg-[#ffa24c] focus:outline-none focus:ring-2 focus:ring-[#ff7a00]/30"
        >
          Копировать ссылку
        </button>
      </div>

      <p
        className="max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-xs text-white/60"
        title={copyStatus === "idle" ? shareUrl : undefined}
      >
        {copyStatus === "success" && "Ссылка скопирована!"}
        {copyStatus === "error" && "Не удалось скопировать ссылку."}
        {copyStatus === "idle" && shareUrl}
      </p>
    </div>
  );
}
