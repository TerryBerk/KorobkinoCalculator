import type { Quote } from "../lib/models";

type SummaryProps = {
  quote: Quote;
  formatCurrency: (value: number) => string;
  onExportCsv: () => void;
  onCopyLink: () => Promise<void>;
  copyStatus: "idle" | "success" | "error";
  shareUrl: string;
  shipmentsCount: number;
};

export function Summary({
  quote,
  formatCurrency,
  onExportCsv,
  onCopyLink,
  copyStatus,
  shareUrl,
  shipmentsCount
}: SummaryProps) {
  const servicesTotal = quote.items.reduce((sum, line) => sum + line.lineTotal, 0);
  const logisticsTotal = quote.logistics?.total ?? 0;

  return (
    <div className="space-y-6">
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
          <div className="mt-2 space-y-1 text-sm text-white/70">
            <p>
              Ставка:{" "}
              <span className="font-medium text-white">
                {formatCurrency(quote.logistics.pricePerShipment)}
              </span>
            </p>
            <p>Кол-во отправок: {shipmentsCount}</p>
            <p>
              Итого: <span className="font-medium text-white">{formatCurrency(logisticsTotal)}</span>
            </p>
            {quote.logistics.discount > 0 && (
              <p className="text-xs text-[#5de4c7]">
                Скидка {Math.round(quote.logistics.discount * 100)}%
              </p>
            )}
          </div>
        ) : (
          <p className="mt-2 text-sm text-white/50">Не выбрана</p>
        )}
      </section>

      <section className="relative overflow-hidden rounded-2xl border border-[#ff9a33]/40 bg-[#ff7a00]/10 p-6 shadow-[0_20px_60px_rgba(255,122,0,0.25)]">
        <div className="pointer-events-none absolute inset-0 -translate-x-[30%] translate-y-[10%] scale-150 bg-[radial-gradient(circle_at_center,rgba(255,122,0,0.35),transparent_55%)]" />
        <h3 className="relative text-sm font-semibold uppercase tracking-wide text-[#ffbf80]">
          Итого
        </h3>
        <p className="relative mt-3 font-mono text-3xl font-bold text-white">
          {formatCurrency(quote.grandTotal)}
        </p>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row">
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
