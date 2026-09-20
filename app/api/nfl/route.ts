import { NextResponse } from "next/server";

const num = (x: any) => (typeof x === "number" ? x : 0);

function ppr(s: any) {
  return (
    s.receivingYards / 10 +
    s.rushingYards / 10 +
    s.receivingTD * 6 +
    s.rushingTD * 6 +
    s.receptions +
    s.passingYards / 25 +
    s.passingTD * 4 -
    s.interceptions * 2 -
    s.fumblesLost * 2 +
    s.twoPoint * 2
  );
}

function statsText(s: any) {
  const b = [];
  if (s.rushingYards) b.push(s.rushingYards + " rush yds");
  if (s.receivingYards) b.push(s.receivingYards + " rec yds");
  if (s.receptions) b.push(s.receptions + " rec");
  if (s.passingYards) b.push(s.passingYards + " pass yds");
  return b.join(" • ");
}

function parseAthlete(a: any, team: string) {
  const s: any = {
    rushingYards: 0,
    receivingYards: 0,
    receivingTD: 0,
    rushingTD: 0,
    receptions: 0,
    passingYards: 0,
    passingTD: 0,
    interceptions: 0,
    fumblesLost: 0,
    twoPoint: 0,
  };

  for (const st of a.statistics || []) {
    const n = String(st.name || st.abbreviation || "").toLowerCase();
    const v = num(st.value);

    if (n.includes("rushingyards")) s.rushingYards = v;
    else if (n.includes("receivingyards")) s.receivingYards = v;
    else if (n === "receptions") s.receptions = v;
    else if (n.includes("rushingtouchdowns")) s.rushingTD = v;
    else if (n.includes("receivingtouchdowns")) s.receivingTD = v;
    else if (n.includes("passingyards")) s.passingYards = v;
    else if (n.includes("passingtouchdowns")) s.passingTD = v;
    else if (n === "interceptions") s.interceptions = v;
    else if (n.includes("fumbleslost")) s.fumblesLost = v;
    else if (n.includes("twopoint")) s.twoPoint = v;
  }

  return {
    name: a.athlete?.displayName || a.displayName || "Unknown",
    position: a.athlete?.position?.abbreviation || a.position?.abbreviation || "",
    team,
    fantasy: ppr(s),
    stats: statsText(s),
  };
}

export async function GET() {
  try {
    const base = "https://site.api.espn.com/apis/site/v2/sports/football/nfl";

    const board = await fetch(base + "/scoreboard", { cache: "no-store" }).then((r) => r.json());
    const events = board.events || [];

    const games = await Promise.all(
      events.map(async (e: any) => {
        const c = e.competitions?.[0];
        const teams = c?.competitors || [];
        const home = teams.find((x: any) => x.homeAway === "home") || teams[0];
        const away = teams.find((x: any) => x.homeAway === "away") || teams[1];

        let players: any[] = [];

        try {
          const summary = await fetch(base + "/summary?event=" + e.id, {
            cache: "no-store",
          }).then((r) => r.json());

          for (const g of summary.boxscore?.players || []) {
            for (const sg of g.statistics || []) {
              for (const a of sg.athletes || []) {
                const p = parseAthlete(a, g.team?.abbreviation || "");
                if (p.fantasy !== 0) players.push(p);
              }
            }
          }

          const seen = new Set<string>();
          players = players.filter((p) => {
            const key = p.team + ":" + p.name;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });

          players.sort((a, b) => b.fantasy - a.fantasy);
        } catch {}

        return {
          id: e.id,
          status: e.status?.type?.name || "SCHEDULED",
          clock: e.status?.displayClock,
          period: e.status?.period,
          home: {
            abbr: home?.team?.abbreviation || "",
            name: home?.team?.displayName || "",
            score: num(Number(home?.score)),
          },
          away: {
            abbr: away?.team?.abbreviation || "",
            name: away?.team?.displayName || "",
            score: num(Number(away?.score)),
          },
          players,
        };
      })
    );

    return NextResponse.json({ games });
  } catch {
    return NextResponse.json(
      { games: [], error: "NFL feed unavailable" },
      { status: 502 }
    );
  }
}
