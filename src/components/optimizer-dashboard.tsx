"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import {
  Activity, ArrowRight, Calculator, Check, CheckCircle2, CircleDollarSign, ClipboardPaste, Copy, DatabaseZap, Gauge,
  ExternalLink, HeartPulse, Import, Loader2, LockKeyhole, PackageSearch, Scale, Search, Shield,
  Plus, RotateCcw, SlidersHorizontal, Sparkles, Sword, Trash2, WandSparkles, Wifi, WifiOff, Zap,
} from "lucide-react";
import { Build, CandidateEvaluation, CurrencyAmount, DpsMetric, EQUIPMENT_SLOTS, EquipmentSlot, LeagueResponse, OptimizationGoal, OptimizationResult, PoeLeague, TradeItem, UpgradeRecommendation } from "@/models";
import { MvpPobCalculationService } from "@/services/pob/pob-calculation-service";
import { isPermanentLeague } from "@/services/league/league-service";
import { formatNumber, formatPrice, percentChange } from "@/lib/metrics";
import { isManualCandidateCompatible, parseCopiedTradeItem } from "@/services/trade/manual-trade-market-service";
import { createEncodedTradeSearchUrl } from "@/services/trade/trade-search-service";
import { applyPobCalculatedWeights, createWeightedTradeSearch, customizeWeightedTradeSearch, type WeightedTradeOption, type WeightedTradeSearchCustomization, type WeightedTradeSearchDraft } from "@/services/trade/weighted-search-service";
import { currentItemStatValue, getManualTradeAffixes, getManualWeightedStats, WEIGHT_PRESETS, type WeightPreset } from "@/services/trade/weighted-stat-catalog";
import { type PobCalculatedWeightResult } from "@/services/pob/pob-weight-calculation-service";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { EquippedInventory } from "@/components/equipped-inventory";

const pobService = new MvpPobCalculationService();
const slotLabels: Record<EquipmentSlot, string> = { weapon: "Weapon", offhand: "Offhand", helmet: "Helmet", bodyArmour: "Body Armour", gloves: "Gloves", boots: "Boots", amulet: "Amulet", ring1: "Ring 1", ring2: "Ring 2", belt: "Belt" };
const fixedTradeClassLabels: Partial<Record<EquipmentSlot, string>> = { helmet: "Helmets", bodyArmour: "Body Armours", gloves: "Gloves", boots: "Boots", amulet: "Amulets", ring1: "Rings", ring2: "Rings", belt: "Belts" };
const tradeCategoryLabels: Record<string, string> = {
  "weapon.wand": "Wands", "weapon.bow": "Bows", "weapon.claw": "Claws", "weapon.dagger": "Daggers",
  "weapon.runedagger": "Rune Daggers", "weapon.oneaxe": "One Hand Axes", "weapon.onemace": "One Hand Maces",
  "weapon.onesword": "One Hand Swords", "weapon.rapier": "Thrusting One Hand Swords", "weapon.sceptre": "Sceptres",
  "weapon.staff": "Staves", "weapon.warstaff": "Warstaves", "weapon.twoaxe": "Two Hand Axes",
  "weapon.twomace": "Two Hand Maces", "weapon.twosword": "Two Hand Swords", "weapon.rod": "Fishing Rods",
  "armour.shield": "Shields", "accessory.quiver": "Quivers", "armour.helmet": "Helmets", "armour.chest": "Body Armours",
  "armour.gloves": "Gloves", "armour.boots": "Boots", "accessory.amulet": "Amulets", "accessory.ring": "Rings",
  "accessory.belt": "Belts",
};
const defaultSlots: EquipmentSlot[] = ["weapon", "boots", "amulet", "ring1", "ring2"];
const fallbackLeague: PoeLeague = { id: "Standard", name: "Standard", realm: "pc", startAt: "2013-01-23T21:00:00Z", endAt: null };
const dpsMetricLabels: Record<DpsMetric, string> = {
  FullDPS: "Full DPS",
  CombinedDPS: "Combined DPS",
  MinionCombinedDPS: "Minion combined DPS",
  TotalDPS: "Total DPS",
};
const dpsMetricLabel = (metric: DpsMetric | undefined) => dpsMetricLabels[metric ?? "CombinedDPS"];

interface ManualCandidate {
  id: string;
  slot: EquipmentSlot;
  rawText: string;
  price: CurrencyAmount;
  item: TradeItem;
}

interface OptimizationJobStatus {
  jobId: string;
  state: "queued" | "running" | "completed" | "failed" | "cancelled";
  position: number;
  queued: number;
  active: number;
  league: string;
  pollAfterMs: number;
  result?: OptimizationResult;
  error?: string;
}

const queueClientKey = "poe-optimizer-queue-client";
const activeJobKey = "poe-optimizer-active-job";

function queueClientId() {
  const existing = window.localStorage.getItem(queueClientKey);
  if (existing) return existing;
  const created = crypto.randomUUID();
  window.localStorage.setItem(queueClientKey, created);
  return created;
}

function waitForNextPoll(milliseconds: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Polling was cancelled.", "AbortError"));
      return;
    }
    const abort = () => {
      window.clearTimeout(timer);
      reject(new DOMException("Polling was cancelled.", "AbortError"));
    };
    const timer = window.setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, milliseconds);
    signal?.addEventListener("abort", abort, { once: true });
  });
}

async function pollOptimizationJob(
  jobId: string,
  clientId: string,
  onStatus: (status: OptimizationJobStatus) => void,
  signal?: AbortSignal,
) {
  while (!signal?.aborted) {
    const response = await fetch(`/api/optimize/jobs/${encodeURIComponent(jobId)}`, {
      headers: { "x-poe-client-id": clientId },
      cache: "no-store",
      signal,
    });
    const status = await response.json() as OptimizationJobStatus & { error?: string };
    if (!response.ok) throw new Error(status.error ?? "The saved comparison could not be loaded.");
    onStatus(status);
    if (status.state === "completed") {
      if (!status.result) throw new Error("The comparison completed without returning ranked results.");
      return status;
    }
    if (status.state === "failed" || status.state === "cancelled") throw new Error(status.error ?? `The comparison ${status.state}.`);
    await waitForNextPoll(status.pollAfterMs || 3_000, signal);
  }
  throw new DOMException("Polling was cancelled.", "AbortError");
}

async function copyText(value: string) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // Fall back to a temporary selection for browsers that deny Clipboard API access.
    }
  }

  const textArea = document.createElement("textarea");
  textArea.value = value;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";
  document.body.appendChild(textArea);
  textArea.select();
  textArea.setSelectionRange(0, textArea.value.length);
  const copied = document.execCommand("copy");
  document.body.removeChild(textArea);
  if (!copied) throw new Error("Clipboard access was denied.");
}

function SectionHeading({ number, eyebrow, title, description, icon: Icon }: { number: string; eyebrow: string; title: string; description?: string; icon: typeof Activity }) {
  return <div className="flex items-center gap-4">
    <div className="grid size-11 shrink-0 place-items-center rounded-full border border-primary/25 bg-primary/10 text-sm font-semibold text-primary shadow-inner shadow-primary/5">{number}</div>
    <div className="min-w-0"><p className="text-xs font-medium text-primary/80">{eyebrow}</p><h2 className="mt-0.5 flex items-center gap-2 font-heading text-2xl font-semibold"><Icon className="size-4 text-primary" />{title}</h2>{description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}</div>
  </div>;
}

function Delta({ value, suffix = "%" }: { value: number; suffix?: string }) {
  return <span className={cn("font-mono font-semibold", value > 0 ? "text-emerald-400" : value < 0 ? "text-red-400" : "text-muted-foreground")}>{value > 0 ? "+" : ""}{value.toFixed(1)}{suffix}</span>;
}

function MetricComparison({ label, before, after }: { label: string; before: number; after: number }) {
  const delta = after - before;
  const percent = percentChange(before, delta);
  const direction = delta > 0 ? "text-emerald-400" : delta < 0 ? "text-red-400" : "text-muted-foreground";
  return <div className="min-w-0 rounded-xl border border-border bg-background/40 p-3">
    <p className="text-[10px] font-medium text-muted-foreground">{label}</p>
    <p className="mt-1 flex items-baseline gap-1.5 whitespace-nowrap font-mono text-[13px] font-semibold tabular-nums" title={`${before} to ${after}`}><span>{formatNumber(before)}</span><span className="shrink-0 text-muted-foreground">→</span><span>{formatNumber(after)}</span></p>
    <p className={cn("mt-1 font-mono text-xs font-semibold", direction)}>{delta > 0 ? "+" : ""}{formatNumber(delta)} <span className="font-sans font-normal">({percent > 0 ? "+" : ""}{percent.toFixed(2)}%)</span></p>
  </div>;
}

function Metric({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: typeof Activity }) {
  return <div className="space-y-2 p-5"><div className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Icon className="size-3.5 text-primary" />{label}</div><p className="font-mono text-2xl font-semibold tracking-tight">{value}</p><p className="truncate text-xs text-muted-foreground">{detail}</p></div>;
}

function LeagueSelect({ leagues, value, currentLeague, loading, onChange }: { leagues: PoeLeague[]; value: string; currentLeague: string; loading: boolean; onChange: (value: string) => void }) {
  const challenge = leagues.filter((league) => !isPermanentLeague(league));
  const permanent = leagues.filter(isPermanentLeague);
  if (loading) return <Skeleton className="h-9 w-full" />;
  return <Select value={value} onValueChange={onChange}>
    <SelectTrigger className="h-10 w-full bg-background/60"><SelectValue placeholder="Select league" /></SelectTrigger>
    <SelectContent position="popper" className="max-h-80">
      {challenge.length > 0 && <SelectGroup><SelectLabel>Current challenge leagues</SelectLabel>{challenge.map((league) => <SelectItem key={league.id} value={league.id}>{league.name}{league.id === currentLeague ? " (Current)" : ""}</SelectItem>)}</SelectGroup>}
      {challenge.length > 0 && permanent.length > 0 && <SelectSeparator />}
      <SelectGroup><SelectLabel>Permanent leagues</SelectLabel>{permanent.map((league) => <SelectItem key={league.id} value={league.id}>{league.name}</SelectItem>)}</SelectGroup>
    </SelectContent>
  </Select>;
}

function ItemPreview({ recommendation }: { recommendation: UpgradeRecommendation }) {
  return <TooltipProvider delayDuration={160}>
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="group grid h-20 w-16 place-items-center rounded-xl border border-primary/20 bg-background/65 p-1 outline-none transition-all hover:-translate-y-0.5 hover:border-primary/60 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30" aria-label={`View all stats for ${recommendation.item.name}`}>
          {recommendation.item.imageUrl
            ? <Image src={recommendation.item.imageUrl} alt={`${recommendation.item.baseType} inventory artwork`} width={64} height={80} className="max-h-[4.5rem] w-auto object-contain drop-shadow-[0_4px_8px_rgba(0,0,0,0.8)] transition-transform group-hover:scale-105" />
            : <PackageSearch className="size-7 text-primary/70 transition-transform group-hover:scale-105" />}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={10} className="block w-80 max-w-[calc(100vw-2rem)] items-stretch gap-0 overflow-hidden border border-sky-500/35 bg-[#080d18] p-0 text-foreground shadow-2xl">
        <div className="border-b border-sky-500/25 bg-sky-500/5 px-4 py-3 text-center">
          <p className="font-heading text-base font-semibold text-sky-200">{recommendation.item.name}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{recommendation.item.baseType}</p>
        </div>
        <div className="space-y-1.5 px-4 py-3 text-center text-[11px] leading-4 text-sky-300">
          {recommendation.item.modifiers.map((modifier, index) => <p key={`${modifier.label}-${index}`}>{modifier.label}</p>)}
        </div>
        <div className="flex items-center justify-between border-t border-border/70 bg-background/50 px-4 py-2 font-mono text-[10px]">
          <span className="text-muted-foreground">Listed price</span><span className="text-primary">{formatPrice(recommendation.priceInChaos)}</span>
        </div>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>;
}

function RecommendationCard({ recommendation, baseline, rank, league }: { recommendation: UpgradeRecommendation; baseline: Build["metrics"]; rank: number; league: string }) {
  const dps = percentChange(baseline.totalDps, recommendation.metrics.totalDps - baseline.totalDps);
  const ehp = percentChange(baseline.effectiveHitPool, recommendation.metrics.effectiveHitPool - baseline.effectiveHitPool);
  const tradeHref = recommendation.item.tradeUrl ?? `/api/trade/item?league=${encodeURIComponent(league)}&item=${encodeURIComponent(recommendation.item.id)}`;
  return <Card className="gap-0 overflow-hidden border-white/[0.07] bg-card/90 py-0 shadow-[0_22px_55px_-42px_rgba(0,0,0,0.95)] transition-all hover:-translate-y-0.5 hover:border-primary/35">
    <CardHeader className="grid grid-cols-[auto_1fr_auto] items-start gap-3 border-b border-border/70 px-5 py-5">
      <div className="flex flex-col items-center gap-2"><Badge variant="outline" className="font-mono text-muted-foreground">#{rank.toString().padStart(2, "0")}</Badge><ItemPreview recommendation={recommendation} /></div>
      <div><CardDescription className="text-xs font-medium text-primary">{slotLabels[recommendation.slot]}</CardDescription><CardTitle className="mt-1 font-heading text-xl text-sky-100">{recommendation.item.name}</CardTitle><p className="mt-1 text-xs text-muted-foreground">Instead of {recommendation.currentItem.name}</p></div>
      <Badge className="bg-primary text-primary-foreground">{formatPrice(recommendation.priceInChaos)}</Badge>
    </CardHeader>
    <CardContent className="space-y-4 p-5">
      <div className="grid grid-cols-4 divide-x divide-border rounded-xl border border-border bg-background/40">{[["Damage", <Delta key="dps" value={dps} />], ["EHP", <Delta key="ehp" value={ehp} />], ["Phys. hit", <Delta key="phys" value={percentChange(baseline.physicalMaxHit, recommendation.metrics.physicalMaxHit - baseline.physicalMaxHit)} />], ["Score", <span key="score" className="font-mono font-semibold">{recommendation.score.toFixed(1)}</span>]].map(([label, value]) => <div key={label as string} className="space-y-1 px-3 py-2"><p className="text-[10px] text-muted-foreground">{label}</p>{value}</div>)}</div>
      <div className="flex items-center justify-between gap-3"><p className="text-[10px] text-muted-foreground">Manually supplied {recommendation.item.baseType}, verified by PoB.</p><Button variant="link" size="sm" asChild className="h-auto shrink-0 px-0 text-xs"><a href={tradeHref} target="_blank" rel="noopener noreferrer" aria-label={`Open the official Path of Exile trade site for ${league}`}>Open PoE Trade<ExternalLink /></a></Button></div>
      <div className="flex flex-wrap gap-2">{recommendation.item.modifiers.slice(0, 2).map((mod) => <Badge variant="secondary" key={mod.label} className="font-normal text-muted-foreground">{mod.label}</Badge>)}</div>
      <Alert className="border-primary/20 bg-primary/5"><Sparkles className="text-primary" /><AlertTitle className="text-sm text-primary">Why this one stands out</AlertTitle><AlertDescription>{recommendation.explanation}</AlertDescription></Alert>
    </CardContent>
  </Card>;
}

function CandidateEvaluationCard({ evaluation, baseline, dpsLabel }: { evaluation: CandidateEvaluation; baseline: Build["metrics"]; dpsLabel: string }) {
  const verdict = {
    upgrade: { label: "Upgrade", card: "border-emerald-500/30", badge: "border-emerald-500/35 bg-emerald-500/10 text-emerald-300" },
    downgrade: { label: "Downgrade", card: "border-red-500/30", badge: "border-red-500/35 bg-red-500/10 text-red-300" },
    mixed: { label: "Mixed trade-off", card: "border-amber-500/30", badge: "border-amber-500/35 bg-amber-500/10 text-amber-200" },
    unchanged: { label: "No measurable change", card: "border-border", badge: "border-border bg-muted/40 text-muted-foreground" },
  }[evaluation.verdict];
  return <Card className={cn("gap-0 overflow-hidden bg-card/70 py-0 shadow-none", verdict.card)}>
    <CardHeader className="flex flex-row items-start justify-between gap-3 border-b border-border/70 px-5 py-4">
      <div className="min-w-0"><CardDescription className="text-xs font-medium text-primary">{slotLabels[evaluation.slot]} · PoB result</CardDescription><CardTitle className="mt-1 truncate font-heading text-base text-sky-100">{evaluation.item.name}</CardTitle><p className="mt-1 text-xs text-muted-foreground">Compared with {evaluation.currentItem.name}</p></div>
      <div className="flex shrink-0 flex-col items-end gap-1.5"><Badge variant="outline" className={verdict.badge}>{verdict.label}</Badge><span className="text-[10px] text-muted-foreground">{evaluation.qualified ? "Selected for your goal" : "Not selected for your goal"}</span></div>
    </CardHeader>
    <CardContent className="space-y-3 p-5">
      <div className="grid gap-2 sm:grid-cols-[1.25fr_1fr_1fr]"><MetricComparison label={dpsLabel} before={baseline.totalDps} after={evaluation.metrics.totalDps} /><MetricComparison label="Effective hit pool" before={baseline.effectiveHitPool} after={evaluation.metrics.effectiveHitPool} /><MetricComparison label="Physical max hit" before={baseline.physicalMaxHit} after={evaluation.metrics.physicalMaxHit} /></div>
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-background/25 px-3 py-2 text-xs"><span className="text-muted-foreground">Goal-weighted score</span><span className="font-mono font-semibold">{evaluation.score.toFixed(2)}</span></div>
      {evaluation.verdict === "unchanged" && <Alert className="border-sky-500/25 bg-sky-500/5"><PackageSearch className="text-sky-300" /><AlertTitle>PoB returned identical results</AlertTitle><AlertDescription>This is not being treated as a downgrade. Check that the candidate can be equipped in the active item set and that PoB&apos;s active skill and configuration are the ones you expect.</AlertDescription></Alert>}
      {!evaluation.qualified && <Alert className="border-amber-500/25 bg-amber-500/5"><PackageSearch className="text-amber-300" /><AlertTitle>Why it wasn&apos;t selected for this goal</AlertTitle><AlertDescription>{evaluation.rejectionReasons.join(" ")}</AlertDescription></Alert>}
    </CardContent>
  </Card>;
}

function WeightedSearchEditor({
  slot,
  draft,
  itemClass,
  league,
  copied,
  availableOptions,
  onWeightChange,
  onToggle,
  onAdd,
  onReset,
  onCopy,
  onDone,
}: {
  slot: EquipmentSlot;
  draft: WeightedTradeSearchDraft;
  itemClass: string;
  league: string;
  copied: boolean;
  availableOptions: WeightedTradeOption[];
  onWeightChange: (id: string, weight: number) => void;
  onToggle: (id: string, enabled: boolean) => void;
  onAdd: (option: WeightedTradeOption, weight: number) => void;
  onReset: () => void;
  onCopy: () => void;
  onDone: () => void;
}) {
  const [statSearch, setStatSearch] = useState("");
  const [statSearchOpen, setStatSearchOpen] = useState(false);
  const [highlightedStat, setHighlightedStat] = useState(0);
  const [addedWeight, setAddedWeight] = useState(1);
  const tradeUrl = createEncodedTradeSearchUrl(league, draft.request);
  const minimumScore = draft.request.query.stats[0].value.min;
  const activeOptions = draft.options.filter((option) => option.weight !== 0).length;
  const normalizedStatSearch = statSearch.trim().toLocaleLowerCase();
  const filteredStatOptions = availableOptions
    .filter((option) => !normalizedStatSearch || `${option.label} ${option.reason}`.toLocaleLowerCase().includes(normalizedStatSearch))
    .slice(0, 8);
  const selectedOption = availableOptions.find((option) => option.label.toLocaleLowerCase() === normalizedStatSearch);
  const chooseStat = (option: WeightedTradeOption) => {
    setStatSearch(option.label);
    setStatSearchOpen(false);
    setHighlightedStat(0);
  };

  return <Card className="gap-0 overflow-hidden border-primary/25 bg-background/55 py-0 shadow-inner sm:col-span-2">
    <CardHeader className="flex flex-row items-start justify-between gap-4 border-b border-border/70 px-5 py-4">
      <div className="min-w-0"><CardDescription className="text-xs font-medium text-primary">{slotLabels[slot]} weighted sum</CardDescription><CardTitle className="mt-1 font-heading text-xl">Tune the stat multipliers</CardTitle><p className="mt-1 text-xs leading-5 text-muted-foreground">These suggestions come from your build and selected goal. Set a stat to 0 to leave it out, or use a negative value to penalize it.</p><p className="mt-2 truncate text-xs"><span className="text-muted-foreground">Item class:</span> {itemClass}</p></div>
      <Badge variant="secondary" className="shrink-0">{activeOptions} active</Badge>
    </CardHeader>
    <CardContent className="space-y-4 p-5">
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card/55 p-4 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-sm font-medium">Current-item score threshold</p><p className="mt-1 text-xs text-muted-foreground">Calculated from the equipped item and active weights. This updates when the multipliers change.</p></div>
        <Input disabled readOnly value={minimumScore} aria-label="Calculated minimum weighted score" className="h-10 w-full bg-background/70 font-mono disabled:cursor-default disabled:opacity-80 sm:w-32" />
      </div>
      <div className="space-y-3 rounded-xl border border-dashed border-primary/30 bg-primary/[0.04] p-4">
        <div><p className="text-sm font-medium">Add another trade stat</p><p className="mt-1 text-xs text-muted-foreground">Only stats compatible with this item class are available.</p></div>
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_7rem_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 z-10 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={statSearchOpen}
              aria-controls={`stat-options-${slot}`}
              value={statSearch}
              placeholder="Search trade stats..."
              autoComplete="off"
              className="h-10 bg-background/70 pl-9"
              onFocus={() => setStatSearchOpen(true)}
              onBlur={() => window.setTimeout(() => setStatSearchOpen(false), 100)}
              onChange={(event) => { setStatSearch(event.target.value); setStatSearchOpen(true); setHighlightedStat(0); }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") { event.preventDefault(); setStatSearchOpen(true); setHighlightedStat((current) => Math.min(current + 1, filteredStatOptions.length - 1)); }
                if (event.key === "ArrowUp") { event.preventDefault(); setHighlightedStat((current) => Math.max(current - 1, 0)); }
                if (event.key === "Escape") setStatSearchOpen(false);
                if (event.key === "Enter" && statSearchOpen && filteredStatOptions[highlightedStat]) { event.preventDefault(); chooseStat(filteredStatOptions[highlightedStat]); }
              }}
            />
            {statSearchOpen && <div id={`stat-options-${slot}`} role="listbox" className="absolute z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-xl">
              {filteredStatOptions.length ? filteredStatOptions.map((option, index) => <button
                key={option.id}
                type="button"
                role="option"
                aria-selected={selectedOption?.id === option.id}
                className={cn("block w-full rounded-md px-3 py-2 text-left", index === highlightedStat ? "bg-accent text-accent-foreground" : "hover:bg-accent/60")}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setHighlightedStat(index)}
                onClick={() => chooseStat(option)}
              ><span className="block text-xs font-medium">{option.label}</span><span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{option.reason}</span></button>) : <p className="px-3 py-4 text-center text-xs text-muted-foreground">No compatible stats match “{statSearch}”.</p>}
            </div>}
          </div>
          <Input type="number" step="0.01" value={addedWeight} onChange={(event) => setAddedWeight(Number(event.target.value) || 0)} aria-label="New stat weight" className="h-10 bg-background/70 text-right font-mono" />
          <Button variant="outline" disabled={!selectedOption} onClick={() => { if (!selectedOption) return; onAdd(selectedOption, addedWeight); setStatSearch(""); }}><Plus />Add stat</Button>
        </div>
      </div>
      <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card/35">
        {draft.options.map((option) => <div key={option.id} className="grid grid-cols-[auto_minmax(0,1fr)_6.5rem] items-center gap-3 p-3 sm:gap-4 sm:px-4">
          <Checkbox checked={option.weight !== 0} onCheckedChange={(checked) => onToggle(option.id, checked === true)} aria-label={`${option.weight !== 0 ? "Disable" : "Enable"} ${option.label}`} />
          <div className="min-w-0"><p className={cn("truncate text-sm font-medium", option.weight === 0 && "text-muted-foreground line-through")}>{option.label}</p><p className="mt-0.5 hidden truncate text-xs text-muted-foreground sm:block">{option.reason}</p></div>
          <div className="relative"><span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 font-mono text-xs text-muted-foreground">×</span><Input type="number" step="0.01" value={option.weight} onChange={(event) => onWeightChange(option.id, Number(event.target.value) || 0)} aria-label={`Weight for ${option.label}`} className="h-9 bg-background/70 pl-6 text-right font-mono" /></div>
        </div>)}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="ghost" className="min-w-0" onClick={onReset}><RotateCcw />Reset</Button>
        <Button variant="outline" className="min-w-0" onClick={onCopy}>{copied ? <Check /> : <Copy />}{copied ? "Link copied" : "Copy link"}</Button>
        <Button variant="outline" className="min-w-0" onClick={onDone}>Done</Button>
        <Button className="min-w-0" asChild><a href={tradeUrl} target="_blank" rel="noopener noreferrer">Open search<ExternalLink /></a></Button>
      </div>
    </CardContent>
  </Card>;
}

export default function OptimizerDashboard() {
  const [pobCode, setPobCode] = useState("");
  const [build, setBuild] = useState<Build | null>(null);
  const [budget, setBudget] = useState(5);
  const [currency, setCurrency] = useState<"chaos" | "divine">("divine");
  const [goal, setGoal] = useState<OptimizationGoal>("balanced");
  const [slots, setSlots] = useState<EquipmentSlot[]>(defaultSlots);
  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [queueStatus, setQueueStatus] = useState<{ state: "connecting" | "queued" | "running"; position: number; queued: number; active: number }>({ state: "connecting", position: 0, queued: 0, active: 0 });
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [optimizationError, setOptimizationError] = useState("");
  const [leagues, setLeagues] = useState<PoeLeague[]>([fallbackLeague]);
  const [league, setLeague] = useState("Standard");
  const [currentLeague, setCurrentLeague] = useState("Standard");
  const [leagueLoading, setLeagueLoading] = useState(true);
  const [leagueSource, setLeagueSource] = useState<LeagueResponse["source"]>("fallback");
  const [candidates, setCandidates] = useState<ManualCandidate[]>([]);
  const [candidateSlot, setCandidateSlot] = useState<EquipmentSlot>(defaultSlots[0]);
  const [candidateText, setCandidateText] = useState("");
  const [candidateError, setCandidateError] = useState("");
  const [copiedWeightedSlot, setCopiedWeightedSlot] = useState<EquipmentSlot | null>(null);
  const [weightedSearchError, setWeightedSearchError] = useState("");
  const [weightEditorSlot, setWeightEditorSlot] = useState<EquipmentSlot | null>(null);
  const [weightPreset, setWeightPreset] = useState<WeightPreset>("auto");
  const [pobCalculatedWeights, setPobCalculatedWeights] = useState<Partial<Record<EquipmentSlot, PobCalculatedWeightResult>>>({});
  const [calculatingWeightSlot, setCalculatingWeightSlot] = useState<EquipmentSlot | null>(null);
  const [weightedCustomizations, setWeightedCustomizations] = useState<Partial<Record<EquipmentSlot, WeightedTradeSearchCustomization>>>({});

  useEffect(() => {
    let active = true;
    fetch("/api/leagues").then(async (response) => {
      if (!response.ok) throw new Error("League discovery failed");
      return await response.json() as LeagueResponse;
    }).then((data) => {
      if (!active) return;
      setLeagues(data.leagues); setCurrentLeague(data.currentLeague); setLeague(data.currentLeague); setLeagueSource(data.source);
    }).catch(() => { if (active) setLeagueSource("fallback"); }).finally(() => { if (active) setLeagueLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const jobId = window.localStorage.getItem(activeJobKey);
    if (!jobId) return;
    const controller = new AbortController();
    const clientId = queueClientId();
    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      setActiveJobId(jobId);
      setLoading(true);
      setQueueStatus({ state: "connecting", position: 0, queued: 0, active: 0 });
    });
    void pollOptimizationJob(jobId, clientId, (status) => {
      setLeague(status.league);
      if (status.state === "queued" || status.state === "running") {
        setQueueStatus({ state: status.state, position: status.position, queued: status.queued, active: status.active });
      }
    }, controller.signal).then((status) => {
      setResult(status.result ?? null);
      window.localStorage.removeItem(activeJobKey);
      setActiveJobId(null);
      window.setTimeout(() => document.getElementById("results")?.scrollIntoView({ behavior: "smooth" }), 20);
    }).catch((caught) => {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      window.localStorage.removeItem(activeJobKey);
      setActiveJobId(null);
      setOptimizationError(caught instanceof Error ? caught.message : "The saved comparison could not be resumed.");
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, []);

  const leagueGroups = useMemo(() => ({ challenge: leagues.filter((item) => !isPermanentLeague(item)).length, permanent: leagues.filter(isPermanentLeague).length }), [leagues]);
  const baseWeightedSearches = useMemo<Partial<Record<EquipmentSlot, WeightedTradeSearchDraft>>>(() => {
    if (!build) return {};
    return Object.fromEntries(slots.map((slot) => [
      slot,
      createWeightedTradeSearch(build, slot, goal, { amount: budget, currency }, weightPreset),
    ]));
  }, [budget, build, currency, goal, slots, weightPreset]);
  const weightedSearches = useMemo<Partial<Record<EquipmentSlot, WeightedTradeSearchDraft>>>(() => Object.fromEntries(
    slots.flatMap((slot) => {
      const draft = baseWeightedSearches[slot];
      if (!draft) return [];
      const measured = pobCalculatedWeights[slot];
      const weightedDraft = measured ? applyPobCalculatedWeights(draft, measured.options, measured.resolvedPreset, measured.engineVersion) : draft;
      return [[slot, customizeWeightedTradeSearch(weightedDraft, weightedCustomizations[slot])]];
    }),
  ), [baseWeightedSearches, pobCalculatedWeights, slots, weightedCustomizations]);

  const importBuild = async () => {
    try {
      setImporting(true); setError(""); setOptimizationError("");
      setBuild(await pobService.importBuild(pobCode)); setResult(null); setCandidates([]); setCandidateError("");
      setWeightEditorSlot(null); setPobCalculatedWeights({}); setWeightedCustomizations({}); setWeightedSearchError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Import failed");
    } finally { setImporting(false); }
  };

  const addCandidate = () => {
    if (!build || !slots.length) return;
    try {
      setCandidateError(""); setOptimizationError(""); setResult(null);
      if (candidates.length >= 20) throw new Error("A maximum of 20 candidates can be evaluated at once.");
      if (!slots.includes(candidateSlot)) throw new Error("Choose one of the selected equipment slots.");
      const id = `manual-${Date.now()}-${candidates.length + 1}`;
      const item = parseCopiedTradeItem({ id, slot: candidateSlot, rawText: candidateText, league });
      if (!isManualCandidateCompatible(build, item)) throw new Error(`${item.name} is not compatible with ${slotLabels[candidateSlot]}.`);
      if (candidates.some((candidate) => candidate.slot === candidateSlot && candidate.rawText === item.rawText)) throw new Error("That candidate has already been added for this slot.");
      setCandidates((current) => [...current, { id, slot: candidateSlot, rawText: item.rawText ?? candidateText, price: item.price, item }]);
      setCandidateText("");
    } catch (caught) {
      setCandidateError(caught instanceof Error ? caught.message : "The copied item could not be added.");
    }
  };

  const run = async () => {
    if (!build?.sourceXml || !slots.length || !candidates.length) return;
    try {
      setLoading(true); setQueueStatus({ state: "connecting", position: 0, queued: 0, active: 0 }); setOptimizationError(""); setResult(null);
      const clientId = queueClientId();
      const response = await fetch("/api/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-poe-client-id": clientId },
        body: JSON.stringify({
          buildXml: build.sourceXml,
          budget: { amount: budget, currency },
          goal,
          allowedSlots: slots,
          league,
          candidates: candidates.map((candidate) => ({ slot: candidate.slot, rawText: candidate.rawText })),
        }),
      });
      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        const status = await response.json() as OptimizationJobStatus & { error?: string };
        if (!response.ok) throw new Error(status.error ?? "The optimizer could not evaluate the pasted candidates.");
        if (!status.jobId) throw new Error("The durable queue did not return a job ID.");
        setActiveJobId(status.jobId);
        window.localStorage.setItem(activeJobKey, status.jobId);
        if (status.state === "queued" || status.state === "running") {
          setQueueStatus({ state: status.state, position: status.position, queued: status.queued, active: status.active });
        }
        const completed = await pollOptimizationJob(status.jobId, clientId, (update) => {
          if (update.state === "queued" || update.state === "running") {
            setQueueStatus({ state: update.state, position: update.position, queued: update.queued, active: update.active });
          }
        });
        setResult(completed.result ?? null);
        window.localStorage.removeItem(activeJobKey);
        setActiveJobId(null);
        window.setTimeout(() => document.getElementById("results")?.scrollIntoView({ behavior: "smooth" }), 20);
        return;
      }
      if (!response.ok) {
        const payload = await response.json() as { error?: string };
        throw new Error(payload.error ?? "The optimizer could not evaluate the pasted candidates.");
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error("The optimizer returned an empty response.");
      const decoder = new TextDecoder();
      let buffer = "";
      let completed = false;
      const handleLine = (line: string) => {
        if (!line.trim()) return;
        const message = JSON.parse(line) as {
          type?: string;
          state?: "queued" | "running";
          position?: number;
          result?: OptimizationResult;
          error?: string;
        };
        if (message.type === "queue" && message.state) setQueueStatus({ state: message.state, position: Number(message.position) || 0, queued: 0, active: 0 });
        if (message.type === "error") throw new Error(message.error ?? "The optimizer could not evaluate the pasted candidates.");
        if (message.type === "result" && message.result) { setResult(message.result); completed = true; }
      };
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) handleLine(line);
        if (done) break;
      }
      handleLine(buffer);
      if (!completed) throw new Error("The optimizer ended before returning results.");
      setTimeout(() => document.getElementById("results")?.scrollIntoView({ behavior: "smooth" }), 20);
    } catch (caught) {
      setOptimizationError(caught instanceof Error ? caught.message : "The optimizer could not evaluate the pasted candidates.");
    } finally {
      setLoading(false);
    }
  };
  const cancelActiveJob = async () => {
    if (!activeJobId) return;
    try {
      const response = await fetch(`/api/optimize/jobs/${encodeURIComponent(activeJobId)}`, {
        method: "DELETE",
        headers: { "x-poe-client-id": queueClientId() },
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "The comparison could not be cancelled.");
      window.localStorage.removeItem(activeJobKey);
      setActiveJobId(null);
      setLoading(false);
      setOptimizationError("The queued comparison was cancelled.");
    } catch (caught) {
      setOptimizationError(caught instanceof Error ? caught.message : "The comparison could not be cancelled.");
    }
  };
  const toggleSlot = (slot: EquipmentSlot) => {
    if (slots.includes(slot) && candidates.some((candidate) => candidate.slot === slot)) {
      setCandidateError(`Remove the ${slotLabels[slot]} candidates before deselecting that slot.`);
      return;
    }
    const next = slots.includes(slot) ? slots.filter((item) => item !== slot) : [...slots, slot];
    setSlots(next);
    if (!next.includes(candidateSlot) && next[0]) setCandidateSlot(next[0]);
    if (weightEditorSlot === slot && !next.includes(slot)) setWeightEditorSlot(null);
  };
  const removeCandidate = (id: string) => {
    setCandidates((current) => current.filter((candidate) => candidate.id !== id));
    setResult(null); setCandidateError("");
  };
  const copyWeightedTrade = async (slot: EquipmentSlot) => {
    const draft = weightedSearches[slot];
    if (!draft) return;

    try {
      setWeightedSearchError("");
      await copyText(createEncodedTradeSearchUrl(league, draft.request));
      setCopiedWeightedSlot(slot);
      window.setTimeout(() => setCopiedWeightedSlot((current) => current === slot ? null : current), 3_000);
    } catch {
      setWeightedSearchError("Your browser blocked clipboard access. The Open weighted search button still works without the clipboard.");
    }
  };
  const calculateWeightsWithPob = async (slot: EquipmentSlot) => {
    if (!build?.sourceXml) return;
    try {
      setCalculatingWeightSlot(slot); setWeightedSearchError("");
      const response = await fetch("/api/weights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ buildXml: build.sourceXml, slot, goal, preset: weightPreset }),
      });
      const payload = await response.json() as PobCalculatedWeightResult & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Path of Building could not calculate these weights.");
      setPobCalculatedWeights((current) => ({ ...current, [slot]: payload }));
      setWeightedCustomizations((current) => {
        const next = { ...current };
        delete next[slot];
        return next;
      });
    } catch (caught) {
      setWeightedSearchError(caught instanceof Error ? caught.message : "Path of Building could not calculate these weights.");
    } finally {
      setCalculatingWeightSlot(null);
    }
  };
  const updateWeightedWeight = (slot: EquipmentSlot, id: string, weight: number) => {
    setWeightedCustomizations((current) => ({
      ...current,
      [slot]: {
        ...current[slot],
        weights: { ...current[slot]?.weights, [id]: weight },
      },
    }));
  };
  const addWeightedOption = (slot: EquipmentSlot, option: WeightedTradeOption, weight: number) => {
    setWeightedCustomizations((current) => ({
      ...current,
      [slot]: {
        ...current[slot],
        addedOptions: [...(current[slot]?.addedOptions ?? []).filter((existing) => existing.id !== option.id), { ...option, weight, source: "manual" }],
        weights: { ...current[slot]?.weights, [option.id]: weight },
      },
    }));
  };
  const resetWeightedSearch = (slot: EquipmentSlot) => {
    setWeightedCustomizations((current) => {
      const next = { ...current };
      delete next[slot];
      return next;
    });
  };
  const toggleWeightedOption = (slot: EquipmentSlot, id: string, enabled: boolean) => {
    const currentOption = weightedSearches[slot]?.options.find((option) => option.id === id);
    const generatedOption = pobCalculatedWeights[slot]?.options.find((option) => option.id === id)
      ?? baseWeightedSearches[slot]?.options.find((option) => option.id === id)
      ?? weightedCustomizations[slot]?.addedOptions?.find((option) => option.id === id);
    if (!currentOption || !generatedOption) return;
    updateWeightedWeight(slot, id, enabled ? generatedOption.weight : 0);
  };
  const changeGoal = (value: OptimizationGoal) => {
    setGoal(value); setPobCalculatedWeights({}); setWeightedCustomizations({}); setWeightedSearchError("");
  };
  const changeWeightPreset = (value: WeightPreset) => {
    setWeightPreset(value); setPobCalculatedWeights({}); setWeightedCustomizations({}); setWeightedSearchError("");
  };
  const manualOptionsForSlot = (slot: EquipmentSlot) => {
    if (!build) return [];
    const existing = new Set(weightedSearches[slot]?.options.map((option) => option.id) ?? []);
    const measured = getManualWeightedStats(build, slot).filter((definition) => !existing.has(definition.id)).map((definition) => ({
      id: definition.id,
      label: definition.label,
      weight: 1,
      reason: definition.reason,
      source: "manual" as const,
      currentValue: currentItemStatValue(build.equipment[slot], definition),
    }));
    const included = new Set([...existing, ...measured.map((option) => option.id)]);
    const affixes = getManualTradeAffixes(build, slot).filter((definition) => !included.has(definition.id)).map((definition) => ({
      id: definition.id,
      label: definition.label,
      weight: 1,
      reason: `Official trade affix available for ${build.equipment[slot].itemClass ?? slot}.`,
      source: "manual" as const,
      currentValue: 0,
    }));
    return [...measured, ...affixes];
  };
  const prepareManualSearch = () => document.getElementById("manual-candidates")?.scrollIntoView({ behavior: "smooth" });

  const summaryMetrics = result?.baselineMetrics ?? build?.metrics;
  const summaryDpsMetric = result?.dpsMetric ?? build?.dpsMetric;

  return <main className="min-h-screen text-foreground">
    <header className="sticky top-0 z-40 border-b border-white/[0.07] bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-[4.5rem] max-w-7xl items-center justify-between px-4 sm:px-6">
        <a className="flex items-center gap-3" href="#top" aria-label="PoE Upgrade Optimizer home"><div className="grid size-10 place-items-center rounded-xl border border-primary/30 bg-primary/10 shadow-inner shadow-primary/10"><WandSparkles className="size-5 text-primary" /></div><div className="leading-none"><p className="font-heading text-base font-semibold"><span className="text-primary">PoE</span> Upgrade Optimizer</p><p className="mt-1.5 text-[11px] text-muted-foreground">Build upgrades, clearly explained</p></div></a>
        <div className="flex items-center gap-2"><Badge variant="outline" className="hidden gap-1.5 sm:flex">{leagueSource === "official" ? <Wifi className="size-3 text-emerald-400" /> : <WifiOff className="size-3 text-amber-400" />}{leagueSource === "official" ? "Leagues are live" : "Using saved leagues"}</Badge><Badge className="max-w-40 truncate bg-primary/15 text-primary hover:bg-primary/15">{leagueLoading ? "Finding league..." : league}</Badge></div>
      </div>
    </header>

    <section id="top" className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-center lg:py-20">
      <div><Badge variant="outline" className="mb-5 border-primary/25 bg-primary/5 text-primary"><Sparkles className="size-3" />Made for Path of Exile players</Badge><h1 className="max-w-4xl font-heading text-5xl font-semibold leading-[1.02] tracking-[-0.035em] sm:text-7xl">Find upgrades your build can <span className="text-primary">actually use.</span></h1><p className="mt-6 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">Bring your PoB, set a budget, and compare real trade items with exact Path of Building calculations. No guesswork, just a clearer way to spend your currency.</p></div>
      <Card className="border-primary/20 bg-card/75 shadow-[0_24px_70px_-46px_rgba(232,169,70,0.45)] backdrop-blur"><CardHeader><CardDescription className="text-xs font-medium text-primary">How it works</CardDescription><CardTitle className="font-heading text-2xl">From build to shortlist</CardTitle></CardHeader><CardContent className="space-y-4">{[["1", "Import", "Paste your PoB build."], ["2", "Choose", "Set a budget and priorities."], ["3", "Compare", "Let PoB check each item."]].map(([step, title, detail]) => <div key={step} className="flex gap-3"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/12 text-xs font-semibold text-primary">{step}</span><div><p className="text-sm font-medium">{title}</p><p className="text-xs text-muted-foreground">{detail}</p></div></div>)}</CardContent></Card>
    </section>

    <section className="mx-auto max-w-7xl space-y-4 px-4 pb-12 sm:px-6">
      {loading && !build && <Card className="border-sky-400/25 bg-sky-400/[0.06]"><CardContent className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-medium text-sky-200">{queueStatus.state === "queued" ? `Your saved comparison is number ${queueStatus.position} in line` : queueStatus.state === "running" ? "Your saved comparison is running now" : "Reconnecting to your saved comparison"}</p><p className="mt-1 text-xs text-muted-foreground">You can close this page. This browser will reconnect to job {activeJobId?.slice(0, 8)} when you return.</p></div>{activeJobId && <Button variant="outline" size="sm" onClick={() => void cancelActiveJob()}><Trash2 />Cancel</Button>}</CardContent></Card>}
      {optimizationError && !build && <Alert variant="destructive"><AlertTitle>Saved comparison needs attention</AlertTitle><AlertDescription>{optimizationError}</AlertDescription></Alert>}
      <Card className="border-white/[0.07] bg-card/90 shadow-[0_28px_70px_-52px_rgba(0,0,0,0.95)]">
        <CardHeader className="flex flex-col gap-5 border-b border-border/70 sm:flex-row sm:items-center sm:justify-between"><SectionHeading number="1" eyebrow="Import" title="Start with your build" icon={Import} />{build && <Badge className="gap-1 bg-emerald-500/15 text-emerald-300"><CheckCircle2 className="size-3" />Build ready</Badge>}</CardHeader>
        <CardContent className="grid min-w-0 gap-6 pt-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0 space-y-2"><div className="flex items-center justify-between gap-3"><Label htmlFor="pob">Path of Building code or pobb.in link</Label>{pobCode && <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{pobCode.length.toLocaleString()} characters</span>}</div><Textarea id="pob" value={pobCode} wrap="soft" spellCheck={false} placeholder="Paste your eNrt... code or https://pobb.in/... link" onChange={(event) => setPobCode(event.target.value)} className="h-32 max-h-80 min-h-28 resize-y bg-background/60 font-mono text-xs leading-5" /><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs leading-5 text-muted-foreground">We&apos;ll read your active gear, main skill, and saved configuration.</p><Button onClick={importBuild} disabled={importing || !pobCode.trim()} className="shrink-0 shadow-lg shadow-primary/10">{importing ? <Loader2 className="animate-spin" /> : <Import />} {importing ? "Reading your build..." : "Import my build"}<ArrowRight /></Button></div></div>
          <div className="min-w-0 space-y-3 rounded-xl border border-border bg-background/35 p-4"><div className="flex items-center justify-between"><Label>League</Label>{league === currentLeague && !leagueLoading && <Badge variant="secondary" className="gap-1 text-[10px]"><Sparkles className="size-3 text-primary" />Current league</Badge>}</div><LeagueSelect leagues={leagues} value={league} currentLeague={currentLeague} loading={leagueLoading} onChange={setLeague} /><p className="text-xs leading-5 text-muted-foreground">We keep this synced with the official PoE league feed. {leagueGroups.challenge} challenge and {leagueGroups.permanent} permanent leagues are available.</p></div>
          {error && <Alert variant="destructive" className="lg:col-span-2"><AlertTitle>Import failed</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
        </CardContent>
      </Card>

      {!build ? <Card className="border-dashed border-border/70 bg-card/35 py-14 text-center shadow-none"><CardContent className="flex flex-col items-center"><div className="mb-4 grid size-12 place-items-center rounded-full bg-primary/8"><LockKeyhole className="size-5 text-primary/70" /></div><CardTitle className="font-heading text-2xl">Your build summary will appear here</CardTitle><CardDescription className="mt-2 max-w-md leading-5">Paste a PoB above and we&apos;ll walk you through your current gear, search preferences, and item comparisons.</CardDescription></CardContent></Card> : <>
        <Card className="overflow-hidden border-white/[0.07] bg-card/90 py-0 shadow-[0_24px_60px_-48px_rgba(0,0,0,0.95)]">
          <div className="grid lg:grid-cols-[390px_1fr]"><div className="flex items-center gap-4 border-b border-border p-6 lg:border-r lg:border-b-0"><div className="grid size-16 shrink-0 place-items-center rounded-2xl border border-primary/25 bg-primary/10 font-heading text-3xl text-primary shadow-inner shadow-primary/10">{build.character.name.charAt(0).toUpperCase()}</div><div className="min-w-0"><Badge variant="outline" className="mb-2">Level {build.character.level}</Badge><h2 className="truncate font-heading text-2xl font-semibold">{build.character.name}</h2><p className="mt-1 text-sm text-muted-foreground">{build.character.ascendancy} {build.character.className} · {build.character.mainSkill}</p></div></div>{summaryMetrics && <div className="grid divide-y divide-border sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4"><Metric label={dpsMetricLabel(summaryDpsMetric)} value={summaryMetrics.totalDps >= 1_000_000 ? `${(summaryMetrics.totalDps / 1_000_000).toFixed(1)}M` : formatNumber(summaryMetrics.totalDps)} detail={result ? "Validated PoB baseline" : build.character.mainSkill} icon={Zap} /><Metric label="Effective hit pool" value={formatNumber(summaryMetrics.effectiveHitPool)} detail={result ? "Validated PoB baseline" : "From your saved PoB config"} icon={HeartPulse} /><Metric label="Physical max hit" value={formatNumber(summaryMetrics.physicalMaxHit)} detail={result ? "Validated PoB baseline" : "From your saved PoB config"} icon={Shield} /><Metric label="Resistances" value={`${summaryMetrics.fireResistance}/${summaryMetrics.coldResistance}/${summaryMetrics.lightningResistance}`} detail={`Chaos resistance ${summaryMetrics.chaosResistance}%`} icon={Gauge} /></div>}</div>
        </Card>

        {build.kalandrasTouch && <Alert className="border-sky-400/25 bg-sky-400/[0.06]"><Copy className="text-sky-300" /><AlertTitle>Kalandra&apos;s Touch detected</AlertTitle><AlertDescription>{slotLabels[build.kalandrasTouch.touchSlot]} is shown as a second copy of {slotLabels[build.kalandrasTouch.sourceSlot]}. Every ring candidate will be duplicated into both ring slots during the PoB comparison.</AlertDescription></Alert>}

        <div className="space-y-4">
          <Card className="overflow-hidden border-white/[0.07] bg-card/90 shadow-[0_24px_60px_-48px_rgba(0,0,0,0.95)]"><CardHeader className="border-b border-border/70"><SectionHeading number="2" eyebrow="Review" title="What you&apos;re wearing" icon={PackageSearch} /></CardHeader><CardContent className="pt-6"><EquippedInventory build={build} /></CardContent></Card>

          <Card className="border-white/[0.07] bg-card/90 shadow-[0_24px_60px_-48px_rgba(0,0,0,0.95)]"><CardHeader><SectionHeading number="3" eyebrow="Preferences" title="What are you looking for?" description="These choices will set the default filters for your trade searches." icon={Activity} /></CardHeader><CardContent className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-[1fr_180px]"><div className="space-y-2"><Label htmlFor="budget">Budget</Label><div className="grid grid-cols-[minmax(0,1fr)_8rem]"><Input id="budget" type="number" min="1" value={budget} onChange={(event) => setBudget(Math.max(1, Number(event.target.value)))} className="h-11 rounded-r-none bg-background/60 font-mono text-lg" /><Select value={currency} onValueChange={(value) => setCurrency(value as "chaos" | "divine")}><SelectTrigger className="h-11 w-full rounded-l-none border-l-0 bg-background/60 data-[size=default]:h-11"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="divine">Divine</SelectItem><SelectItem value="chaos">Chaos</SelectItem></SelectContent></Select></div></div><div className="space-y-2"><Label>Market</Label><div className="flex h-11 items-center gap-2 rounded-lg border border-input bg-background/60 px-3 text-sm"><CircleDollarSign className="size-4 text-primary" /><span className="truncate">{league}</span></div></div></div>
            <div className="space-y-2"><Label>What matters most?</Label><ToggleGroup type="single" variant="outline" value={goal} onValueChange={(value) => value && changeGoal(value as OptimizationGoal)} className="grid w-full grid-cols-1 gap-2 sm:grid-cols-3">{(["dps", "balanced", "survivability"] as const).map((value) => { const Icon = value === "dps" ? Sword : value === "balanced" ? Scale : Shield; return <ToggleGroupItem key={value} value={value} className="h-20 flex-col gap-1 rounded-xl data-[state=on]:border-primary data-[state=on]:bg-primary/10 data-[state=on]:text-primary"><Icon className="size-5" /><span className="text-xs font-semibold">{value === "dps" ? "More damage" : value === "balanced" ? "A good balance" : "More defense"}</span><span className="text-[10px] font-normal text-muted-foreground">{value === "dps" ? "Offense first" : value === "balanced" ? "Damage and defense" : "Survival first"}</span></ToggleGroupItem>; })}</ToggleGroup></div>
            <div className="space-y-3"><div className="flex items-center justify-between"><Label>Gear you&apos;re open to replacing</Label><Badge variant="outline">{slots.length} selected</Badge></div><div className="grid grid-cols-2 gap-2">{EQUIPMENT_SLOTS.map((slot) => <Label key={slot} className={cn("flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-background/30 p-3 text-xs font-normal transition-colors hover:bg-accent", slots.includes(slot) && "border-primary/35 bg-primary/5")}><Checkbox checked={slots.includes(slot)} onCheckedChange={() => toggleSlot(slot)} />{slotLabels[slot]}</Label>)}</div></div>
            <Separator />
            <Button size="lg" className="w-full shadow-lg shadow-primary/10" onClick={prepareManualSearch} disabled={!slots.length}><Search />Show me what to search for<ArrowRight /></Button>
            <p className="flex items-center justify-center gap-2 text-center text-xs leading-5 text-muted-foreground"><DatabaseZap className="size-3.5 shrink-0 text-emerald-400" />You stay in control: this app never sends automated requests to PoE Trade.</p>
          </CardContent></Card>
        </div>

        <Card id="manual-candidates" className="scroll-mt-24 border-white/[0.07] bg-card/90 shadow-[0_24px_60px_-48px_rgba(0,0,0,0.95)]">
          <CardHeader className="flex flex-col gap-4 border-b border-border/70 sm:flex-row sm:items-center sm:justify-between">
            <SectionHeading number="4" eyebrow="Find candidates" title="Bring back a few contenders" icon={ClipboardPaste} />
            <Badge variant="outline">{candidates.length} of 20 saved</Badge>
          </CardHeader>
          <CardContent className="grid gap-6 pt-6 lg:grid-cols-2">
            <div className="space-y-4">
              <div>
                <h3 className="font-heading text-xl font-semibold">Search PoE Trade</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">Choose a build archetype, then let Path of Building measure how each compatible stat affects this exact build.</p>
              </div>
              <div className="space-y-2 rounded-xl border border-primary/20 bg-primary/[0.04] p-4"><div className="flex items-center justify-between gap-3"><Label>Build archetype</Label>{weightPreset === "auto" && <Badge variant="secondary">Recommended</Badge>}</div><Select value={weightPreset} onValueChange={(value) => changeWeightPreset(value as WeightPreset)}><SelectTrigger className="h-11 w-full bg-background/70"><SelectValue /></SelectTrigger><SelectContent>{WEIGHT_PRESETS.map((preset) => <SelectItem key={preset.id} value={preset.id}>{preset.label}</SelectItem>)}</SelectContent></Select><p className="text-xs leading-5 text-muted-foreground">{WEIGHT_PRESETS.find((preset) => preset.id === weightPreset)?.description}</p></div>
              <Alert className="border-primary/20 bg-primary/5"><Calculator className="text-primary" /><AlertTitle>Preset first, measured weights second</AlertTitle><AlertDescription>The preset limits each item class to relevant stats. Use Calculate with PoB on a slot to replace the starting values with measured multipliers and a current-item score threshold.</AlertDescription></Alert>
              <div className="grid gap-2 sm:grid-cols-2">
                {slots.map((slot) => {
                  const currentItem = build.equipment[slot];
                  const weightedSearch = weightedSearches[slot];
                  const itemClassLabel = currentItem.itemClass?.trim() || (weightedSearch?.category ? tradeCategoryLabels[weightedSearch.category] : undefined) || fixedTradeClassLabels[slot] || "Any compatible item";
                  return <Card key={slot} className="gap-3 border-border/70 bg-background/35 p-4 shadow-none transition-colors hover:bg-background/50">
                    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-medium text-primary">{slotLabels[slot]}</p><p className="mt-1 truncate font-heading text-base font-semibold">{itemClassLabel}</p><p className="mt-1 truncate text-xs capitalize text-muted-foreground">{currentItem.baseType} · {weightedSearch?.resolvedPreset.replaceAll("-", " ") ?? "build"}</p></div><Badge variant="secondary" className={cn("shrink-0", weightedSearch?.calculation === "pob" && "bg-sky-500/15 text-sky-300")}>{weightedSearch?.calculation === "pob" ? "PoB measured" : "Preset estimate"}</Badge></div>
                    {weightedSearch && <div className="space-y-1.5 border-y border-border/60 py-3">
                      {weightedSearch.options.slice(0, 4).map((option) => <div key={option.id} className="flex items-start justify-between gap-3 text-[10px]"><span className="min-w-0 leading-4 text-muted-foreground">{option.label}</span><span className="shrink-0 font-mono text-primary">×{option.weight}</span></div>)}
                      {weightedSearch.options.length > 4 && <p className="font-mono text-[9px] text-muted-foreground">+ {weightedSearch.options.length - 4} more weighted stats</p>}
                    </div>}
                    {weightedSearch && <>
                      <Button size="sm" className="w-full" onClick={() => void calculateWeightsWithPob(slot)} disabled={calculatingWeightSlot !== null}>{calculatingWeightSlot === slot ? <Loader2 className="animate-spin" /> : <Calculator />}{calculatingWeightSlot === slot ? "Measuring in PoB..." : weightedSearch.calculation === "pob" ? "Recalculate with PoB" : "Calculate with PoB"}</Button>
                      <div className="grid grid-cols-2 gap-2"><Button variant="outline" size="sm" asChild><a href={createEncodedTradeSearchUrl(league, weightedSearch.request)} target="_blank" rel="noopener noreferrer">Open search<ExternalLink /></a></Button><Button variant="outline" size="sm" onClick={() => setWeightEditorSlot((current) => current === slot ? null : slot)}><SlidersHorizontal />{weightEditorSlot === slot ? "Close editor" : "Tune weights"}</Button><Button variant="outline" size="sm" className="col-span-2" onClick={() => void copyWeightedTrade(slot)}>{copiedWeightedSlot === slot ? <Check /> : <Copy />}{copiedWeightedSlot === slot ? "Link copied" : "Copy weighted link"}</Button></div>
                    </>}
                  </Card>;
                })}
                {weightEditorSlot && weightedSearches[weightEditorSlot] && <WeightedSearchEditor
                  slot={weightEditorSlot}
                  draft={weightedSearches[weightEditorSlot]}
                  itemClass={build.equipment[weightEditorSlot].itemClass?.trim() || (weightedSearches[weightEditorSlot].category ? tradeCategoryLabels[weightedSearches[weightEditorSlot].category] : undefined) || fixedTradeClassLabels[weightEditorSlot] || "Any compatible item"}
                  league={league}
                  copied={copiedWeightedSlot === weightEditorSlot}
                  availableOptions={manualOptionsForSlot(weightEditorSlot)}
                  onWeightChange={(id, weight) => updateWeightedWeight(weightEditorSlot, id, weight)}
                  onToggle={(id, enabled) => toggleWeightedOption(weightEditorSlot, id, enabled)}
                  onAdd={(option, weight) => addWeightedOption(weightEditorSlot, option, weight)}
                  onReset={() => resetWeightedSearch(weightEditorSlot)}
                  onCopy={() => void copyWeightedTrade(weightEditorSlot)}
                  onDone={() => setWeightEditorSlot(null)}
                />}
              </div>
              {weightedSearchError && <Alert variant="destructive"><AlertTitle>Weighted search needs attention</AlertTitle><AlertDescription>{weightedSearchError}</AlertDescription></Alert>}
            </div>

            <div className="space-y-4">
              <div>
                <h3 className="font-heading text-xl font-semibold">Paste an item you like</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">Copy the full item text beginning with <span className="font-mono text-foreground">Item Class:</span>. If it includes a <span className="font-mono text-foreground">Note:</span> line, we&apos;ll use that listing price automatically.</p>
              </div>
              <div className="space-y-2"><Label>Replacement slot</Label><Select value={candidateSlot} onValueChange={(value) => setCandidateSlot(value as EquipmentSlot)} disabled={!slots.length}><SelectTrigger className="h-10 w-full bg-background/60"><SelectValue /></SelectTrigger><SelectContent>{slots.map((slot) => <SelectItem key={slot} value={slot}>{slotLabels[slot]}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-2"><Label htmlFor="candidate-text">Copied item text</Label><Textarea id="candidate-text" value={candidateText} onChange={(event) => setCandidateText(event.target.value)} spellCheck={false} placeholder={'Item Class: Rings\nRarity: Rare\nExample Ring\nAmethyst Ring\n--------\n...\n--------\nNote: ~price 2 divine'} className="min-h-48 resize-y bg-background/60 font-mono text-xs leading-5" /></div>
              <Button onClick={addCandidate} disabled={!candidateText.trim() || !slots.length} className="w-full"><ClipboardPaste />Save this candidate</Button>
              {candidateError && <Alert variant="destructive"><AlertTitle>Candidate not added</AlertTitle><AlertDescription>{candidateError}</AlertDescription></Alert>}
            </div>

            <div className="space-y-4 border-t border-border pt-6 lg:col-span-2">
              <div className="flex items-center justify-between gap-3"><div><h3 className="font-heading text-xl font-semibold">Compare them with your build</h3><p className="mt-1 text-sm text-muted-foreground">Path of Building will equip each item and show you what genuinely changes.</p></div><Badge variant="secondary">{candidates.length} ready</Badge></div>
              {candidates.length > 0 ? <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{candidates.map((candidate) => <Card key={candidate.id} className="gap-3 border-border/70 bg-background/35 p-4 shadow-none"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-medium text-primary">{slotLabels[candidate.slot]}</p><p className="mt-1 truncate font-heading text-base font-semibold text-amber-100">{candidate.item.name}</p><p className="truncate text-[11px] text-muted-foreground">{candidate.item.baseType}</p></div><Button variant="ghost" size="icon-sm" onClick={() => removeCandidate(candidate.id)} aria-label={`Remove ${candidate.item.name}`}><Trash2 /></Button></div><div className="flex items-center justify-between border-t border-border/60 pt-3"><span className="text-xs text-muted-foreground">{candidate.item.modifiers.length} parsed stats</span><Badge variant={candidate.price.amount > 0 ? "default" : "secondary"}>{candidate.price.amount > 0 ? `${candidate.price.amount} ${candidate.price.currency === "divine" ? "div" : candidate.price.currency}` : "Price not included"}</Badge></div></Card>)}</div> : <Alert className="border-dashed"><PackageSearch /><AlertTitle>Your shortlist is empty</AlertTitle><AlertDescription>Find a few compatible items on the official trade site, then paste each one above.</AlertDescription></Alert>}
              <Button size="lg" className="w-full shadow-lg shadow-primary/10" onClick={run} disabled={loading || !candidates.length}>{loading ? <Loader2 className="animate-spin" /> : <DatabaseZap />}{loading ? queueStatus.state === "queued" ? `Waiting in PoB queue · position ${queueStatus.position}` : queueStatus.state === "running" ? "PoB is checking your items..." : "Joining the PoB queue..." : `Compare ${candidates.length || ""} candidate${candidates.length === 1 ? "" : "s"}`}<ArrowRight /></Button>
              {loading && <div className="rounded-xl border border-sky-400/20 bg-sky-400/5 px-4 py-3 text-center"><p className="text-xs font-medium text-sky-200">{queueStatus.state === "queued" ? `You are number ${queueStatus.position} in the queue` : queueStatus.state === "running" ? "Your comparison is running now" : "Connecting to the comparison service"}</p><p className="mt-1 text-[11px] leading-5 text-muted-foreground">{activeJobId ? `Your place is saved, so you can close this page and return later.${queueStatus.queued > 0 ? ` ${queueStatus.queued} comparison${queueStatus.queued === 1 ? " is" : "s are"} waiting.` : ""}` : "Comparisons run in order with limited concurrency to keep the Path of Building service responsive."}</p>{activeJobId && <Button variant="ghost" size="sm" className="mt-2" onClick={() => void cancelActiveJob()}><Trash2 />Cancel comparison</Button>}</div>}
              {optimizationError && <Alert variant="destructive"><AlertTitle>Optimization failed</AlertTitle><AlertDescription>{optimizationError}</AlertDescription></Alert>}
            </div>
          </CardContent>
        </Card>
      </>}
    </section>

    {result && <section id="results" className="mx-auto max-w-7xl space-y-5 px-4 py-16 sm:px-6">
      <div className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between"><div><Badge variant="outline" className="mb-3 gap-1 text-emerald-300"><CheckCircle2 className="size-3" />Verified by Path of Building · {result.evaluatedCandidates} checked</Badge><h2 className="font-heading text-4xl font-semibold">Here&apos;s what PoB calculated</h2><p className="mt-2 text-sm text-muted-foreground">Calculated by {result.engineVersion ?? "Path of Building"} using {dpsMetricLabel(result.dpsMetric)}. Upgrade verdicts and recommendation eligibility are shown separately.</p></div><div className="flex gap-2"><Badge variant="secondary" className="px-3 py-1.5">{league}</Badge><Badge className="px-3 py-1.5">Budget {formatPrice(result.budgetInChaos)}</Badge></div></div>
      {result.combinations[0] && <Card className="overflow-hidden border-primary/35 bg-gradient-to-br from-primary/10 via-card to-card shadow-[0_24px_65px_-48px_rgba(232,169,70,0.5)]"><CardHeader className="border-b border-primary/15"><Badge className="mb-2 w-fit gap-1"><Sparkles className="size-3" />Best combination</Badge><CardTitle className="font-heading text-2xl">{result.combinations[0].recommendations.map((item) => item.item.name).join(" + ")}</CardTitle><CardDescription>{result.combinations[0].explanation}</CardDescription></CardHeader><CardContent className="grid gap-4 pt-6 sm:grid-cols-3"><div><p className="text-xs text-muted-foreground">Total cost</p><p className="mt-1 font-mono text-xl font-semibold">{formatPrice(result.combinations[0].priceInChaos)}</p></div><div><p className="text-xs text-muted-foreground">Damage change</p><p className="mt-1 text-xl"><Delta value={percentChange(result.baselineMetrics.totalDps, result.combinations[0].changes.totalDps)} /></p></div><div><p className="text-xs text-muted-foreground">EHP change</p><p className="mt-1 text-xl"><Delta value={percentChange(result.baselineMetrics.effectiveHitPool, result.combinations[0].changes.effectiveHitPool)} /></p></div></CardContent></Card>}
      <div className="flex items-center justify-between pt-6"><div><p className="text-xs font-medium text-primary">Top picks</p><h3 className="font-heading text-2xl font-semibold">Best individual upgrades</h3></div><Badge variant="outline">{result.recommendations.length} selected</Badge></div>
      {result.recommendations.length > 0 ? <div className="grid gap-4 lg:grid-cols-2">{result.recommendations.slice(0, 6).map((recommendation, index) => <RecommendationCard key={`${recommendation.slot}-${recommendation.item.id}`} recommendation={recommendation} baseline={result.baselineMetrics} rank={index + 1} league={league} />)}</div> : <Alert className="border-amber-500/25 bg-amber-500/5"><PackageSearch className="text-amber-300" /><AlertTitle>No candidates matched the selected goal</AlertTitle><AlertDescription>Path of Building recalculated {result.evaluatedCandidates} compatible pasted candidates. Review each before-and-after result below to see whether it was an upgrade, downgrade, mixed trade-off, or an unchanged evaluation.</AlertDescription></Alert>}
      {(result.candidateEvaluations?.length ?? 0) > 0 && <div className="space-y-4 pt-8"><div><p className="text-xs font-medium text-primary">Every item we checked</p><h3 className="font-heading text-2xl font-semibold">See exactly what PoB found</h3><p className="mt-1 text-sm text-muted-foreground">Each card shows the actual baseline, recalculated value, raw difference, and percentage. Its verdict is independent from whether it qualified for your selected goal.</p></div><div className="grid gap-4 xl:grid-cols-2">{result.candidateEvaluations.map((evaluation) => <CandidateEvaluationCard key={`${evaluation.slot}-${evaluation.item.id}`} evaluation={evaluation} baseline={result.baselineMetrics} dpsLabel={dpsMetricLabel(result.dpsMetric)} />)}</div></div>}
    </section>}

    <footer className="border-t border-border"><div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-8 text-xs text-muted-foreground sm:flex-row sm:justify-between sm:px-6"><span>PoE Upgrade Optimizer</span><span>Path of Exile is a trademark of Grinding Gear Games. This project is not affiliated with GGG.</span></div></footer>
  </main>;
}
