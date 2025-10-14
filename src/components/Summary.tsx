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
      <section className="rounded-xl border border-slate-700 bg-slate-900/70 p-5 shadow-inner">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Услуги</h3>
        <div className="mt-2 flex items-baseline justify-between">
          <span className="text-sm text-slate-300">
            {quote.items.length} позиций ·{" "}
            {quote.items.map((item) => item.qty).reduce((sum, qty) => sum + qty, 0)} ед.
          </span>
          <span className="font-mono text-2xl font-semibold text-white">
            {formatCurrency(servicesTotal)}
          </span>
        </div>
      </section>

      <section className="rounded-xl border border-slate-700 bg-slate-900/70 p-5 shadow-inner">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Логистика</h3>
        {quote.logistics ? (
          <div className="mt-2 space-y-1 text-sm text-slate-300">
            <p>Ставка: {formatCurrency(quote.logistics.pricePerShipment)}</p>
            <p>Кол-во отправок: {shipmentsCount}</p>
            <p>Итого: {formatCurrency(logisticsTotal)}</p>
            {quote.logistics.discount > 0 && (
              <p className="text-xs text-emerald-300">
                Скидка {Math.round(quote.logistics.discount * 100)}%
              </p>
            )}
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-400">Не выбрана</p>
        )}
      </section>

      <section className="rounded-xl border border-emerald-600/60 bg-emerald-500/10 p-6 shadow-lg">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-emerald-200">Итого</h3>
        <p className="mt-2 font-mono text-3xl font-bold text-white">
          {formatCurrency(quote.grandTotal)}
        </p>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={onExportCsv}
          className="inline-flex items-center justify-center rounded-lg border border-emerald-500 bg-emerald-500/20 px-5 py-3 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/30 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
        >
          Экспорт CSV сметы
        </button>
        <button
          type="button"
          onClick={onCopyLink}
          className="inline-flex items-center justify-center rounded-lg border border-slate-600 bg-slate-900/80 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
        >
          Копировать ссылку
        </button>
      </div>

      <p className="text-xs text-slate-400">
        {copyStatus === "success" && "Ссылка скопирована!"}
        {copyStatus === "error" && "Не удалось скопировать ссылку."}
        {copyStatus === "idle" && shareUrl}
      </p>
    </div>
  );
}
