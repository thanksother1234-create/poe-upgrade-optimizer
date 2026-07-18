import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { url?: string };
    if (!body.url) return NextResponse.json({ error: "A PoB link is required." }, { status: 400 });
    const url = new URL(body.url);
    if (!['pobb.in', 'www.pobb.in'].includes(url.hostname.toLowerCase())) {
      return NextResponse.json({ error: "Only pobb.in links are supported right now." }, { status: 400 });
    }
    const id = url.pathname.split("/").filter(Boolean)[0];
    if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) return NextResponse.json({ error: "That pobb.in link is not valid." }, { status: 400 });
    const response = await fetch(`https://pobb.in/${id}/raw`, { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0 PoE-Upgrade-Optimizer/0.1" } });
    if (!response.ok) return NextResponse.json({ error: `pobb.in returned ${response.status} for this build.` }, { status: 502 });
    const code = (await response.text()).trim();
    if (!code) return NextResponse.json({ error: "pobb.in returned an empty build." }, { status: 502 });
    return NextResponse.json({ code });
  } catch {
    return NextResponse.json({ error: "Unable to retrieve that pobb.in build." }, { status: 400 });
  }
}
