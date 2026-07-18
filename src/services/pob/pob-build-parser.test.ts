import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { decodePobCode, parsePobXml } from "./pob-build-parser";

const xml = `<?xml version="1.0"?><PathOfBuilding>
<Build mainSocketGroup="1" ascendClassName="Juggernaut" level="98" className="Marauder">
  <PlayerStat value="6701956" stat="CombinedDPS"/><PlayerStat value="46578" stat="TotalEHP"/>
  <PlayerStat value="12673" stat="PhysicalMaximumHitTaken"/><PlayerStat value="42688" stat="FireMaximumHitTaken"/>
  <PlayerStat value="33540" stat="ColdMaximumHitTaken"/><PlayerStat value="35000" stat="LightningMaximumHitTaken"/>
  <PlayerStat value="8908" stat="ChaosMaximumHitTaken"/><PlayerStat value="8431" stat="Life"/>
</Build>
<Skills activeSkillSet="1"><SkillSet id="1"><Skill><Gem nameSpec="Kinetic Blast" skillId="KineticBlast"/></Skill></SkillSet></Skills>
<Import importLink="https://example.com/profile/ActualCharacter"/>
<Items activeItemSet="2"><Item id="10">
Rarity: RARE
Glyph Chant
Kinetic Wand
Item Level: 85
Implicits: 1
Adds 82 to 136 Chaos Damage
17% increased Attack Speed
</Item><Item id="11">
Rarity: UNIQUE
Mageblood
Heavy Belt
Item Level: 85
Implicits: 1
+40 to Strength
</Item>
<ItemSet id="1"><Slot itemId="0" name="Weapon 1"/></ItemSet>
<ItemSet id="2"><Slot itemId="10" name="Weapon 1"/><Slot itemId="11" name="Belt"/></ItemSet></Items>
</PathOfBuilding>`;

describe("PoB build parser", () => {
  it("decodes URL-safe base64 zlib exports", async () => {
    const code = deflateSync(xml).toString("base64url");
    expect(await decodePobCode(code)).toBe(xml);
  });

  it("reads character details, metrics, main skill, and the active item set", () => {
    const build = parsePobXml(xml);
    expect(build.character).toMatchObject({ name: "ActualCharacter", className: "Marauder", ascendancy: "Juggernaut", level: 98, mainSkill: "Kinetic Blast" });
    expect(build.metrics).toMatchObject({ totalDps: 6701956, effectiveHitPool: 46578, elementalMaxHit: 33540 });
    expect(build.equipment.weapon).toMatchObject({ name: "Glyph Chant", baseType: "Kinetic Wand", rarity: "rare" });
    expect(build.equipment.weapon.modifiers.map((modifier) => modifier.label)).toContain("Adds 82 to 136 Chaos Damage");
    expect(build.equipment.belt).toMatchObject({ name: "Mageblood", baseType: "Heavy Belt", rarity: "unique" });
  });
});
