import { NextResponse } from "next/server";

const num = (x: any) => {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : 0;
};

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
  if (s.passingYards) b.push(s.passingYards + " pass yds");
  if (s.rushingYards) b.push(s.rushingYards + " rush yds");
  if (s.receptions) b.push(s.receptions + " rec");
  if (s.receivingYards) b.push(s.receivingYards + " rec yds");
  if (s.passingTD) b.push(s.passingTD + " pass TD");
  if (s.rushingTD) b.push(s.rushingTD + " rush TD");
  if (s.receivingTD) b.push(s.receivingTD + " rec TD");
  return b.join(" • ") || "No fantasy production yet";
}

function emptyStats() {
  return {
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
}

function addStat(s: any, key: string, value: any) {
  const n = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  const v = num(value);

  if (n === "rushingyards" || n === "ryds") s.rushingYards = Math.max(s.rushingYards, v);
  else if (n === "receivingyards" || n === "recyards" || n === "recyds") s.receivingYards = Math.max(s.receivingYards, v);
  else if (n === "receptions" || n === "rec") s.receptions = Math.max(s.receptions, v);
  else if (n === "rushingtouchdowns" || n === "rushingtd" || n === "rtd") s.rushingTD = Math.max(s.rushingTD, v);
  else if (n === "receivingtouchdowns" || n === "receivingtd" || n === "rectd") s.receivingTD = Math.max(s.receivingTD, v);
  else if (n === "passingyards" || n === "pyds") s.passingYards = Math.max(s.passingYards, v);
  else if (n === "passingtouchdowns" || n === "passingtd" || n === "ptd") s.passingTD = Math.max(s.passingTD, v);
  else if (n === "interceptions" || n === "int") s.interceptions = Math.max(s.interceptions, v);
  else if (n === "fumbleslost" || n === "fumlost") s.fumblesLost = Math.max(s.fumblesLost, v);
  else if (n === "twopoint" || n === "twopointconversions" || n === "twoPtConversions".toLowerCase()) s.twoPoint = Math.max(s.twoPoint, v);
}

function athleteInfo(a: any) {
  const athlete = a.athlete || a;
  return {
    name: athlete?.displayName || athlete?.fullName || a?.displayName || "Unknown",
    position: athlete?.position?.abbreviation || a?.position?.abbreviation || "",
  };
}

function parsePlayer(a: any, keys: string[], team: string) {
  const s = emptyStats();
  const values = Array.isArray(a.stats) ? a.stats : [];

  keys.forEach((key, i) => addStat(s, key, values[i]));
  if (a.statistics && !a.stats) {
    for (const st of a.statistics) {
      addStat(s, st.name || st.abbreviation || "", st.value);
    }
  }

  const info = athleteInfo(a);
  return {
    name: info.name,
    position: info.position,
    team,
    fantasy: ppr(s),
    stats: statsText(s),
  };
}

export async function GET() {
  try {
    const base = "https://site.api.espn.com/apis/site/v2/sports/football/nfl";
    const boardResponse = await fetch(base + "/scoreboard", { cache: "no-store" });
    if (!boardResponse.ok) throw new Error("Scoreboard request failed");
    const board = await boardResponse.json();
    const events = board.events || [];

    const games = await Promise.all(
      events.map(async (e: any) => {
        const c = e.competitions?.[0];
        const teams = c?.competitors || [];
        const home = teams.find((x: any) => x.homeAway === "home") || teams[0];
        const away = teams.find((x: any) => x.homeAway === "away") || teams[1];

        const playerMap = new Map<string, any>();

        try {
          const response = await fetch(base + "/summary?event=" + e.id, { cache: "no-store" });
          if (response.ok) {
            const summary = await response.json();

            for (const g of summary.boxscore?.players || []) {
              const team = g.team?.abbreviation || "";
              for (const sg of g.statistics || []) {
                const keys = Array.isArray(sg.keys) ? sg.keys : [];
                for (const a of sg.athletes || []) {
                  const p = parsePlayer(a, keys, team);
                  const key = team + ":" + p.name;

                  if (!playerMap.has(key)) {
                    playerMap.set(key, { ...p, fantasy: 0, _stats: emptyStats() });
                  }

                  const current = playerMap.get(key);
                  const values = Array.isArray(a.stats) ? a.stats : [];
                  keys.forEach((statKey: string, i: number) => addStat(current._stats, statKey, values[i]));
                  current.fantasy = ppr(current._stats);
                  current.stats = statsText(current._stats);
                  if (!current.position) current.position = p.position;
                }
              }
            }
          }
        } catch {}

        const players = Array.from(playerMap.values())
          .map(({ _stats, ...p }) => p)
          .sort((a, b) => b.fantasy - a.fantasy || a.name.localeCompare(b.name));

        return {
          id: e.id,
          status: e.status?.type?.name || "SCHEDULED",
          clock: e.status?.displayClock,
          period: e.status?.period,
          home: {
            abbr: home?.team?.abbreviation || "",
            name: home?.team?.displayName || "",
            score: num(home?.score),
          },
          away: {
            abbr: away?.team?.abbreviation || "",
            name: away?.team?.displayName || "",
            score: num(away?.score),
          },
          players,
        };
      })
    );

    return NextResponse.json({ games });
  } catch {
    return NextResponse.json({ games: [], error: "NFL feed unavailable" }, { status: 502 });
  }
}
