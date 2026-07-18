import { Build, CurrencyAmount, EquipmentSlot, TradeItem } from "@/models";
import { toChaos } from "@/lib/metrics";
import { mockTradeItems } from "@/mocks/trade-items";
import { areWeaponBasesCompatible } from "@/services/trade/weapon-compatibility";

export interface TradeMarketService {
  searchUpgrades(build: Build, slot: EquipmentSlot, budget: CurrencyAmount, league: string): Promise<TradeItem[]>;
  estimatePrice(item: TradeItem): Promise<CurrencyAmount>;
}
export class MockTradeMarketService implements TradeMarketService {
  async searchUpgrades(build: Build, slot: EquipmentSlot, budget: CurrencyAmount, league: string) {
    void league;
    return mockTradeItems.filter((item) => {
      if (item.slot !== slot || toChaos(item.price) > toChaos(budget)) return false;
      if (slot !== "weapon") return true;
      return areWeaponBasesCompatible(build.equipment.weapon.baseType, item.baseType);
    });
  }
  async estimatePrice(item: TradeItem) { return item.price; }
}
