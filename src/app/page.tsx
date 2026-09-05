"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CHALLENGES, ROLES_5, ROLE_INFO, formatTime, type SquadSize } from "@/game/types";

interface ScoreRow {
  id: number;
  teamName: string;
  players: string[];
  timeMs: number;
}

function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const random = crypto.getRandomValues(new Uint8Array(4));
  let c = "";
  for (const value of random) c += chars[value % chars.length];
  return c;
}

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [board, setBoard] = useState<Record<string, ScoreRow[]>>({});
  const [tab, setTab] = useState<SquadSize>(5);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setName(localStorage.getItem("mh_name") ?? ""));
    return () => cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    for (const c of CHALLENGES) {
      fetch(`/api/leaderboard?challenge=${c.id}&squad=${tab}&limit=5`)
        .then((r) => r.json())
        .then((d) => setBoard((b) => ({ ...b, [c.id]: d.rows ?? [] })))
        .catch(() => {});
    }
  }, [tab]);

  const saveName = () => {
    const n = name.trim().slice(0, 16) || `Player${Math.floor(Math.random() * 90 + 10)}`;
    localStorage.setItem("mh_name", n);
    return n;
  };
  const create = (solo = false) => {
    saveName();
    setBusy(true);
    router.push(`/play/${makeCode()}${solo ? "?solo=1" : ""}`);
  };
  const join = () => {
    const c = code.trim().toUpperCase();
    if (!/^[A-HJ-NP-Z2-9]{4}$/.test(c)) return;
    saveName();
    setBusy(true);
    router.push(`/play/${c}`);
  };

  return (
    <main className="min-h-dvh bg-[radial-gradient(ellipse_at_top,#1d2a5a_0%,#0b1020_60%)] text-white">
      <div className="mx-auto max-w-5xl px-5 py-10 md:py-16">
        <header className="text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.25em] text-white/70">Co-op physics party game</div>
          <h1 className="mt-4 text-6xl font-black tracking-tight md:text-8xl">
            MANY <span className="text-[#ffd23f]">HANDS</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-white/75">
            3 or 5 players. <span className="font-black text-white">One body.</span> Torso steers the eyes and balance, hands grab and carry (both must agree), legs walk in rhythm. Walk, climb, ferry cargo — and try not to fall in the water.
          </p>
          <div className="mt-3 flex items-center justify-center gap-2 text-xs font-bold">
            <span className="rounded-full bg-[#6ef29a] px-2 py-0.5 text-black">EASY · Wobble Run</span>
            <span className="rounded-full bg-[#4fa8ff] px-2 py-0.5 text-black">MEDIUM · Ferry Job</span>
            <span className="rounded-full bg-[#ff5d5d] px-2 py-0.5 text-black">HARD · Summit Sync</span>
          </div>
        </header>

        <div className="mt-10 grid gap-4 md:grid-cols-5">
          {ROLES_5.map((r, index) => (
            <div key={r} className="float rounded-2xl bg-white/5 p-4 text-center border border-white/10" style={{ animationDelay: `${(index * 0.37).toFixed(2)}s` }}>
              <div className="text-4xl">{ROLE_INFO[r].emoji}</div>
              <div className="mt-1 font-black">{ROLE_INFO[r].label}</div>
              <div className="mt-1 text-xs text-white/60">{ROLE_INFO[r].blurb}</div>
            </div>
          ))}
        </div>

        <section className="mt-10 grid gap-4 md:grid-cols-[1.2fr_1fr]">
          <div className="rounded-3xl bg-white/5 border border-white/10 p-6">
            <label className="text-xs uppercase tracking-widest text-white/60">Your name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={16}
              placeholder="e.g. Left Leg Larry"
              className="mt-1 w-full rounded-xl bg-black/40 px-4 py-3 text-lg font-bold outline-none ring-[#ffd23f] focus:ring-2"
            />
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <button disabled={busy} onClick={() => create(false)} className="rounded-2xl bg-[#ffd23f] px-5 py-4 text-xl font-black text-black shadow-[0_6px_0_#b8931a] transition hover:brightness-110 active:translate-y-1 active:shadow-none disabled:opacity-60">
                Create room
                <div className="text-xs font-bold opacity-70">3 or 5 per team · pick in lobby</div>
              </button>
              <button disabled={busy} onClick={() => create(true)} className="rounded-2xl bg-white/10 px-5 py-4 text-xl font-black shadow-[0_6px_0_rgba(0,0,0,0.4)] transition hover:bg-white/20 active:translate-y-1 active:shadow-none disabled:opacity-60">
                Solo practice
                <div className="text-xs font-bold opacity-70">control every part (Tab to switch)</div>
              </button>
            </div>
            <div className="mt-5 flex gap-2">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, ""))}
                onKeyDown={(e) => e.key === "Enter" && join()}
                maxLength={4}
                placeholder="ROOM CODE"
                className="w-full rounded-xl bg-black/40 px-4 py-3 text-lg font-black tracking-[0.3em] outline-none ring-[#4fa8ff] focus:ring-2"
              />
              <button disabled={busy} onClick={join} className="rounded-xl bg-[#4fa8ff] px-6 py-3 text-lg font-black text-black hover:brightness-110 disabled:opacity-60">
                Join
              </button>
            </div>
            <div className="mt-5 grid gap-2 text-sm text-white/70 sm:grid-cols-2">
              <div className="rounded-xl bg-black/30 p-3">
                <div className="font-black text-white">How walking works</div>
                5P: left leg presses <kbd className="rounded bg-white/15 px-1">W</kbd>, then right leg presses <kbd className="rounded bg-white/15 px-1">W</kbd>. 3P: legs holds <kbd className="rounded bg-white/15 px-1">W</kbd> to auto-alternate. Both at once? You fall on your face.
              </div>
              <div className="rounded-xl bg-black/30 p-3">
                <div className="font-black text-white">How carrying works</div>
                5P: BOTH hands must hold <kbd className="rounded bg-white/15 px-1">Space</kbd> to grab together, both <kbd className="rounded bg-white/15 px-1">Shift</kbd> to throw. 3P: arms grabs alone. Shouting (Torso <kbd className="rounded bg-white/15 px-1">Q</kbd>) helps.
              </div>
            </div>
          </div>

          <div className="rounded-3xl bg-white/5 border border-white/10 p-6">
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-widest text-white/60">Challenges & best times</div>
              <div className="flex gap-1">
                {([3, 5] as SquadSize[]).map((n) => (
                  <button key={n} onClick={() => setTab(n)} className={`rounded-lg px-2 py-0.5 text-xs font-black ${tab === n ? "bg-[#6ef29a] text-black" : "bg-white/10 text-white/70 hover:bg-white/20"}`}>
                    {n}P board
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-3 flex flex-col gap-4">
              {CHALLENGES.map((c) => (
                <div key={c.id}>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{c.icon}</span>
                    <div>
                      <div className="font-black">
                        {c.name}{" "}
                        <span className="ml-1 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-black uppercase text-white/70">{c.difficulty}</span>
                      </div>
                      <div className="text-xs text-white/60">{c.tagline}</div>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-col gap-1">
                    {(board[c.id] ?? []).length === 0 && <div className="text-xs text-white/40">No times yet.</div>}
                    {(board[c.id] ?? []).map((row, i) => (
                      <div key={row.id} className="flex items-center gap-2 rounded-lg bg-black/30 px-2 py-1 text-xs">
                        <span className="w-4 font-black text-[#ffd23f]">{i + 1}</span>
                        <span className="flex-1 truncate font-bold">{row.teamName}</span>
                        <span className="font-mono">{formatTime(row.timeMs)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <footer className="mt-10 text-center text-xs text-white/40">Built with Three.js + Rapier physics. Works best in Chrome with a keyboard and two to four friends yelling at you.</footer>
      </div>
    </main>
  );
}
