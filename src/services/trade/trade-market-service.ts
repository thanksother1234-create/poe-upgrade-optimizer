import { Build, CurrencyAmount, EquipmentSlot, TradeItem } from "@/models";
import { toChaos } from "@/lib/metrics";
import { mockTradeItems } from "@/mocks/trade-items";

export interface TradeMarketService {
  searchUpgrades(build: Build, slot: EquipmentSlot, budget: CurrencyAmount, league: string): Promise<TradeItem[]>;
  estimatePrice(item: TradeItem): Promise<CurrencyAmount>;
}
export class MockTradeMarketService implements TradeMarketService {
  async searchUpgrades(_build: Build, slot: EquipmentSlot, budget: CurrencyAmount, league: string) {
    void league;
    return mockTradeItems.filter((item) => item.slot === slot && toChaos(item.price) <= toChaos(budget));
  }
  async estimatePrice(item: TradeItem) { return item.price; }
}
