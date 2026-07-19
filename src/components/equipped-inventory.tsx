"use client";

import Image from "next/image";
import { useState } from "react";
import { Circle, Crown, Footprints, Gem, Hand, Link2, PackageSearch, Shield, Shirt, Sword } from "lucide-react";
import { Build, EquipmentSlot, Item } from "@/models";
import { getItemArtworkCandidates } from "@/lib/item-art";
import { getSkillGemArtwork } from "@/lib/skill-gem-art";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const slotLabels: Record<EquipmentSlot, string> = {
  weapon: "Weapon",
  offhand: "Offhand",
  helmet: "Helmet",
  bodyArmour: "Body Armour",
  gloves: "Gloves",
  boots: "Boots",
  amulet: "Amulet",
  ring1: "Ring 1",
  ring2: "Ring 2",
  belt: "Belt",
};

const slotLayout: Record<EquipmentSlot, string> = {
  weapon: "col-start-1 col-span-2 row-start-1 row-span-4",
  offhand: "col-start-6 col-span-2 row-start-1 row-span-4",
  helmet: "col-start-3 col-span-2 row-start-1 row-span-2",
  bodyArmour: "col-start-3 col-span-2 row-start-3 row-span-3",
  gloves: "col-start-1 col-span-2 row-start-5 row-span-2",
  boots: "col-start-5 col-span-2 row-start-5 row-span-2",
  amulet: "col-start-5 row-start-1",
  ring1: "col-start-5 row-start-2",
  ring2: "col-start-5 row-start-3",
  belt: "col-start-3 col-span-2 row-start-6",
};

const rarityStyles: Record<Item["rarity"], { border: string; glow: string; name: string }> = {
  normal: { border: "border-slate-500/50", glow: "shadow-slate-950/30", name: "text-slate-200" },
  magic: { border: "border-indigo-400/55", glow: "shadow-indigo-500/10", name: "text-indigo-300" },
  rare: { border: "border-amber-300/55", glow: "shadow-amber-400/10", name: "text-amber-200" },
  unique: { border: "border-orange-500/60", glow: "shadow-orange-500/10", name: "text-orange-400" },
};

const slotIcons = {
  weapon: Sword,
  offhand: Shield,
  helmet: Crown,
  bodyArmour: Shirt,
  gloves: Hand,
  boots: Footprints,
  amulet: Gem,
  ring1: Circle,
  ring2: Circle,
  belt: PackageSearch,
} satisfies Record<EquipmentSlot, typeof Sword>;

function ItemArtwork({ item, slot }: { item: Item; slot: EquipmentSlot }) {
  const candidates = getItemArtworkCandidates(item);
  const [candidateIndex, setCandidateIndex] = useState(0);
  const Icon = slotIcons[slot];

  const source = candidates[candidateIndex];
  if (!source) return <Icon aria-hidden="true" className="size-8 text-sky-200/30" />;

  return <Image
    key={source}
    src={source}
    alt={`${item.baseType} inventory artwork`}
    width={156}
    height={234}
    unoptimized
    draggable={false}
    className="max-h-[76%] max-w-[76%] object-contain drop-shadow-[0_8px_9px_rgba(0,0,0,0.9)] transition-transform duration-200 group-hover:scale-[1.04]"
    onError={() => setCandidateIndex((current) => current + 1)}
  />;
}

function tooltipGroups(item: Item) {
  if (!item.rawText) return [item.modifiers.map((modifier) => modifier.label.replace(/\{crafted\}/gi, "").trim())];

  const groups: string[][] = [[]];
  let skippedName = false;
  let skippedBase = false;
  let skipUniqueIdValue = false;

  for (const rawLine of item.rawText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line === "--------") {
      if (groups.at(-1)?.length) groups.push([]);
      continue;
    }
    if (skipUniqueIdValue) {
      skipUniqueIdValue = false;
      continue;
    }
    if (/^Unique ID:/i.test(line)) {
      skipUniqueIdValue = !line.slice(line.indexOf(":") + 1).trim();
      continue;
    }
    if (/^(?:Item Class|Rarity|ArmourBasePercentile):/i.test(line)) continue;
    if (!skippedName && line === item.name) { skippedName = true; continue; }
    if (!skippedBase && line === item.baseType) { skippedBase = true; continue; }

    const cleanLine = line.replace(/\{crafted\}/gi, "").trim();
    if (cleanLine) groups.at(-1)?.push(cleanLine);
  }

  return groups.filter((group) => group.length > 0);
}

function EquippedItem({ item, slot, reflected }: { item: Item; slot: EquipmentSlot; reflected: boolean }) {
  const empty = item.id.startsWith("empty-");
  const rarity = rarityStyles[item.rarity];
  const groups = tooltipGroups(item);

  return <Tooltip>
    <TooltipTrigger asChild>
      <button
        type="button"
        className={cn(
          "group relative isolate flex min-h-0 min-w-0 flex-col items-center justify-center overflow-hidden rounded-sm border bg-[#101b25]/90 p-1 outline-none transition-all duration-200",
          "before:absolute before:inset-0 before:-z-10 before:bg-[radial-gradient(circle_at_50%_35%,rgba(92,145,177,0.17),transparent_68%)]",
          "hover:z-10 hover:-translate-y-0.5 hover:border-sky-300/80 hover:bg-[#142433] focus-visible:z-10 focus-visible:border-sky-300 focus-visible:ring-2 focus-visible:ring-sky-300/35",
          "shadow-[inset_0_0_24px_rgba(0,0,0,0.58),0_8px_20px_-12px_rgba(0,0,0,0.95)]",
          empty ? "border-dashed border-slate-600/45 opacity-55" : cn(rarity.border, rarity.glow),
          slotLayout[slot],
        )}
        aria-label={`${slotLabels[slot]}: ${empty ? "empty" : `${item.name}, ${item.baseType}`}. View all item stats.`}
      >
        <span className="absolute top-1 left-1.5 z-10 max-w-[calc(100%-0.75rem)] truncate rounded bg-slate-950/75 px-1.5 py-0.5 text-[8px] font-semibold tracking-[0.08em] text-sky-100/75 uppercase backdrop-blur-sm">{slotLabels[slot]}</span>
        <ItemArtwork key={`${item.id}-${item.name}-${item.baseType}`} item={item} slot={slot} />
        {!empty && <span className={cn("absolute right-1.5 bottom-1 left-1.5 z-10 truncate rounded bg-slate-950/80 px-1 py-0.5 text-center text-[8px] font-semibold backdrop-blur-sm", rarity.name)}>{item.name}</span>}
        {reflected && <span className="absolute top-1 right-1 z-20 rounded-full border border-sky-300/30 bg-sky-950/90 px-1.5 py-0.5 text-[7px] font-bold tracking-wide text-sky-200 uppercase">Mirrored</span>}
      </button>
    </TooltipTrigger>
    <TooltipContent side="right" sideOffset={12} collisionPadding={16} className={cn("block w-[24rem] max-w-[calc(100vw-2rem)] items-stretch gap-0 overflow-hidden rounded-xl border bg-[#070d15]/98 p-0 text-foreground shadow-[0_24px_80px_rgba(0,0,0,0.85)] backdrop-blur-xl", rarity.border)}>
      <div className={cn("border-b px-5 py-4 text-center", rarity.border, item.rarity === "rare" ? "bg-gradient-to-b from-amber-300/[0.09] to-transparent" : item.rarity === "unique" ? "bg-gradient-to-b from-orange-500/[0.1] to-transparent" : "bg-gradient-to-b from-sky-400/[0.08] to-transparent")}>
        <p className={cn("font-heading text-lg font-semibold tracking-wide", rarity.name)}>{empty ? slotLabels[slot] : item.name}</p>
        <p className="mt-1 text-xs text-slate-400">{item.baseType}</p>
        {!empty && <div className="mt-2 flex flex-wrap justify-center gap-1.5"><Badge variant="outline" className="h-5 text-[9px] capitalize">{item.rarity}</Badge>{item.itemClass && <Badge variant="outline" className="h-5 text-[9px]">{item.itemClass}</Badge>}{reflected && <Badge className="h-5 bg-sky-400/15 text-[9px] text-sky-200">Kalandra copy</Badge>}</div>}
      </div>
      <div className="max-h-[min(34rem,70vh)] overflow-y-auto overscroll-contain px-3 py-3 text-center text-[11px] leading-[1.45] [scrollbar-color:rgba(125,211,252,0.25)_transparent]">
        {groups.length > 0 ? <div className="space-y-2">{groups.map((group, groupIndex) => <div key={`${group[0]}-${groupIndex}`} className="rounded-lg border border-slate-700/45 bg-slate-900/35 px-3 py-2.5 shadow-inner shadow-black/20">{group.map((line, lineIndex) => <p key={`${line}-${lineIndex}`} className={cn("break-words py-0.5", /^\w[^%+\d]*:$/.test(line) || /^(?:Requirements|Implicits):?/i.test(line) ? "font-medium tracking-wide text-slate-400" : "text-sky-100")}>{line}</p>)}</div>)}</div> : <p className="py-4 text-slate-400">{empty ? "Nothing is equipped in this slot." : "No stat lines were included in the import."}</p>}
      </div>
      <div className="border-t border-slate-700/60 bg-slate-950/70 px-4 py-2 text-center text-[9px] tracking-wide text-slate-500">Imported item details</div>
    </TooltipContent>
  </Tooltip>;
}

function SkillGemPanel({ build }: { build: Build }) {
  const groups = build.skillGroups ?? [];
  return <aside className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-sky-300/10 bg-[linear-gradient(180deg,rgba(16,31,44,0.94),rgba(5,13,21,0.98))] shadow-[inset_0_0_45px_rgba(24,93,130,0.08)]">
    <div className="border-b border-sky-300/10 px-4 py-3">
      <div className="flex items-center gap-2"><Gem className="size-4 text-sky-300" /><p className="text-sm font-semibold text-sky-100">Skills & supports</p></div>
      <p className="mt-1 text-[10px] leading-4 text-slate-500">Linked gems from your active PoB skill set</p>
    </div>
    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 [scrollbar-color:rgba(125,211,252,0.2)_transparent]">
      {groups.length ? groups.map((group) => <div key={group.id} className={cn("rounded-lg border p-2.5", group.isMain ? "border-amber-300/30 bg-amber-300/[0.05]" : "border-slate-700/50 bg-slate-950/35")}>
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="min-w-0"><p className={cn("truncate text-[11px] font-semibold", group.isMain ? "text-amber-200" : "text-sky-100")}>{group.label}</p>{group.slot && <p className="mt-0.5 truncate text-[9px] uppercase tracking-wide text-slate-500">{group.slot}</p>}</div>
          <Badge variant="outline" className="h-4 shrink-0 px-1.5 text-[8px]">{group.gems.length}L</Badge>
        </div>
        <div className="space-y-1.5">{group.gems.map((gem, index) => <div key={`${gem.name}-${index}`} className="relative flex items-center gap-2">
          {index > 0 && <span aria-hidden="true" className="absolute -top-1.5 left-[9px] h-1.5 border-l border-sky-300/35" />}
          <SkillGemArtwork name={gem.name} isSupport={gem.isSupport} />
          <div className="min-w-0 flex-1"><p className="truncate text-[10px] text-slate-200" title={gem.name}>{gem.name}</p><p className="text-[8px] text-slate-500">Level {gem.level || "?"}{gem.quality > 0 ? ` · ${gem.quality}% quality` : ""}</p></div>
          {index > 0 && <Link2 className="size-2.5 shrink-0 text-sky-300/35" />}
        </div>)}</div>
      </div>) : <div className="grid min-h-32 place-items-center rounded-lg border border-dashed border-slate-700/50 px-4 text-center"><div><Gem className="mx-auto size-5 text-slate-600" /><p className="mt-2 text-[11px] text-slate-400">No skill gems were included in this import.</p></div></div>}
    </div>
  </aside>;
}

function SkillGemArtwork({ name, isSupport }: { name: string; isSupport: boolean }) {
  const [failed, setFailed] = useState(false);
  const source = getSkillGemArtwork(name);
  return <span className={cn("relative grid size-7 shrink-0 place-items-center overflow-hidden rounded-md border", isSupport ? "border-sky-300/45 bg-sky-400/10 text-sky-300" : "border-emerald-300/45 bg-emerald-400/10 text-emerald-300")}>
    {source && !failed ? <Image src={source} alt={`${name} gem artwork`} width={28} height={28} unoptimized className="size-full object-cover" onError={() => setFailed(true)} /> : <Gem className="size-3" />}
  </span>;
}

export function EquippedInventory({ build }: { build: Build }) {
  return <TooltipProvider delayDuration={140}>
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div><p className="text-sm font-medium text-foreground">Active equipment set</p><p className="mt-0.5 text-xs text-muted-foreground">Hover an item to see every imported stat line.</p></div>
        <Badge variant="outline" className="border-sky-400/25 bg-sky-400/5 text-sky-200">{Object.values(build.equipment).filter((item) => !item.id.startsWith("empty-")).length} items equipped</Badge>
      </div>
      <div className="overflow-hidden rounded-2xl border border-sky-300/10 bg-[#07111b] p-2 shadow-[inset_0_0_80px_rgba(24,93,130,0.09)] sm:p-3">
        <div className="grid items-stretch gap-3 md:grid-cols-[minmax(0,3fr)_minmax(200px,1fr)] xl:grid-cols-[minmax(0,760px)_minmax(220px,1fr)]">
          <div className="relative aspect-[7/6] w-full overflow-hidden rounded-xl border border-slate-700/40 bg-[linear-gradient(rgba(73,118,145,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(73,118,145,0.045)_1px,transparent_1px),radial-gradient(circle_at_50%_42%,rgba(32,91,123,0.22),transparent_34%),linear-gradient(145deg,#101d29,#071019_70%)] bg-[size:32px_32px,32px_32px,auto,auto] p-2 sm:p-3">
            <div aria-hidden="true" className="pointer-events-none absolute top-[8%] bottom-[9%] left-1/2 w-[27%] -translate-x-1/2 rounded-[45%_45%_30%_30%] border border-sky-300/[0.04] bg-sky-300/[0.025] blur-[1px]" />
            <div className="relative grid size-full grid-cols-7 grid-rows-6 gap-1 sm:gap-1.5">
              {(Object.keys(slotLabels) as EquipmentSlot[]).map((slot) => <EquippedItem key={slot} slot={slot} item={build.equipment[slot]} reflected={build.kalandrasTouch?.touchSlot === slot} />)}
            </div>
          </div>
          <SkillGemPanel build={build} />
        </div>
      </div>
    </div>
  </TooltipProvider>;
}
