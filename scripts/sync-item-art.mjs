import { writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const REPOE_ROOT = "https://raw.githubusercontent.com/lvlvllvlvllvlvl/RePoE/master/RePoE/data";
const EQUIPMENT_CLASSES = new Set([
  "Amulet", "Belt", "Body Armour", "Boots", "Bow", "Claw", "Dagger", "Fishing Rod", "Gloves", "Helmet",
  "One Hand Axe", "One Hand Mace", "One Hand Sword", "Quiver", "Ring", "Rune Dagger", "Sceptre", "Shield",
  "Staff", "Thrusting One Hand Sword", "Two Hand Axe", "Two Hand Mace", "Two Hand Sword", "Wand", "Warstaff",
]);

async function loadJson(filename) {
  const response = await fetch(`${REPOE_ROOT}/${filename}`, {
    headers: { "User-Agent": "PoEUpgradeOptimizer item-art sync" },
  });
  if (!response.ok) throw new Error(`Unable to download ${filename}: ${response.status}`);
  return response.json();
}

function artRecord(item) {
  const ddsFile = item.visual_identity?.dds_file;
  if (!ddsFile?.startsWith("Art/2DItems/")) return null;
  return {
    path: ddsFile.replace(/\.dds$/i, ".png"),
    width: Number(item.inventory_width) || 1,
    height: Number(item.inventory_height) || 1,
  };
}

function sortedRecord(value) {
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)));
}

const [baseItems, uniqueItems] = await Promise.all([loadJson("base_items.json"), loadJson("uniques.json")]);
const bases = {};
const uniques = {};

for (const [, item] of Object.entries(baseItems).sort(([left], [right]) => {
  const leftPenalty = /Royale|Test|Unused/i.test(left) ? 1 : 0;
  const rightPenalty = /Royale|Test|Unused/i.test(right) ? 1 : 0;
  return leftPenalty - rightPenalty || left.localeCompare(right);
})) {
  if (!item.name || !EQUIPMENT_CLASSES.has(item.item_class) || bases[item.name]) continue;
  const art = artRecord(item);
  if (art) bases[item.name] = art;
}

for (const item of Object.values(uniqueItems)) {
  if (!item.name || !EQUIPMENT_CLASSES.has(item.item_class) || item.is_alternate_art || uniques[item.name]) continue;
  const art = artRecord(item);
  if (art) uniques[item.name] = art;
}

// These 3.27 wand bases post-date the current RePoE snapshot and intentionally reuse classic wand art.
bases["Blasting Wand"] = { path: "Art/2DItems/Weapons/OneHandWeapons/Wands/Wand2.png", width: 1, height: 3 };
bases["Kinetic Wand"] = { path: "Art/2DItems/Weapons/OneHandWeapons/Wands/Wand3.png", width: 1, height: 3 };
bases["Somatic Wand"] = { path: "Art/2DItems/Weapons/OneHandWeapons/Wands/Wand4.png", width: 1, height: 3 };

const outputPath = path.join(process.cwd(), "src", "data", "item-art.json");
await writeFile(outputPath, `${JSON.stringify({ bases: sortedRecord(bases), uniques: sortedRecord(uniques) })}\n`, "utf8");
console.log(`Wrote ${Object.keys(bases).length} base and ${Object.keys(uniques).length} unique item art records to ${outputPath}`);
