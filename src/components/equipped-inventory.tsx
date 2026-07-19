"use client";

import Image from "next/image";
import { useState } from "react";
import { Circle, Crown, Footprints, Gem, Hand, PackageSearch, Shield, Shirt, Sword } from "lucide-react";
import { Build, EquipmentSlot, Item } from "@/models";
import { getItemArtworkCandidates } from "@/lib/item-art";
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
  weapon: "col-start-1 col-span-2 row-start-2 row-span-4",
  offhand: "col-start-7 col-span-2 row-start-2 row-span-4",
  helmet: "col-start-4 col-span-2 row-start-1 row-span-2",
  bodyArmour: "col-start-4 col-span-2 row-start-3 row-span-3",
  gloves: "col-start-2 col-span-2 row-start-6 row-span-2",
  boots: "col-start-6 col-span-2 row-start-6 row-span-2",
  amulet: "col-start-6 row-start-2",
  ring1: "col-start-3 row-start-3",
  ring2: "col-start-6 row-start-3",
  belt: "col-start-4 col-span-2 row-start-6",
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
    className="max-h-[82%] max-w-[82%] object-contain drop-shadow-[0_8px_9px_rgba(0,0,0,0.9)] transition-transform duration-200 group-hover:scale-[1.04]"
    onError={() => setCandidateIndex((current) => current + 1)}
  />;
}

function tooltipLines(item: Item) {
  if (!item.rawText) return item.modifiers.map((modifier) => modifier.label);

  let skippedName = false;
  let skippedBase = false;
  return item.rawText.split(/\r?\n/).map((line) => line.trim()).filter((line) => {
    if (!line || line === "--------" || /^Item Class:/i.test(line) || /^Rarity:/i.test(line)) return false;
    if (!skippedName && line === item.name) { skippedName = true; return false; }
    if (!skippedBase && line === item.baseType) { skippedBase = true; return false; }
    return true;
  });
}

function EquippedItem({ item, slot, reflected }: { item: Item; slot: EquipmentSlot; reflected: boolean }) {
  const empty = item.id.startsWith("empty-");
  const rarity = rarityStyles[item.rarity];
  const lines = tooltipLines(item);

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
    <TooltipContent side="right" sideOffset={12} collisionPadding={16} className={cn("block w-[22rem] max-w-[calc(100vw-2rem)] items-stretch gap-0 overflow-hidden border bg-[#070d15] p-0 text-foreground shadow-[0_24px_80px_rgba(0,0,0,0.8)]", rarity.border)}>
      <div className={cn("border-b px-4 py-3 text-center", rarity.border, item.rarity === "rare" ? "bg-amber-300/[0.04]" : item.rarity === "unique" ? "bg-orange-500/[0.05]" : "bg-sky-400/[0.04]")}> 
        <p className={cn("font-heading text-base font-semibold", rarity.name)}>{empty ? slotLabels[slot] : item.name}</p>
        <p className="mt-0.5 text-[11px] text-slate-400">{item.baseType}</p>
        {!empty && <div className="mt-2 flex flex-wrap justify-center gap-1.5"><Badge variant="outline" className="h-5 text-[9px] capitalize">{item.rarity}</Badge>{item.itemClass && <Badge variant="outline" className="h-5 text-[9px]">{item.itemClass}</Badge>}{reflected && <Badge className="h-5 bg-sky-400/15 text-[9px] text-sky-200">Kalandra copy</Badge>}</div>}
      </div>
      <div className="max-h-[min(32rem,70vh)] overflow-y-auto px-4 py-3 text-center text-[11px] leading-4">
        {lines.length > 0 ? <div className="space-y-1.5">{lines.map((line, index) => <p key={`${line}-${index}`} className={cn(/^\w[^%+\d]*:$/.test(line) || /^(?:Requirements|Implicits):?/i.test(line) ? "text-slate-400" : "text-sky-200")}>{line}</p>)}</div> : <p className="text-slate-400">{empty ? "Nothing is equipped in this slot." : "No stat lines were included in the import."}</p>}
      </div>
      <div className="border-t border-slate-700/60 bg-slate-950/70 px-4 py-2 text-center text-[9px] text-slate-500">Hover or focus any equipped item to inspect it</div>
    </TooltipContent>
  </Tooltip>;
}

export function EquippedInventory({ build }: { build: Build }) {
  return <TooltipProvider delayDuration={140}>
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div><p className="text-sm font-medium text-foreground">Active equipment set</p><p className="mt-0.5 text-xs text-muted-foreground">Hover an item to see every imported stat line.</p></div>
        <Badge variant="outline" className="border-sky-400/25 bg-sky-400/5 text-sky-200">{Object.values(build.equipment).filter((item) => !item.id.startsWith("empty-")).length} items equipped</Badge>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-sky-300/10 bg-[#07111b] p-2 shadow-[inset_0_0_80px_rgba(24,93,130,0.09)]">
        <div className="relative mx-auto aspect-[8/7] w-full min-w-[560px] max-w-[680px] overflow-hidden rounded-xl border border-slate-700/40 bg-[linear-gradient(rgba(73,118,145,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(73,118,145,0.045)_1px,transparent_1px),radial-gradient(circle_at_50%_42%,rgba(32,91,123,0.22),transparent_34%),linear-gradient(145deg,#101d29,#071019_70%)] bg-[size:32px_32px,32px_32px,auto,auto] p-5">
          <div aria-hidden="true" className="pointer-events-none absolute top-[8%] bottom-[9%] left-1/2 w-[27%] -translate-x-1/2 rounded-[45%_45%_30%_30%] border border-sky-300/[0.04] bg-sky-300/[0.025] blur-[1px]" />
          <div className="relative grid size-full grid-cols-8 grid-rows-7 gap-2">
            {(Object.keys(slotLabels) as EquipmentSlot[]).map((slot) => <EquippedItem key={slot} slot={slot} item={build.equipment[slot]} reflected={build.kalandrasTouch?.touchSlot === slot} />)}
          </div>
        </div>
      </div>
    </div>
  </TooltipProvider>;
}
