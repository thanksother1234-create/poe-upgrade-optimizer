import { writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const REPOE_MODS = "https://raw.githubusercontent.com/lvlvllvlvllvlvl/RePoE/master/RePoE/data/mods.json";
const TRADE_STATS = "https://www.pathofexile.com/api/trade/data/stats";
const ALL_CATEGORIES = [
  "weapon.wand", "weapon.bow", "weapon.claw", "weapon.dagger", "weapon.runedagger", "weapon.oneaxe",
  "weapon.onemace", "weapon.onesword", "weapon.rapier", "weapon.sceptre", "weapon.staff", "weapon.warstaff",
  "weapon.twoaxe", "weapon.twomace", "weapon.twosword", "weapon.rod", "armour.shield", "armour.helmet",
  "armour.chest", "armour.gloves", "armour.boots", "accessory.quiver", "accessory.amulet", "accessory.ring",
  "accessory.belt",
];
const WEAPONS = ALL_CATEGORIES.filter((category) => category.startsWith("weapon."));

async function loadJson(url) {
  const response = await fetch(url, { headers: { "User-Agent": "PoEUpgradeOptimizer affix sync" } });
  if (!response.ok) throw new Error(`Unable to download ${url}: ${response.status}`);
  return response.json();
}

function normalizedText(value) {
  return value.toLowerCase()
    .replace(/\(local\)/g, "")
    .replace(/\([+-]?\d+(?:\.\d+)?[–-][+-]?\d+(?:\.\d+)?\)/g, "#")
    .replace(/[+-]?\d+(?:\.\d+)?/g, "#")
    .replace(/\s+/g, " ")
    .trim();
}

function categoriesForTag(tag) {
  if (tag === "default") return ALL_CATEGORIES;
  const categories = new Set();
  const add = (...values) => values.flat().forEach((value) => categories.add(value));
  if (/helmet/.test(tag)) add("armour.helmet");
  if (/body_armour/.test(tag)) add("armour.chest");
  if (/gloves/.test(tag)) add("armour.gloves");
  if (/boots/.test(tag)) add("armour.boots");
  if (/shield|focus/.test(tag)) add("armour.shield");
  if (/quiver/.test(tag)) add("accessory.quiver");
  if (/amulet/.test(tag)) add("accessory.amulet");
  if (/ring/.test(tag)) add("accessory.ring");
  if (/belt/.test(tag)) add("accessory.belt");
  if (/wand/.test(tag)) add("weapon.wand");
  if (/bow/.test(tag)) add("weapon.bow");
  if (/claw/.test(tag)) add("weapon.claw");
  if (/rune_dagger/.test(tag)) add("weapon.runedagger");
  else if (/dagger/.test(tag)) add("weapon.dagger");
  if (/rapier/.test(tag)) add("weapon.rapier");
  if (/sceptre/.test(tag)) add("weapon.sceptre");
  if (/warstaff/.test(tag)) add("weapon.warstaff");
  else if (/staff/.test(tag)) add("weapon.staff");
  if (/fishing_rod/.test(tag)) add("weapon.rod");
  if (/2h_sword|two_hand_sword/.test(tag)) add("weapon.twosword");
  else if (/sword/.test(tag)) add("weapon.onesword", "weapon.twosword");
  if (/2h_axe|two_hand_axe/.test(tag)) add("weapon.twoaxe");
  else if (/axe/.test(tag)) add("weapon.oneaxe", "weapon.twoaxe");
  if (/2h_mace|two_hand_mace/.test(tag)) add("weapon.twomace");
  else if (/mace/.test(tag)) add("weapon.onemace", "weapon.twomace");
  if (/one_hand_weapon/.test(tag)) add(WEAPONS.filter((category) => !/bow|staff|two|rod/.test(category)));
  if (/two_hand_weapon/.test(tag)) add("weapon.bow", "weapon.staff", "weapon.warstaff", "weapon.twoaxe", "weapon.twomace", "weapon.twosword");
  if (tag === "weapon" || /(?:^|_)unique_weapon$/.test(tag)) add(WEAPONS);
  if (tag === "armour" || /_armour$/.test(tag)) add("armour.helmet", "armour.chest", "armour.gloves", "armour.boots", "armour.shield");
  return categories;
}

const [mods, tradeStats] = await Promise.all([loadJson(REPOE_MODS), loadJson(TRADE_STATS)]);
const categoriesByText = new Map();
for (const mod of Object.values(mods)) {
  if (mod.domain !== "item" || !["prefix", "suffix", "corrupted", "crafted", "implicit"].includes(mod.generation_type) || !mod.text) continue;
  const categories = categoriesByText.get(normalizedText(mod.text)) ?? new Set();
  for (const spawn of mod.spawn_weights ?? []) {
    if (spawn.weight <= 0) continue;
    for (const category of categoriesForTag(spawn.tag)) categories.add(category);
  }
  if (categories.size) categoriesByText.set(normalizedText(mod.text), categories);
}

const explicit = tradeStats.result?.find((group) => group.id === "explicit")?.entries ?? [];
const records = [];
const seen = new Set();
for (const entry of explicit) {
  const categories = categoriesByText.get(normalizedText(entry.text));
  if (!categories?.size || seen.has(entry.id)) continue;
  seen.add(entry.id);
  records.push({ id: entry.id, label: entry.text, categories: [...categories].sort() });
}
records.sort((left, right) => left.label.localeCompare(right.label) || left.id.localeCompare(right.id));

const outputPath = path.join(process.cwd(), "src", "data", "trade-affixes.json");
await writeFile(outputPath, `${JSON.stringify(records)}\n`, "utf8");
console.log(`Wrote ${records.length} item-compatible trade affixes to ${outputPath}`);
