import { Build, CurrencyAmount, EquipmentSlot, ItemRarity, TradeItem } from "@/models";
import { createTradeSiteUrl } from "@/services/trade/trade-search-service";
import { TradeMarketService } from "@/services/trade/trade-market-service";
import { getTradeCategory } from "@/services/trade/trade-categories";

const SLOT_ITEM_CLASSES: Partial<Record<EquipmentSlot, Set<string>>> = {
  helmet: new Set(["helmets", "helmet"]),
  bodyArmour: new Set(["body armours", "body armour"]),
  gloves: new Set(["gloves"]),
  boots: new Set(["boots"]),
  amulet: new Set(["amulets", "amulet"]),
  ring1: new Set(["rings", "ring"]),
  ring2: new Set(["rings", "ring"]),
  belt: new Set(["belts", "belt"]),
};

const METADATA_LINE = /^(?:Item Class|Rarity|Item Level|Level|Str|Dex|Int|Quality|Sockets|Armour|Evasion Rating|Energy Shield|Ward|Physical Damage|Elemental Damage|Chaos Damage|Critical Strike Chance|Attacks per Second|Weapon Range|Stack Size|Map Tier|Implicits|Note):/i;
const FLAG_LINE = /^(?:Requirements|Corrupted|Mirrored|Unidentified|Synthesised Item|Fractured Item|Crafted Item|Split)$/i;

const normalized = (value: string | undefined) => value?.trim().toLowerCase() ?? "";

function parseRarity(value: string | undefined): ItemRarity {
  const rarity = normalized(value);
  return rarity === "magic" || rarity === "rare" || rarity === "unique" ? rarity : "normal";
}

export interface ManualTradeCandidateInput {
  id: string;
  slot: EquipmentSlot;
  rawText: string;
  price?: CurrencyAmount;
  league: string;
}

const LISTING_NOTE = /^Note:\s*~(?:price|b\/o)\s+(\d+(?:\.\d+)?)\s+(divine|chaos|mirror)(?:\s+orbs?)?\s*$/i;

export function parseCopiedItemPrice(rawText: string): CurrencyAmount {
  const note = rawText.split(/\r?\n/).map((line) => line.trim()).findLast((line) => /^Note:/i.test(line));
  const match = note?.match(LISTING_NOTE);
  if (!match) {
    throw new Error("The copied item needs its trade note, such as `Note: ~price 2 divine` or `Note: ~b/o 50 chaos`.");
  }
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("The copied item's trade note contains an invalid price.");
  return { amount, currency: match[2].toLowerCase() as CurrencyAmount["currency"] };
}

export function parseCopiedTradeItem(input: ManualTradeCandidateInput): TradeItem {
  const rawText = input.rawText.replaceAll("\0", "").trim();
  if (!rawText || rawText.length > 64 * 1024) throw new Error("Paste one copied Path of Exile item of no more than 64 KB.");
  const lines = rawText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const itemClass = lines.find((line) => /^Item Class:/i.test(line))?.replace(/^Item Class:\s*/i, "").trim();
  const rarityIndex = lines.findIndex((line) => /^Rarity:/i.test(line));
  const rarity = parseRarity(lines[rarityIndex]?.replace(/^Rarity:\s*/i, ""));
  if (!itemClass || rarityIndex < 0) throw new Error("The pasted text must include the Item Class and Rarity lines from a copied PoE item.");

  const displayLines = lines.slice(rarityIndex + 1).filter((line) => line !== "--------");
  const name = displayLines[0];
  const baseType = rarity === "normal" ? displayLines[0] : displayLines[1];
  if (!name || !baseType) throw new Error("The copied item is missing its name or base type.");
  const price = input.price ?? parseCopiedItemPrice(rawText);
  if (!Number.isFinite(price.amount) || price.amount <= 0 || !["chaos", "divine", "mirror"].includes(price.currency)) {
    throw new Error("Use a chaos, divine, or mirror listing note.");
  }

  const displayEnd = rarityIndex + (rarity === "normal" ? 2 : 3);
  const modifiers = lines.slice(displayEnd)
    .filter((line) => line !== "--------" && !METADATA_LINE.test(line) && !FLAG_LINE.test(line))
    .map((label) => label.replace(/^\{[^}]+\}/, ""))
    .filter(Boolean)
    .map((label) => ({ label, value: Number(label.match(/[+-]?\d+(?:\.\d+)?/)?.[0] ?? 0) }));

  return {
    id: input.id,
    slot: input.slot,
    name,
    baseType,
    itemClass,
    rarity,
    modifiers,
    price,
    rawText,
    tradeUrl: createTradeSiteUrl(input.league),
  };
}

export function isManualCandidateCompatible(build: Build, candidate: TradeItem) {
  const fixedClasses = SLOT_ITEM_CLASSES[candidate.slot];
  if (fixedClasses) return fixedClasses.has(normalized(candidate.itemClass));
  const currentItem = build.equipment[candidate.slot];
  const currentCategory = getTradeCategory(candidate.slot, currentItem);
  const candidateCategory = getTradeCategory(candidate.slot, candidate);
  return Boolean(currentCategory && candidateCategory && currentCategory === candidateCategory);
}

export class ManualTradeMarketService implements TradeMarketService {
  constructor(private readonly candidates: TradeItem[]) {}

  async searchUpgrades(build: Build, slot: EquipmentSlot, budget: CurrencyAmount, league: string) {
    void budget;
    void league;
    return this.candidates.filter((candidate) => candidate.slot === slot
      && isManualCandidateCompatible(build, candidate));
  }

  async estimatePrice(item: TradeItem) {
    return item.price;
  }
}
