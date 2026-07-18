"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import {
  Activity, ArrowRight, Check, CheckCircle2, CircleDollarSign, ClipboardPaste, Copy, DatabaseZap, Gauge,
  ExternalLink, HeartPulse, Import, Loader2, LockKeyhole, PackageSearch, Scale, Search, Shield,
  Sparkles, Sword, Trash2, WandSparkles, Wifi, WifiOff, Zap,
} from "lucide-react";
import { Build, CandidateEvaluation, CurrencyAmount, EQUIPMENT_SLOTS, EquipmentSlot, LeagueResponse, OptimizationGoal, OptimizationResult, PoeLeague, TradeItem, UpgradeRecommendation } from "@/models";
import { MvpPobCalculationService } from "@/services/pob/pob-calculation-service";
import { isPermanentLeague } from "@/services/league/league-service";
import { formatNumber, formatPrice, percentChange } from "@/lib/metrics";
import { isManualCandidateCompatible, parseCopiedTradeItem } from "@/services/trade/manual-trade-market-service";
import { createTradeSiteUrl } from "@/services/trade/trade-search-service";
import { createWeightedTradeSearch, formatWeightedSearchRecipe, type WeightedTradeSearchDraft } from "@/services/trade/weighted-search-service";
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

const pobService = new MvpPobCalculationService();
const slotLabels: Record<EquipmentSlot, string> = { weapon: "Weapon", offhand: "Offhand", helmet: "Helmet", bodyArmour: "Body Armour", gloves: "Gloves", boots: "Boots", amulet: "Amulet", ring1: "Ring 1", ring2: "Ring 2", belt: "Belt" };
const fixedTradeClassLabels: Partial<Record<EquipmentSlot, string>> = { helmet: "Helmets", bodyArmour: "Body Armours", gloves: "Gloves", boots: "Boots", amulet: "Amulets", ring1: "Rings", ring2: "Rings", belt: "Belts" };
const defaultSlots: EquipmentSlot[] = ["weapon", "boots", "amulet", "ring1", "ring2"];
const fallbackLeague: PoeLeague = { id: "Standard", name: "Standard", realm: "pc", startAt: "2013-01-23T21:00:00Z", endAt: null };

interface ManualCandidate {
  id: string;
  slot: EquipmentSlot;
  rawText: string;
  price: CurrencyAmount;
  item: TradeItem;
}

function SectionHeading({ number, eyebrow, title, icon: Icon }: { number: string; eyebrow: string; title: string; icon: typeof Activity }) {
  return <div className="flex items-center gap-4">
    <div className="grid size-11 shrink-0 place-items-center rounded-full border border-primary/25 bg-primary/10 text-sm font-semibold text-primary shadow-inner shadow-primary/5">{number}</div>
    <div className="min-w-0"><p className="text-xs font-medium text-primary/80">{eyebrow}</p><h2 className="mt-0.5 flex items-center gap-2 font-heading text-2xl font-semibold"><Icon className="size-4 text-primary" />{title}</h2></div>
  </div>;
}

function Delta({ value, suffix = "%" }: { value: number; suffix?: string }) {
  return <span className={cn("font-mono font-semibold", value > 0 ? "text-emerald-400" : value < 0 ? "text-red-400" : "text-muted-foreground")}>{value > 0 ? "+" : ""}{value.toFixed(1)}{suffix}</span>;
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
      <TooltipContent side="right" sideOffset={10} className="block w-80 max-w-[calc(100vw-2rem)] items-stretch gap-0 overflow-hidden border border-amber-500/35 bg-[#0b0a08] p-0 text-foreground shadow-2xl">
        <div className="border-b border-amber-500/25 bg-amber-500/5 px-4 py-3 text-center">
          <p className="font-heading text-base font-semibold text-amber-200">{recommendation.item.name}</p>
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
  const dps = percentChange(baseline.totalDps, recommendation.changes.totalDps);
  const ehp = percentChange(baseline.effectiveHitPool, recommendation.changes.effectiveHitPool);
  const tradeHref = recommendation.item.tradeUrl ?? `/api/trade/item?league=${encodeURIComponent(league)}&item=${encodeURIComponent(recommendation.item.id)}`;
  return <Card className="gap-0 overflow-hidden border-white/[0.07] bg-card/90 py-0 shadow-[0_22px_55px_-42px_rgba(0,0,0,0.95)] transition-all hover:-translate-y-0.5 hover:border-primary/35">
    <CardHeader className="grid grid-cols-[auto_1fr_auto] items-start gap-3 border-b border-border/70 px-5 py-5">
      <div className="flex flex-col items-center gap-2"><Badge variant="outline" className="font-mono text-muted-foreground">#{rank.toString().padStart(2, "0")}</Badge><ItemPreview recommendation={recommendation} /></div>
      <div><CardDescription className="text-xs font-medium text-primary">{slotLabels[recommendation.slot]}</CardDescription><CardTitle className="mt-1 font-heading text-xl text-amber-100">{recommendation.item.name}</CardTitle><p className="mt-1 text-xs text-muted-foreground">Instead of {recommendation.currentItem.name}</p></div>
      <Badge className="bg-primary text-primary-foreground">{formatPrice(recommendation.priceInChaos)}</Badge>
    </CardHeader>
    <CardContent className="space-y-4 p-5">
      <div className="grid grid-cols-4 divide-x divide-border rounded-xl border border-border bg-background/40">{[["Damage", <Delta key="dps" value={dps} />], ["EHP", <Delta key="ehp" value={ehp} />], ["Phys. hit", <Delta key="phys" value={percentChange(baseline.physicalMaxHit, recommendation.changes.physicalMaxHit)} />], ["Score", <span key="score" className="font-mono font-semibold">{recommendation.score.toFixed(1)}</span>]].map(([label, value]) => <div key={label as string} className="space-y-1 px-3 py-2"><p className="text-[10px] text-muted-foreground">{label}</p>{value}</div>)}</div>
      <div className="flex items-center justify-between gap-3"><p className="text-[10px] text-muted-foreground">Manually supplied {recommendation.item.baseType}, verified by PoB.</p><Button variant="link" size="sm" asChild className="h-auto shrink-0 px-0 text-xs"><a href={tradeHref} target="_blank" rel="noopener noreferrer" aria-label={`Open the official Path of Exile trade site for ${league}`}>Open PoE Trade<ExternalLink /></a></Button></div>
      <div className="flex flex-wrap gap-2">{recommendation.item.modifiers.slice(0, 2).map((mod) => <Badge variant="secondary" key={mod.label} className="font-normal text-muted-foreground">{mod.label}</Badge>)}</div>
      <Alert className="border-primary/20 bg-primary/5"><Sparkles className="text-primary" /><AlertTitle className="text-sm text-primary">Why this one stands out</AlertTitle><AlertDescription>{recommendation.explanation}</AlertDescription></Alert>
    </CardContent>
  </Card>;
}

function CandidateEvaluationCard({ evaluation, baseline }: { evaluation: CandidateEvaluation; baseline: Build["metrics"] }) {
  const dps = percentChange(baseline.totalDps, evaluation.changes.totalDps);
  const ehp = percentChange(baseline.effectiveHitPool, evaluation.changes.effectiveHitPool);
  const physical = percentChange(baseline.physicalMaxHit, evaluation.changes.physicalMaxHit);
  return <Card className={cn("gap-0 overflow-hidden border-border/80 bg-card/70 py-0 shadow-none", evaluation.qualified ? "border-emerald-500/30" : "border-amber-500/25")}>
    <CardHeader className="flex flex-row items-start justify-between gap-3 border-b border-border/70 px-5 py-4">
      <div className="min-w-0"><CardDescription className="text-xs font-medium text-primary">{slotLabels[evaluation.slot]} · PoB result</CardDescription><CardTitle className="mt-1 truncate font-heading text-base text-amber-100">{evaluation.item.name}</CardTitle><p className="mt-1 text-xs text-muted-foreground">Compared with {evaluation.currentItem.name}</p></div>
      <Badge variant={evaluation.qualified ? "default" : "secondary"}>{evaluation.qualified ? "Worth considering" : "Not an upgrade"}</Badge>
    </CardHeader>
    <CardContent className="space-y-3 p-5">
      <div className="grid grid-cols-4 divide-x divide-border rounded-xl border border-border bg-background/40">{[["Damage", <Delta key="dps" value={dps} />], ["EHP", <Delta key="ehp" value={ehp} />], ["Phys. hit", <Delta key="phys" value={physical} />], ["Score", <span key="score" className="font-mono font-semibold">{evaluation.score.toFixed(2)}</span>]].map(([label, value]) => <div key={label as string} className="min-w-0 space-y-1 px-2 py-2 sm:px-3"><p className="text-[10px] text-muted-foreground">{label}</p><div className="truncate text-sm">{value}</div></div>)}</div>
      {!evaluation.qualified && <Alert className="border-amber-500/25 bg-amber-500/5"><PackageSearch className="text-amber-300" /><AlertTitle>Why it wasn&apos;t selected</AlertTitle><AlertDescription>{evaluation.rejectionReasons.join(" ")}</AlertDescription></Alert>}
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
  const [candidatePrice, setCandidatePrice] = useState(1);
  const [candidateCurrency, setCandidateCurrency] = useState<"chaos" | "divine">("divine");
  const [candidateError, setCandidateError] = useState("");
  const [copiedWeightedSlot, setCopiedWeightedSlot] = useState<EquipmentSlot | null>(null);
  const [weightedSearchError, setWeightedSearchError] = useState("");

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

  const leagueGroups = useMemo(() => ({ challenge: leagues.filter((item) => !isPermanentLeague(item)).length, permanent: leagues.filter(isPermanentLeague).length }), [leagues]);
  const weightedSearches = useMemo<Partial<Record<EquipmentSlot, WeightedTradeSearchDraft>>>(() => {
    if (!build) return {};
    return Object.fromEntries(slots.map((slot) => [
      slot,
      createWeightedTradeSearch(build, slot, goal, { amount: budget, currency }),
    ]));
  }, [budget, build, currency, goal, slots]);
  const importBuild = async () => {
    try {
      setImporting(true); setError(""); setOptimizationError("");
      setBuild(await pobService.importBuild(pobCode)); setResult(null); setCandidates([]); setCandidateError("");
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
      const price: CurrencyAmount = { amount: candidatePrice, currency: candidateCurrency };
      const item = parseCopiedTradeItem({ id, slot: candidateSlot, rawText: candidateText, price, league });
      if (!isManualCandidateCompatible(build, item)) throw new Error(`${item.name} is not compatible with ${slotLabels[candidateSlot]}.`);
      if (candidates.some((candidate) => candidate.slot === candidateSlot && candidate.rawText === item.rawText)) throw new Error("That candidate has already been added for this slot.");
      setCandidates((current) => [...current, { id, slot: candidateSlot, rawText: item.rawText ?? candidateText, price, item }]);
      setCandidateText("");
    } catch (caught) {
      setCandidateError(caught instanceof Error ? caught.message : "The copied item could not be added.");
    }
  };

  const run = async () => {
    if (!build?.sourceXml || !slots.length || !candidates.length) return;
    try {
      setLoading(true); setOptimizationError(""); setResult(null);
      const response = await fetch("/api/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buildXml: build.sourceXml,
          budget: { amount: budget, currency },
          goal,
          allowedSlots: slots,
          league,
          candidates: candidates.map((candidate) => ({ slot: candidate.slot, rawText: candidate.rawText, price: candidate.price })),
        }),
      });
      const payload = await response.json() as OptimizationResult & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "The optimizer could not evaluate the pasted candidates.");
      setResult(payload);
      setTimeout(() => document.getElementById("results")?.scrollIntoView({ behavior: "smooth" }), 20);
    } catch (caught) {
      setOptimizationError(caught instanceof Error ? caught.message : "The optimizer could not evaluate the pasted candidates.");
    } finally {
      setLoading(false);
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
      await navigator.clipboard.writeText(formatWeightedSearchRecipe(draft, league));
      setCopiedWeightedSlot(slot);
      window.setTimeout(() => setCopiedWeightedSlot((current) => current === slot ? null : current), 3_000);
    } catch {
      setWeightedSearchError("PoE Trade opened, but the browser blocked clipboard access. Allow clipboard access and click the link again.");
    }
  };
  const prepareManualSearch = () => document.getElementById("manual-candidates")?.scrollIntoView({ behavior: "smooth" });

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
          <div className="grid lg:grid-cols-[390px_1fr]"><div className="flex items-center gap-4 border-b border-border p-6 lg:border-r lg:border-b-0"><div className="grid size-16 shrink-0 place-items-center rounded-2xl border border-primary/25 bg-primary/10 font-heading text-3xl text-primary shadow-inner shadow-primary/10">{build.character.name.charAt(0).toUpperCase()}</div><div className="min-w-0"><Badge variant="outline" className="mb-2">Level {build.character.level}</Badge><h2 className="truncate font-heading text-2xl font-semibold">{build.character.name}</h2><p className="mt-1 text-sm text-muted-foreground">{build.character.ascendancy} {build.character.className} · {build.character.mainSkill}</p></div></div><div className="grid divide-y divide-border sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4"><Metric label="Combined DPS" value={build.metrics.totalDps >= 1_000_000 ? `${(build.metrics.totalDps / 1_000_000).toFixed(1)}M` : formatNumber(build.metrics.totalDps)} detail={build.character.mainSkill} icon={Zap} /><Metric label="Effective hit pool" value={formatNumber(build.metrics.effectiveHitPool)} detail="From your saved PoB config" icon={HeartPulse} /><Metric label="Physical max hit" value={formatNumber(build.metrics.physicalMaxHit)} detail="From your saved PoB config" icon={Shield} /><Metric label="Resistances" value={`${build.metrics.fireResistance}/${build.metrics.coldResistance}/${build.metrics.lightningResistance}`} detail={`Chaos resistance ${build.metrics.chaosResistance}%`} icon={Gauge} /></div></div>
        </Card>

        <div className="grid gap-4 lg:grid-cols-[0.92fr_1.08fr]">
          <Card className="border-white/[0.07] bg-card/90 shadow-[0_24px_60px_-48px_rgba(0,0,0,0.95)]"><CardHeader><SectionHeading number="2" eyebrow="Review" title="What you&apos;re wearing" icon={PackageSearch} /></CardHeader><CardContent className="grid gap-2 sm:grid-cols-2">{EQUIPMENT_SLOTS.map((slot) => { const item = build.equipment[slot]; return <Card key={slot} className="gap-3 border-border/70 bg-background/35 p-4 shadow-none transition-colors hover:bg-background/50"><div className="flex items-start gap-3"><div className="grid size-9 shrink-0 place-items-center rounded-xl border border-primary/20 bg-primary/5 font-heading text-primary">{slotLabels[slot].charAt(0)}</div><div className="min-w-0"><p className="text-xs font-medium text-muted-foreground">{slotLabels[slot]}</p><p className={cn("mt-1 truncate font-heading text-sm font-semibold", item.rarity === "unique" ? "text-orange-400" : item.rarity === "magic" ? "text-indigo-300" : item.rarity === "rare" ? "text-amber-100" : "text-muted-foreground")}>{item.name}</p><p className="truncate text-[11px] text-muted-foreground">{item.baseType}</p></div></div>{item.modifiers.length > 0 && <div className="space-y-1 border-t border-border/60 pt-3">{item.modifiers.slice(0, 2).map((modifier, index) => <p key={`${modifier.label}-${index}`} className="truncate text-[10px] text-muted-foreground">+ {modifier.label}</p>)}</div>}</Card>; })}</CardContent></Card>

          <Card className="border-white/[0.07] bg-card/90 shadow-[0_24px_60px_-48px_rgba(0,0,0,0.95)]"><CardHeader><SectionHeading number="3" eyebrow="Preferences" title="What are you looking for?" icon={Activity} /></CardHeader><CardContent className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-[1fr_180px]"><div className="space-y-2"><Label htmlFor="budget">Budget</Label><div className="flex"><Input id="budget" type="number" min="1" value={budget} onChange={(event) => setBudget(Math.max(1, Number(event.target.value)))} className="h-11 rounded-r-none bg-background/60 font-mono text-lg" /><Select value={currency} onValueChange={(value) => setCurrency(value as "chaos" | "divine")}><SelectTrigger className="h-11 w-32 rounded-l-none border-l-0 bg-background/60"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="divine">Divine</SelectItem><SelectItem value="chaos">Chaos</SelectItem></SelectContent></Select></div></div><div className="space-y-2"><Label>Market</Label><div className="flex h-11 items-center gap-2 rounded-lg border border-input bg-background/60 px-3 text-sm"><CircleDollarSign className="size-4 text-primary" /><span className="truncate">{league}</span></div></div></div>
            <div className="space-y-2"><Label>What matters most?</Label><ToggleGroup type="single" variant="outline" value={goal} onValueChange={(value) => value && setGoal(value as OptimizationGoal)} className="grid w-full grid-cols-1 gap-2 sm:grid-cols-3">{(["dps", "balanced", "survivability"] as const).map((value) => { const Icon = value === "dps" ? Sword : value === "balanced" ? Scale : Shield; return <ToggleGroupItem key={value} value={value} className="h-20 flex-col gap-1 rounded-xl data-[state=on]:border-primary data-[state=on]:bg-primary/10 data-[state=on]:text-primary"><Icon className="size-5" /><span className="text-xs font-semibold">{value === "dps" ? "More damage" : value === "balanced" ? "A good balance" : "More defense"}</span><span className="text-[10px] font-normal text-muted-foreground">{value === "dps" ? "Offense first" : value === "balanced" ? "Damage and defense" : "Survival first"}</span></ToggleGroupItem>; })}</ToggleGroup></div>
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
                <p className="mt-1 text-sm leading-6 text-muted-foreground">We&apos;ve turned your build and goal into PoB-style Weighted Sum filters. Pick a slot, copy its recipe, then add those weights to a <span className="text-foreground">Weighted Sum</span> group on the trade site.</p>
              </div>
              <Alert className="border-primary/20 bg-primary/5"><LockKeyhole className="text-primary" /><AlertTitle>A quick note about the trade link</AlertTitle><AlertDescription>PoE creates a search link only after the form is submitted. We copy the weighted recipe and open the right league for you, but you&apos;ll enter the weights and submit the search yourself.</AlertDescription></Alert>
              <div className="grid gap-2 sm:grid-cols-2">
                {slots.map((slot) => {
                  const currentItem = build.equipment[slot];
                  const weightedSearch = weightedSearches[slot];
                  return <Card key={slot} className="gap-3 border-border/70 bg-background/35 p-4 shadow-none transition-colors hover:bg-background/50">
                    <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-medium text-primary">{slotLabels[slot]}</p><p className="mt-1 font-heading text-base font-semibold">{fixedTradeClassLabels[slot] ?? currentItem.itemClass ?? currentItem.baseType}</p><p className="mt-1 text-xs capitalize text-muted-foreground">{weightedSearch?.profile ?? "build"} search profile</p></div><Badge variant="secondary" className="shrink-0">Up to {budget} {currency === "divine" ? "div" : "chaos"}</Badge></div>
                    {weightedSearch && <div className="space-y-1.5 border-y border-border/60 py-3">
                      {weightedSearch.options.slice(0, 4).map((option) => <div key={option.id} className="flex items-start justify-between gap-3 text-[10px]"><span className="min-w-0 leading-4 text-muted-foreground">{option.label}</span><span className="shrink-0 font-mono text-primary">×{option.weight}</span></div>)}
                      {weightedSearch.options.length > 4 && <p className="font-mono text-[9px] text-muted-foreground">+ {weightedSearch.options.length - 4} more weighted stats</p>}
                    </div>}
                    <Button variant="outline" size="sm" asChild className="w-full"><a href={createTradeSiteUrl(league)} target="_blank" rel="noopener noreferrer" onClick={() => void copyWeightedTrade(slot)}>{copiedWeightedSlot === slot ? <Check /> : <Copy />}{copiedWeightedSlot === slot ? "Copied — trade opened" : "Copy weights & open trade"}<ExternalLink /></a></Button>
                  </Card>;
                })}
              </div>
              {weightedSearchError && <Alert variant="destructive"><AlertTitle>Weights not copied</AlertTitle><AlertDescription>{weightedSearchError}</AlertDescription></Alert>}
            </div>

            <div className="space-y-4">
              <div>
                <h3 className="font-heading text-xl font-semibold">Paste an item you like</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">Copy the item from its trade listing and paste the full text beginning with <span className="font-mono text-foreground">Item Class:</span>. Add the listed price so we can keep your shortlist within budget.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr]">
                <div className="space-y-2"><Label>Replacement slot</Label><Select value={candidateSlot} onValueChange={(value) => setCandidateSlot(value as EquipmentSlot)} disabled={!slots.length}><SelectTrigger className="h-10 w-full bg-background/60"><SelectValue /></SelectTrigger><SelectContent>{slots.map((slot) => <SelectItem key={slot} value={slot}>{slotLabels[slot]}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-2"><Label htmlFor="candidate-price">Listing price</Label><div className="flex"><Input id="candidate-price" type="number" min="0.1" step="0.1" value={candidatePrice} onChange={(event) => setCandidatePrice(Math.max(0.1, Number(event.target.value)))} className="h-10 rounded-r-none bg-background/60" /><Select value={candidateCurrency} onValueChange={(value) => setCandidateCurrency(value as "chaos" | "divine")}><SelectTrigger className="h-10 w-28 rounded-l-none border-l-0 bg-background/60"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="divine">Divine</SelectItem><SelectItem value="chaos">Chaos</SelectItem></SelectContent></Select></div></div>
              </div>
              <div className="space-y-2"><Label htmlFor="candidate-text">Copied item text</Label><Textarea id="candidate-text" value={candidateText} onChange={(event) => setCandidateText(event.target.value)} spellCheck={false} placeholder={'Item Class: Rings\nRarity: Rare\nExample Ring\nAmethyst Ring\n--------\n...'} className="min-h-48 resize-y bg-background/60 font-mono text-xs leading-5" /></div>
              <Button onClick={addCandidate} disabled={!candidateText.trim() || !slots.length} className="w-full"><ClipboardPaste />Save this candidate</Button>
              {candidateError && <Alert variant="destructive"><AlertTitle>Candidate not added</AlertTitle><AlertDescription>{candidateError}</AlertDescription></Alert>}
            </div>

            <div className="space-y-4 border-t border-border pt-6 lg:col-span-2">
              <div className="flex items-center justify-between gap-3"><div><h3 className="font-heading text-xl font-semibold">Compare them with your build</h3><p className="mt-1 text-sm text-muted-foreground">Path of Building will equip each item and show you what genuinely changes.</p></div><Badge variant="secondary">{candidates.length} ready</Badge></div>
              {candidates.length > 0 ? <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{candidates.map((candidate) => <Card key={candidate.id} className="gap-3 border-border/70 bg-background/35 p-4 shadow-none"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-medium text-primary">{slotLabels[candidate.slot]}</p><p className="mt-1 truncate font-heading text-base font-semibold text-amber-100">{candidate.item.name}</p><p className="truncate text-[11px] text-muted-foreground">{candidate.item.baseType}</p></div><Button variant="ghost" size="icon-sm" onClick={() => removeCandidate(candidate.id)} aria-label={`Remove ${candidate.item.name}`}><Trash2 /></Button></div><div className="flex items-center justify-between border-t border-border/60 pt-3"><span className="text-xs text-muted-foreground">{candidate.item.modifiers.length} parsed stats</span><Badge>{candidate.price.amount} {candidate.price.currency === "divine" ? "div" : "chaos"}</Badge></div></Card>)}</div> : <Alert className="border-dashed"><PackageSearch /><AlertTitle>Your shortlist is empty</AlertTitle><AlertDescription>Find a few compatible items on the official trade site, then paste each one above.</AlertDescription></Alert>}
              <Button size="lg" className="w-full shadow-lg shadow-primary/10" onClick={run} disabled={loading || !candidates.length}>{loading ? <Loader2 className="animate-spin" /> : <DatabaseZap />}{loading ? "Checking every item in PoB..." : `Compare ${candidates.length || ""} candidate${candidates.length === 1 ? "" : "s"}`}<ArrowRight /></Button>
              {optimizationError && <Alert variant="destructive"><AlertTitle>Optimization failed</AlertTitle><AlertDescription>{optimizationError}</AlertDescription></Alert>}
            </div>
          </CardContent>
        </Card>
      </>}
    </section>

    {result && build && <section id="results" className="mx-auto max-w-7xl space-y-5 px-4 py-16 sm:px-6">
      <div className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between"><div><Badge variant="outline" className="mb-3 gap-1 text-emerald-300"><CheckCircle2 className="size-3" />Verified by Path of Building · {result.evaluatedCandidates} checked</Badge><h2 className="font-heading text-4xl font-semibold">Here&apos;s what&apos;s worth buying</h2><p className="mt-2 text-sm text-muted-foreground">Calculated by {result.engineVersion ?? "Path of Building"}. Only genuine improvements are ranked.</p></div><div className="flex gap-2"><Badge variant="secondary" className="px-3 py-1.5">{league}</Badge><Badge className="px-3 py-1.5">Budget {formatPrice(result.budgetInChaos)}</Badge></div></div>
      {result.combinations[0] && <Card className="overflow-hidden border-primary/35 bg-gradient-to-br from-primary/10 via-card to-card shadow-[0_24px_65px_-48px_rgba(232,169,70,0.5)]"><CardHeader className="border-b border-primary/15"><Badge className="mb-2 w-fit gap-1"><Sparkles className="size-3" />Best combination</Badge><CardTitle className="font-heading text-2xl">{result.combinations[0].recommendations.map((item) => item.item.name).join(" + ")}</CardTitle><CardDescription>{result.combinations[0].explanation}</CardDescription></CardHeader><CardContent className="grid gap-4 pt-6 sm:grid-cols-3"><div><p className="text-xs text-muted-foreground">Total cost</p><p className="mt-1 font-mono text-xl font-semibold">{formatPrice(result.combinations[0].priceInChaos)}</p></div><div><p className="text-xs text-muted-foreground">Damage change</p><p className="mt-1 text-xl"><Delta value={percentChange(result.baselineMetrics.totalDps, result.combinations[0].changes.totalDps)} /></p></div><div><p className="text-xs text-muted-foreground">EHP change</p><p className="mt-1 text-xl"><Delta value={percentChange(result.baselineMetrics.effectiveHitPool, result.combinations[0].changes.effectiveHitPool)} /></p></div></CardContent></Card>}
      <div className="flex items-center justify-between pt-6"><div><p className="text-xs font-medium text-primary">Top picks</p><h3 className="font-heading text-2xl font-semibold">Best individual upgrades</h3></div><Badge variant="outline">{result.recommendations.length} selected</Badge></div>
      {result.recommendations.length > 0 ? <div className="grid gap-4 lg:grid-cols-2">{result.recommendations.slice(0, 6).map((recommendation, index) => <RecommendationCard key={`${recommendation.slot}-${recommendation.item.id}`} recommendation={recommendation} baseline={result.baselineMetrics} rank={index + 1} league={league} />)}</div> : <Alert className="border-amber-500/25 bg-amber-500/5"><PackageSearch className="text-amber-300" /><AlertTitle>No verified upgrades found</AlertTitle><AlertDescription>Path of Building recalculated {result.evaluatedCandidates} compatible pasted candidates, but none improved the selected goal within this budget. Add more candidates, increase the budget, or change the goal.</AlertDescription></Alert>}
      {(result.candidateEvaluations?.length ?? 0) > 0 && <div className="space-y-4 pt-8"><div><p className="text-xs font-medium text-primary">Every item we checked</p><h3 className="font-heading text-2xl font-semibold">See exactly what PoB found</h3><p className="mt-1 text-sm text-muted-foreground">We keep the recalculated changes for every item, including the ones that didn&apos;t make the shortlist.</p></div><div className="grid gap-4 lg:grid-cols-2">{result.candidateEvaluations.map((evaluation) => <CandidateEvaluationCard key={`${evaluation.slot}-${evaluation.item.id}`} evaluation={evaluation} baseline={result.baselineMetrics} />)}</div></div>}
    </section>}

    <footer className="border-t border-border"><div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-8 text-xs text-muted-foreground sm:flex-row sm:justify-between sm:px-6"><span>PoE Upgrade Optimizer</span><span>Path of Exile is a trademark of Grinding Gear Games. This project is not affiliated with GGG.</span></div></footer>
  </main>;
}
