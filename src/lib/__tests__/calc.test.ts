import { describe, expect, it } from "vitest";
import {
  buildQuote,
  calcLineTotal,
  matchLogisticsPrice,
  palletDiscount,
  pickUnitPriceByQty
} from "../calc";
import type { CartItem, LogisticsInput, LogisticsRow, ParamsMap, ServiceRow } from "../models";

const params: ParamsMap = {
  "Граница 1 (ед.)": 100,
  "Граница 2 (ед.)": 500,
  "Граница 3 (ед.)": 1000,
  "Включено куб.м при заборе": 2,
  "Цена за доп. куб.м": 1500,
  "Скидка палеты >=3": 0.1,
  "Скидка палеты >=5": 0.15
};

const service: ServiceRow = {
  Код: "SRV-1",
  Категория: "Тест",
  Наименование: "Тестовая услуга",
  "Ед. изм.": "ед.",
  "от 100 ед.": 50,
  "от 500 ед.": 40,
  "от 1000 ед.": 30,
  "Фикс. цена": null
};

const fixedService: ServiceRow = {
  ...service,
  Код: "SRV-2",
  "Фикс. цена": 1500
};

describe("pickUnitPriceByQty", () => {
  it("returns до 100 tariff for small qty", () => {
    const result = pickUnitPriceByQty(service, 50, params);
    expect(result.unitPrice).toBe(50);
    expect(result.tariffLabel).toBe("до 100 ед.");
  });

  it("returns middle tier when qty crosses first threshold", () => {
    const result = pickUnitPriceByQty(service, 200, params);
    expect(result.unitPrice).toBe(40);
    expect(result.tariffLabel).toBe("100-499 ед.");
  });

  it("returns 500+ tariff when qty crosses second threshold", () => {
    const result = pickUnitPriceByQty(service, 600, params);
    expect(result.unitPrice).toBe(30);
    expect(result.tariffLabel).toBe("500+ ед.");
  });

  it("returns fixed price when provided", () => {
    const result = pickUnitPriceByQty(fixedService, 1000, params);
    expect(result.unitPrice).toBe(1500);
    expect(result.tariffLabel).toBeUndefined();
  });
});

describe("calcLineTotal", () => {
  it("multiplies unit price by qty", () => {
    const total = calcLineTotal(service, 120, params);
    expect(total).toBe(120 * 40);
  });

  it("respects fixed price", () => {
    const total = calcLineTotal(fixedService, 999, params);
    expect(total).toBe(1500);
  });
});

describe("matchLogisticsPrice", () => {
  const rows: LogisticsRow[] = [
    {
      Маркетплейс: "Ozon",
      Локация: "Москва",
      Тип: "Короб",
      "Диапазон коробов": "1-5",
      "Цена, ₽": 350
    },
    {
      Маркетплейс: "Ozon",
      Локация: "Москва",
      Тип: "Короб",
      "Диапазон коробов": "6-10",
      "Цена, ₽": 320
    }
  ];

  it("matches range containing count", () => {
    const input: LogisticsInput = {
      marketplace: "Ozon",
      location: "Москва",
      kind: "Короб",
      count: 3
    };
    const result = matchLogisticsPrice(rows, input);
    expect(result.pricePerShipment).toBe(350);
    expect(result.matchedRange).toBe("1-5");
  });

  it("falls back to the last range when count exceeds configured maximum", () => {
    const input: LogisticsInput = {
      marketplace: "Ozon",
      location: "Москва",
      kind: "Короб",
      count: 14
    };
    const result = matchLogisticsPrice(rows, input);
    expect(result.pricePerShipment).toBe(320);
    expect(result.matchedRange).toBe("6-10");
  });
});

describe("palletDiscount", () => {
  it("returns 0 for less than 3", () => {
    expect(palletDiscount(2, params)).toBeCloseTo(0);
  });

  it("returns discount for 3 pallets", () => {
    expect(palletDiscount(3, params)).toBeCloseTo(0.1);
  });

  it("returns larger discount for 5 pallets", () => {
    expect(palletDiscount(5, params)).toBeCloseTo(0.15);
  });
});

describe("buildQuote", () => {
  const logisticsRows: LogisticsRow[] = [
    {
      Маркетплейс: "Ozon",
      Локация: "Москва",
      Тип: "Палет",
      "Диапазон коробов": "1-10",
      "Цена, ₽": 1200
    }
  ];

  it("calculates services and logistics totals", () => {
    const cart: CartItem[] = [
      { code: "SRV-1", name: "Тестовая услуга", qty: 600 },
      { code: "SRV-2", name: "Фикс", qty: 1 }
    ];
    const logisticsInput: LogisticsInput = {
      marketplace: "Ozon",
      location: "Москва",
      kind: "Палет",
      count: 5,
      pickupVolumeCbm: 4
    };

    const quote = buildQuote([service, fixedService], cart, logisticsRows, [logisticsInput], params);
    // Service total = 600 * 30 + 1500
    expect(quote.items).toHaveLength(2);
    expect(quote.items[0].lineTotal).toBe(600 * 30);
    expect(quote.items[1].lineTotal).toBe(1500);
    const servicesTotal = 600 * 30 + 1500;

    // Logistics: 1200 * 5 = 6000; discount 15% => 5100; pickup extra: (4 - 2) * 1500 = 3000
    // Total logistics = 5100 + 3000 = 8100
    expect(quote.logistics?.total).toBeCloseTo(8100);
    expect(quote.logistics?.shipments).toHaveLength(1);
    const shipment = quote.logistics?.shipments[0];
    expect(shipment).toBeDefined();
    expect(shipment?.pricePerShipment).toBe(1200);
    expect(shipment?.discount).toBeCloseTo(0.15);
    expect(shipment?.pickupSurcharge).toBeCloseTo(3000);
    expect(quote.grandTotal).toBeCloseTo(servicesTotal + 8100);
  });

  it("aggregates multiple shipments and preserves per-shipment quotes", () => {
    const multiRows: LogisticsRow[] = [
      {
        Маркетплейс: "Ozon",
        Локация: "Москва",
        Тип: "Короб",
        "Диапазон коробов": "1-5",
        "Цена, ₽": 300
      },
      {
        Маркетплейс: "Ozon",
        Локация: "Москва",
        Тип: "Короб",
        "Диапазон коробов": "6-10",
        "Цена, ₽": 250
      },
      {
        Маркетплейс: "WB",
        Локация: "СПБ",
        Тип: "Палет",
        "Диапазон коробов": ">=1",
        "Цена, ₽": 1000
      }
    ];
    const inputs: LogisticsInput[] = [
      {
        marketplace: "Ozon",
        location: "Москва",
        kind: "Короб",
        count: 12,
        pickupVolumeCbm: 0
      },
      {
        marketplace: "WB",
        location: "СПБ",
        kind: "Палет",
        count: 2,
        pickupVolumeCbm: 0
      }
    ];

    const quote = buildQuote([], [], multiRows, inputs, params);
    expect(quote.logistics?.shipments).toHaveLength(2);
    const [first, second] = quote.logistics?.shipments ?? [];
    expect(first.inputIndex).toBe(0);
    expect(first.matchedRange).toBe("6-10");
    expect(first.pricePerShipment).toBe(250);
    expect(first.total).toBeCloseTo(250 * 12);
    expect(second.inputIndex).toBe(1);
    expect(second.pricePerShipment).toBe(1000);
    expect(second.total).toBeCloseTo(1000 * 2);
    expect(quote.logistics?.total).toBeCloseTo(250 * 12 + 1000 * 2);
  });

  it("supports manual shipments with custom pricing", () => {
    const manualInputs: LogisticsInput[] = [
      {
        marketplace: "Дополнительно",
        location: "Тест",
        kind: "Палет",
        count: 3,
        pickupVolumeCbm: 4,
        mode: "manual",
        customPricePerShipment: 5000
      }
    ];

    const quote = buildQuote([], [], [], manualInputs, params);
    const manualShipment = quote.logistics?.shipments[0];
    expect(manualShipment).toBeDefined();
    expect(manualShipment?.pricePerShipment).toBe(5000);
    // Base: 5000 * 3 = 15000, pickup extra: (4 - 2) * 1500 = 3000
    expect(manualShipment?.total).toBeCloseTo(15000 + 3000);
    expect(quote.logistics?.total).toBeCloseTo(18000);
  });
});
