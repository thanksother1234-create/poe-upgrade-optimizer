"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity, ArrowRight, CheckCircle2, CircleDollarSign, DatabaseZap, Gauge,
  HeartPulse, Import, Loader2, LockKeyhole, PackageSearch, Scale, Shield,
  Sparkles, Sword, WandSparkles, Wifi, WifiOff, Zap,
} from "lucide-react";
import { Build, EQUIPMENT_SLOTS, EquipmentSlot, LeagueResponse, OptimizationGoal, OptimizationResult, PoeLeague, UpgradeRecommendation } from "@/models";
import { MvpPobCalculationService } from "@/services/pob/pob-calculation-service";
import { MockTradeMarketService } from "@/services/trade/trade-market-service";
import { UpgradeOptimizer } from "@/services/optimizer/upgrade-optimizer";
import { isPermanentLeague } from "@/services/league/league-service";
import { formatNumber, formatPrice, percentChange } from "@/lib/metrics";
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

const pobService = new MvpPobCalculationService();
const optimizer = new UpgradeOptimizer(pobService, new MockTradeMarketService());
const slotLabels: Record<EquipmentSlot, string> = { weapon: "Weapon", offhand: "Offhand", helmet: "Helmet", bodyArmour: "Body Armour", gloves: "Gloves", boots: "Boots", amulet: "Amulet", ring1: "Ring 1", ring2: "Ring 2", belt: "Belt" };
const defaultSlots: EquipmentSlot[] = ["weapon", "boots", "amulet", "ring1", "ring2"];
const fallbackLeague: PoeLeague = { id: "Standard", name: "Standard", realm: "pc", startAt: "2013-01-23T21:00:00Z", endAt: null };

function SectionHeading({ number, eyebrow, title, icon: Icon }: { number: string; eyebrow: string; title: string; icon: typeof Activity }) {
  return <div className="flex items-center gap-3">
    <div className="grid size-9 shrink-0 place-items-center rounded-md border border-primary/30 bg-primary/10 text-xs font-bold text-primary">{number}</div>
    <div className="min-w-0"><p className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground">{eyebrow}</p><h2 className="flex items-center gap-2 font-heading text-xl font-semibold"><Icon className="size-4 text-primary" />{title}</h2></div>
  </div>;
}

function Delta({ value, suffix = "%" }: { value: number; suffix?: string }) {
  return <span className={cn("font-mono font-semibold", value > 0 ? "text-emerald-400" : value < 0 ? "text-red-400" : "text-muted-foreground")}>{value > 0 ? "+" : ""}{value.toFixed(1)}{suffix}</span>;
}

function Metric({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: typeof Activity }) {
  return <div className="space-y-2 p-5"><div className="flex items-center gap-2 font-mono text-[10px] tracking-wider text-muted-foreground"><Icon className="size-3.5 text-primary" />{label}</div><p className="font-mono text-2xl font-semibold tracking-tight">{value}</p><p className="truncate text-xs text-muted-foreground">{detail}</p></div>;
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

function RecommendationCard({ recommendation, build, rank }: { recommendation: UpgradeRecommendation; build: Build; rank: number }) {
  const dps = percentChange(build.metrics.totalDps, recommendation.changes.totalDps);
  const ehp = percentChange(build.metrics.effectiveHitPool, recommendation.changes.effectiveHitPool);
  return <Card className="gap-0 overflow-hidden border-border/80 bg-card/80 py-0 shadow-none transition-colors hover:border-primary/35">
    <CardHeader className="grid grid-cols-[auto_1fr_auto] items-start gap-3 border-b border-border/70 px-5 py-5">
      <Badge variant="outline" className="font-mono text-muted-foreground">#{rank.toString().padStart(2, "0")}</Badge>
      <div><CardDescription className="font-mono text-[10px] uppercase tracking-widest text-primary">{slotLabels[recommendation.slot]}</CardDescription><CardTitle className="mt-1 font-heading text-xl text-amber-200">{recommendation.item.name}</CardTitle><p className="mt-1 text-xs text-muted-foreground">Replaces {recommendation.currentItem.name}</p></div>
      <Badge className="bg-primary text-primary-foreground">{formatPrice(recommendation.priceInChaos)}</Badge>
    </CardHeader>
    <CardContent className="space-y-4 p-5">
      <div className="grid grid-cols-4 divide-x divide-border rounded-md border border-border bg-background/40">{[["DPS", <Delta key="dps" value={dps} />], ["EHP", <Delta key="ehp" value={ehp} />], ["PHYS", <Delta key="phys" value={percentChange(build.metrics.physicalMaxHit, recommendation.changes.physicalMaxHit)} />], ["SCORE", <span key="score" className="font-mono font-semibold">{recommendation.score.toFixed(1)}</span>]].map(([label, value]) => <div key={label as string} className="space-y-1 px-3 py-2"><p className="font-mono text-[9px] text-muted-foreground">{label}</p>{value}</div>)}</div>
      <div className="flex flex-wrap gap-2">{recommendation.item.modifiers.slice(0, 2).map((mod) => <Badge variant="secondary" key={mod.label} className="font-normal text-muted-foreground">{mod.label}</Badge>)}</div>
      <Alert className="border-primary/20 bg-primary/5"><Sparkles className="text-primary" /><AlertTitle className="font-mono text-[10px] tracking-wider text-primary">WHY THIS UPGRADE</AlertTitle><AlertDescription>{recommendation.explanation}</AlertDescription></Alert>
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
  const [leagues, setLeagues] = useState<PoeLeague[]>([fallbackLeague]);
  const [league, setLeague] = useState("Standard");
  const [currentLeague, setCurrentLeague] = useState("Standard");
  const [leagueLoading, setLeagueLoading] = useState(true);
  const [leagueSource, setLeagueSource] = useState<LeagueResponse["source"]>("fallback");

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
  const importBuild = async () => { try { setImporting(true); setError(""); setBuild(await pobService.importBuild(pobCode)); setResult(null); } catch (caught) { setError(caught instanceof Error ? caught.message : "Import failed"); } finally { setImporting(false); } };
  const run = async () => { if (!build || !slots.length) return; setLoading(true); setResult(await optimizer.optimize({ build, budget: { amount: budget, currency }, goal, allowedSlots: slots, league })); setLoading(false); setTimeout(() => document.getElementById("results")?.scrollIntoView({ behavior: "smooth" }), 20); };
  const toggleSlot = (slot: EquipmentSlot) => setSlots((current) => current.includes(slot) ? current.filter((item) => item !== slot) : [...current, slot]);

  return <main className="min-h-screen bg-background text-foreground">
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <a className="flex items-center gap-3" href="#top" aria-label="PoE Upgrade Optimizer home"><div className="grid size-9 place-items-center rounded-md border border-primary/40 bg-primary/10"><WandSparkles className="size-5 text-primary" /></div><div className="leading-none"><p className="font-heading text-sm font-semibold tracking-wide"><span className="text-primary">POE</span> UPGRADE OPTIMIZER</p><p className="mt-1 font-mono text-[9px] tracking-widest text-muted-foreground">DETERMINISTIC BUILD INTELLIGENCE</p></div></a>
        <div className="flex items-center gap-2"><Badge variant="outline" className="hidden gap-1.5 sm:flex">{leagueSource === "official" ? <Wifi className="size-3 text-emerald-400" /> : <WifiOff className="size-3 text-amber-400" />}{leagueSource === "official" ? "LIVE LEAGUES" : "FALLBACK"}</Badge><Badge className="max-w-40 truncate bg-primary/15 text-primary hover:bg-primary/15">{leagueLoading ? "Detecting league..." : league}</Badge></div>
      </div>
    </header>

    <section id="top" className="mx-auto grid max-w-7xl gap-8 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_auto] lg:items-end lg:py-20">
      <div><Badge variant="outline" className="mb-5 font-mono tracking-widest text-primary">BUILD INTELLIGENCE / 01</Badge><h1 className="max-w-3xl font-heading text-5xl font-semibold leading-[0.95] tracking-tight sm:text-7xl">Spend smarter.<br /><span className="text-primary">Scale harder.</span></h1><p className="mt-6 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">Import your build, choose the market you play in, and rank upgrades using deterministic simulations within your budget.</p></div>
      <Card className="min-w-72 border-primary/20 bg-primary/5 shadow-none"><CardHeader><CardDescription className="font-mono text-[10px] tracking-widest">SIMULATION MODEL</CardDescription><CardTitle className="flex items-center gap-2"><DatabaseZap className="size-5 text-primary" />PoB-compatible</CardTitle></CardHeader><CardContent className="font-mono text-[10px] tracking-wider text-muted-foreground">MOCK TRADE ADAPTER / DETERMINISTIC</CardContent></Card>
    </section>

    <section className="mx-auto max-w-7xl space-y-4 px-4 pb-12 sm:px-6">
      <Card className="border-border/80 bg-card/80 shadow-xl shadow-black/10">
        <CardHeader className="flex flex-col gap-5 border-b border-border/70 sm:flex-row sm:items-center sm:justify-between"><SectionHeading number="01" eyebrow="BUILD SOURCE" title="Import and market" icon={Import} />{build && <Badge className="gap-1 bg-emerald-500/15 text-emerald-300"><CheckCircle2 className="size-3" />BUILD PARSED</Badge>}</CardHeader>
        <CardContent className="grid min-w-0 gap-6 pt-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0 space-y-2"><div className="flex items-center justify-between gap-3"><Label htmlFor="pob">PoB export code or pobb.in link</Label>{pobCode && <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{pobCode.length.toLocaleString()} characters</span>}</div><Textarea id="pob" value={pobCode} wrap="soft" spellCheck={false} placeholder="Paste eNrt... export code or https://pobb.in/..." onChange={(event) => setPobCode(event.target.value)} className="h-32 max-h-80 min-h-28 resize-y bg-background/60 font-mono text-xs leading-5" /><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-muted-foreground">Reads the active item set, character settings, main skill, and saved PoB metrics.</p><Button onClick={importBuild} disabled={importing || !pobCode.trim()} className="shrink-0">{importing ? <Loader2 className="animate-spin" /> : <Import />} {importing ? "Decoding build" : "Import build"}<ArrowRight /></Button></div></div>
          <div className="min-w-0 space-y-3 rounded-lg border border-border bg-background/40 p-4"><div className="flex items-center justify-between"><Label>Trade league</Label>{league === currentLeague && !leagueLoading && <Badge variant="secondary" className="gap-1 text-[10px]"><Sparkles className="size-3 text-primary" />CURRENT</Badge>}</div><LeagueSelect leagues={leagues} value={league} currentLeague={currentLeague} loading={leagueLoading} onChange={setLeague} /><p className="text-xs leading-5 text-muted-foreground">Auto-detected from the official PoE league feed. {leagueGroups.challenge} challenge and {leagueGroups.permanent} permanent leagues available.</p></div>
          {error && <Alert variant="destructive" className="lg:col-span-2"><AlertTitle>Import failed</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
        </CardContent>
      </Card>

      {!build ? <Card className="border-dashed bg-card/30 py-14 text-center shadow-none"><CardContent className="flex flex-col items-center"><div className="mb-4 grid size-12 place-items-center rounded-full bg-muted"><LockKeyhole className="size-5 text-muted-foreground" /></div><CardTitle className="font-heading text-2xl">Build analysis locked</CardTitle><CardDescription className="mt-2">Import a build to inspect its active equipment and run the optimizer.</CardDescription></CardContent></Card> : <>
        <Card className="overflow-hidden border-border/80 bg-card/80 py-0 shadow-none">
          <div className="grid lg:grid-cols-[390px_1fr]"><div className="flex items-center gap-4 border-b border-border p-6 lg:border-r lg:border-b-0"><div className="grid size-16 shrink-0 place-items-center rounded-lg border border-primary/30 bg-primary/10 font-heading text-3xl text-primary">{build.character.name.charAt(0).toUpperCase()}</div><div className="min-w-0"><Badge variant="outline" className="mb-2 font-mono text-[10px]">LEVEL {build.character.level}</Badge><h2 className="truncate font-heading text-2xl font-semibold">{build.character.name}</h2><p className="mt-1 text-sm text-muted-foreground">{build.character.ascendancy} {build.character.className} / {build.character.mainSkill}</p></div></div><div className="grid divide-y divide-border sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4"><Metric label="COMBINED DPS" value={build.metrics.totalDps >= 1_000_000 ? `${(build.metrics.totalDps / 1_000_000).toFixed(1)}M` : formatNumber(build.metrics.totalDps)} detail={build.character.mainSkill} icon={Zap} /><Metric label="EFFECTIVE HIT POOL" value={formatNumber(build.metrics.effectiveHitPool)} detail="Saved PoB config" icon={HeartPulse} /><Metric label="PHYSICAL MAX HIT" value={formatNumber(build.metrics.physicalMaxHit)} detail="Saved PoB config" icon={Shield} /><Metric label="RESISTANCES" value={`${build.metrics.fireResistance}/${build.metrics.coldResistance}/${build.metrics.lightningResistance}`} detail={`Chaos ${build.metrics.chaosResistance}%`} icon={Gauge} /></div></div>
        </Card>

        <div className="grid gap-4 lg:grid-cols-[0.92fr_1.08fr]">
          <Card className="border-border/80 bg-card/80 shadow-none"><CardHeader><SectionHeading number="02" eyebrow="CURRENT LOADOUT" title="Active item set" icon={PackageSearch} /></CardHeader><CardContent className="grid gap-2 sm:grid-cols-2">{EQUIPMENT_SLOTS.map((slot) => { const item = build.equipment[slot]; return <Card key={slot} className="gap-3 border-border/70 bg-background/45 p-4 shadow-none"><div className="flex items-start gap-3"><div className="grid size-9 shrink-0 place-items-center rounded-md border border-primary/20 bg-primary/5 font-heading text-primary">{slotLabels[slot].charAt(0)}</div><div className="min-w-0"><p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">{slotLabels[slot]}</p><p className={cn("mt-1 truncate font-heading text-sm font-semibold", item.rarity === "unique" ? "text-orange-400" : item.rarity === "magic" ? "text-indigo-300" : item.rarity === "rare" ? "text-amber-200" : "text-muted-foreground")}>{item.name}</p><p className="truncate text-[11px] text-muted-foreground">{item.baseType}</p></div></div>{item.modifiers.length > 0 && <div className="space-y-1 border-t border-border/60 pt-3">{item.modifiers.slice(0, 2).map((modifier, index) => <p key={`${modifier.label}-${index}`} className="truncate text-[10px] text-muted-foreground">+ {modifier.label}</p>)}</div>}</Card>; })}</CardContent></Card>

          <Card className="border-border/80 bg-card/80 shadow-none"><CardHeader><SectionHeading number="03" eyebrow="SEARCH PARAMETERS" title="Upgrade optimizer" icon={Activity} /></CardHeader><CardContent className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-[1fr_180px]"><div className="space-y-2"><Label htmlFor="budget">Budget</Label><div className="flex"><Input id="budget" type="number" min="1" value={budget} onChange={(event) => setBudget(Math.max(1, Number(event.target.value)))} className="h-11 rounded-r-none bg-background/60 font-mono text-lg" /><Select value={currency} onValueChange={(value) => setCurrency(value as "chaos" | "divine")}><SelectTrigger className="h-11 w-32 rounded-l-none border-l-0 bg-background/60"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="divine">Divine</SelectItem><SelectItem value="chaos">Chaos</SelectItem></SelectContent></Select></div></div><div className="space-y-2"><Label>Market</Label><div className="flex h-11 items-center gap-2 rounded-lg border border-input bg-background/60 px-3 text-sm"><CircleDollarSign className="size-4 text-primary" /><span className="truncate">{league}</span></div></div></div>
            <div className="space-y-2"><Label>Optimization goal</Label><ToggleGroup type="single" variant="outline" value={goal} onValueChange={(value) => value && setGoal(value as OptimizationGoal)} className="grid w-full grid-cols-1 gap-2 sm:grid-cols-3">{(["dps", "balanced", "survivability"] as const).map((value) => { const Icon = value === "dps" ? Sword : value === "balanced" ? Scale : Shield; return <ToggleGroupItem key={value} value={value} className="h-20 flex-col gap-1 data-[state=on]:border-primary data-[state=on]:bg-primary/10 data-[state=on]:text-primary"><Icon className="size-5" /><span className="text-xs font-semibold">{value === "dps" ? "MAX DPS" : value === "balanced" ? "BALANCED" : "SURVIVABILITY"}</span><span className="text-[10px] font-normal text-muted-foreground">{value === "dps" ? "Pure offense" : value === "balanced" ? "Offense + defense" : "Defense first"}</span></ToggleGroupItem>; })}</ToggleGroup></div>
            <div className="space-y-3"><div className="flex items-center justify-between"><Label>Slots allowed to change</Label><Badge variant="outline">{slots.length} selected</Badge></div><div className="grid grid-cols-2 gap-2">{EQUIPMENT_SLOTS.map((slot) => <Label key={slot} className={cn("flex cursor-pointer items-center gap-3 rounded-md border border-border bg-background/30 p-3 text-xs font-normal transition-colors hover:bg-accent", slots.includes(slot) && "border-primary/35 bg-primary/5")}><Checkbox checked={slots.includes(slot)} onCheckedChange={() => toggleSlot(slot)} />{slotLabels[slot]}</Label>)}</div></div>
            <Separator />
            <Button size="lg" className="w-full" onClick={run} disabled={loading || !slots.length}>{loading ? <Loader2 className="animate-spin" /> : <Activity />}{loading ? "Running simulations" : "Find best upgrades"}<ArrowRight /></Button>
            <p className="flex items-center justify-center gap-2 font-mono text-[10px] tracking-wide text-muted-foreground"><DatabaseZap className="size-3 text-emerald-400" />Deterministic mock simulations. No LLM calculations.</p>
          </CardContent></Card>
        </div>
      </>}
    </section>

    {result && build && <section id="results" className="mx-auto max-w-7xl space-y-5 px-4 py-16 sm:px-6">
      <div className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between"><div><Badge variant="outline" className="mb-3 gap-1 font-mono text-emerald-300"><CheckCircle2 className="size-3" />OPTIMIZATION COMPLETE</Badge><h2 className="font-heading text-4xl font-semibold">Best upgrade paths</h2></div><div className="flex gap-2"><Badge variant="secondary" className="px-3 py-1.5">{league}</Badge><Badge className="px-3 py-1.5">Budget {formatPrice(result.budgetInChaos)}</Badge></div></div>
      {result.combinations[0] && <Card className="overflow-hidden border-primary/35 bg-gradient-to-br from-primary/10 via-card to-card shadow-none"><CardHeader className="border-b border-primary/15"><Badge className="mb-2 w-fit gap-1"><Sparkles className="size-3" />BEST COMBINATION</Badge><CardTitle className="font-heading text-2xl">{result.combinations[0].recommendations.map((item) => item.item.name).join(" + ")}</CardTitle><CardDescription>{result.combinations[0].explanation}</CardDescription></CardHeader><CardContent className="grid gap-4 pt-6 sm:grid-cols-3"><div><p className="font-mono text-[10px] text-muted-foreground">TOTAL COST</p><p className="mt-1 font-mono text-xl font-semibold">{formatPrice(result.combinations[0].priceInChaos)}</p></div><div><p className="font-mono text-[10px] text-muted-foreground">DPS CHANGE</p><p className="mt-1 text-xl"><Delta value={percentChange(build.metrics.totalDps, result.combinations[0].changes.totalDps)} /></p></div><div><p className="font-mono text-[10px] text-muted-foreground">EHP CHANGE</p><p className="mt-1 text-xl"><Delta value={percentChange(build.metrics.effectiveHitPool, result.combinations[0].changes.effectiveHitPool)} /></p></div></CardContent></Card>}
      <div className="flex items-center justify-between pt-6"><div><p className="font-mono text-[10px] tracking-widest text-primary">RANKED RESULTS</p><h3 className="font-heading text-2xl font-semibold">Best individual upgrades</h3></div><Badge variant="outline">{result.recommendations.length} qualified</Badge></div>
      <div className="grid gap-4 lg:grid-cols-2">{result.recommendations.slice(0, 6).map((recommendation, index) => <RecommendationCard key={recommendation.item.id} recommendation={recommendation} build={build} rank={index + 1} />)}</div>
    </section>}

    <footer className="border-t border-border"><div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-8 font-mono text-[9px] tracking-wider text-muted-foreground sm:flex-row sm:justify-between sm:px-6"><span>POE UPGRADE OPTIMIZER / MVP</span><span>Path of Exile is a trademark of Grinding Gear Games. This project is not affiliated with GGG.</span></div></footer>
  </main>;
}
