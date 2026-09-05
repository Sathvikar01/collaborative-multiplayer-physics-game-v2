"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { CHALLENGES, ROLES_5, ROLE_INFO, formatTime, type SquadSize } from "@/game/types";
import { RoleGlyph } from "@/components/RoleGlyph";

interface ScoreRow {
  id: number;
  teamName: string;
  players: string[];
  timeMs: number;
}

const ROOM_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{4}$/;

function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const random = crypto.getRandomValues(new Uint8Array(4));
  let c = "";
  for (const value of random) c += chars[value % chars.length];
  return c;
}

function GameplayWorld() {
  return (
    <div className="world-frame" aria-label="A stylized view of the Many Hands physics world" role="img">
      <div className="world-frame__hud world-frame__hud--top"><span className="world-frame__status-dot" /><span>LIVE WORLD</span><span className="world-frame__hud-muted">SIM 01 / 60 FPS</span></div>
      <svg className="world-scene" viewBox="0 0 780 620" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id="sky" x1="390" y1="0" x2="390" y2="620" gradientUnits="userSpaceOnUse"><stop stopColor="#202A31" /><stop offset="0.58" stopColor="#11191D" /><stop offset="1" stopColor="#070A0C" /></linearGradient>
          <linearGradient id="water" x1="390" y1="305" x2="390" y2="620" gradientUnits="userSpaceOnUse"><stop stopColor="#20383B" /><stop offset="1" stopColor="#091113" /></linearGradient>
          <linearGradient id="platform" x1="265" y1="395" x2="593" y2="527" gradientUnits="userSpaceOnUse"><stop stopColor="#8C806B" /><stop offset="1" stopColor="#514B42" /></linearGradient>
          <linearGradient id="body" x1="370" y1="190" x2="490" y2="444" gradientUnits="userSpaceOnUse"><stop stopColor="#DEE4DF" /><stop offset="0.5" stopColor="#A3B0A9" /><stop offset="1" stopColor="#64736E" /></linearGradient>
          <linearGradient id="suit" x1="402" y1="258" x2="491" y2="397" gradientUnits="userSpaceOnUse"><stop stopColor="#D9D5BD" /><stop offset="1" stopColor="#928B6C" /></linearGradient>
          <filter id="softShadow" x="-30%" y="-30%" width="160%" height="180%"><feGaussianBlur stdDeviation="16" /></filter>
          <filter id="glow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="8" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          <pattern id="grid" width="42" height="42" patternUnits="userSpaceOnUse"><path d="M42 0H0V42" stroke="#DDE5DF" strokeOpacity=".08" /></pattern>
        </defs>
        <rect width="780" height="620" fill="url(#sky)" />
        <path d="M0 300C126 263 178 294 286 266C396 238 498 257 780 208V620H0V300Z" fill="url(#water)" />
        <path d="M0 349C126 311 202 334 306 310C447 277 574 293 780 246" stroke="#9AAFA7" strokeOpacity=".16" strokeWidth="2" /><path d="M0 392C126 357 202 379 306 354C447 321 574 337 780 290" stroke="#9AAFA7" strokeOpacity=".11" /><path d="M0 435C126 400 202 422 306 397C447 364 574 380 780 333" stroke="#9AAFA7" strokeOpacity=".08" />
        <path d="M0 0H780V620H0Z" fill="url(#grid)" />
        <path d="M116 360L269 319L634 409L478 466L116 360Z" fill="#101516" fillOpacity=".55" filter="url(#softShadow)" /><path d="M107 328L258 294L639 390L482 447L107 328Z" fill="url(#platform)" stroke="#B7AA91" strokeOpacity=".5" strokeWidth="2" /><path d="M258 294L258 346L482 497L482 447L258 294Z" fill="#625C51" /><path d="M482 447L639 390L639 439L482 497V447Z" fill="#3B3934" /><path d="M154 325L260 301L589 383L485 421L154 325Z" stroke="#ECE5D1" strokeOpacity=".16" strokeWidth="2" />
        <path d="M220 289L175 214" stroke="#9FAEAA" strokeOpacity=".54" strokeWidth="3" /><path d="M175 214L159 223L179 228L190 211L175 214Z" fill="#D5DDDA" /><path d="M550 368L614 298" stroke="#9FAEAA" strokeOpacity=".54" strokeWidth="3" /><path d="M614 298L629 309L609 310L601 293L614 298Z" fill="#D5DDDA" />
        <ellipse cx="412" cy="448" rx="132" ry="24" fill="#020404" fillOpacity=".6" filter="url(#softShadow)" /><g filter="url(#glow)"><circle cx="447" cy="150" r="6" fill="#C2FF7A" /><circle cx="447" cy="150" r="13" stroke="#C2FF7A" strokeOpacity=".22" /></g>
        <g><path d="M395 183C405 160 439 153 463 169L481 196L465 235L398 231L381 205L395 183Z" fill="url(#body)" stroke="#EAF2EB" strokeOpacity=".55" strokeWidth="2" /><path d="M406 173C421 159 450 160 462 175L456 203L411 201L406 173Z" fill="#4C5754" /><path d="M414 180L431 174L450 181L446 193L419 191L414 180Z" fill="#D8E4DF" fillOpacity=".8" /><path d="M397 225L473 225L493 335L420 370L383 320L397 225Z" fill="url(#suit)" stroke="#E5E5D2" strokeOpacity=".44" strokeWidth="2" /><path d="M422 235L449 237L457 328L424 340L410 306L422 235Z" fill="#646554" fillOpacity=".8" /><path d="M401 235L371 281L327 293L333 309L388 302L423 263L401 235Z" fill="url(#body)" stroke="#EAF2EB" strokeOpacity=".4" strokeWidth="2" /><path d="M470 235L501 275L546 287L540 303L487 294L450 262L470 235Z" fill="url(#body)" stroke="#EAF2EB" strokeOpacity=".4" strokeWidth="2" /><path d="M327 293L315 300L331 305L344 300L327 293ZM546 287L559 292L545 300L531 295L546 287Z" fill="#D8E1DB" /><path d="M421 340L404 415L383 445L399 451L436 421L448 352L421 340Z" fill="url(#body)" stroke="#EAF2EB" strokeOpacity=".4" strokeWidth="2" /><path d="M454 335L470 405L501 436L488 446L448 419L427 351L454 335Z" fill="url(#body)" stroke="#EAF2EB" strokeOpacity=".4" strokeWidth="2" /><path d="M383 444L399 451L382 465L358 460L365 448L383 444ZM501 436L513 447L498 459L480 447L488 441L501 436Z" fill="#DCE3DD" /></g>
        <path d="M289 348L331 358M530 358L572 345" stroke="#C2FF7A" strokeOpacity=".85" strokeWidth="2" strokeDasharray="5 8" /><circle cx="289" cy="348" r="4" fill="#C2FF7A" /><circle cx="572" cy="345" r="4" fill="#C2FF7A" />
      </svg>
      <div className="world-frame__hud world-frame__hud--bottom"><span>SYNCED BODY</span><span className="world-frame__meter"><span /></span><span>72%</span></div>
      <div className="world-frame__caption">A body is only as coordinated as its loudest friend.</div>
    </div>
  );
}

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [board, setBoard] = useState<Record<string, ScoreRow[]>>({});
  const [tab, setTab] = useState<SquadSize>(5);
  const [busy, setBusy] = useState(false);
  const [joinError, setJoinError] = useState("");
  const [leaderboardError, setLeaderboardError] = useState("");

  useEffect(() => {
    const frame = requestAnimationFrame(() => setName(localStorage.getItem("mh_name") ?? ""));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all(CHALLENGES.map((c) => fetch(`/api/leaderboard?challenge=${c.id}&squad=${tab}&limit=5`).then((r) => { if (!r.ok) throw new Error("Leaderboard unavailable"); return r.json() as Promise<{ rows?: ScoreRow[] }>; }).then((d) => [c.id, d.rows ?? []] as const))).then((entries) => {
      if (active) setBoard(Object.fromEntries(entries));
    }).catch(() => {
      if (active) setLeaderboardError("Best times are temporarily unavailable. Try again in a moment.");
    });
    return () => { active = false; };
  }, [tab]);

  const saveName = () => {
    const n = name.trim().slice(0, 16) || `Player${Math.floor(Math.random() * 90 + 10)}`;
    localStorage.setItem("mh_name", n);
    return n;
  };
  const create = (solo = false) => { saveName(); setJoinError(""); setBusy(true); router.push(`/play/${makeCode()}${solo ? "?solo=1" : ""}`); };
  const join = () => {
    const c = code.trim().toUpperCase();
    if (!ROOM_CODE_PATTERN.test(c)) { setJoinError("Enter the four-character room code shown by your host."); return; }
    saveName(); setJoinError(""); setBusy(true); router.push(`/play/${c}`);
  };

  return (
    <main className="landing-page">
      <div className="landing-noise" aria-hidden="true" />
      <div className="landing-shell">
        <nav className="site-nav" aria-label="Main navigation"><a className="brand-mark" href="#top" aria-label="Many Hands home"><span className="brand-mark__glyph" aria-hidden="true"><span /><span /><span /><span /></span><span>MANY HANDS</span></a><div className="site-nav__meta"><span className="nav-live-dot" /> Multiplayer physics / 01</div><a className="site-nav__jump" href="#leaderboard">View times <span aria-hidden="true">↘</span></a></nav>
        <section id="top" className="hero-grid">
          <div className="hero-copy"><p className="eyebrow"><span className="eyebrow__line" /> Co-op physics party game</p><h1>One body.<br /><em>Many hands.</em></h1><p className="hero-description">Three or five players share one wobbly body. Coordinate every step, grab, and climb before the water gets you.</p><div className="hero-specs" aria-label="Game features"><span><strong>3 / 5</strong> players</span><span><strong>01</strong> shared body</span><span><strong>∞</strong> shouting</span></div></div>
          <div className="hero-visual"><GameplayWorld /></div>
          <section className="action-panel" aria-labelledby="start-heading"><div className="action-panel__header"><div><p className="eyebrow eyebrow--small">Get into the world</p><h2 id="start-heading">Start a session</h2></div><span className="action-panel__index">02</span></div><label className="field-label" htmlFor="player-name">Your name</label><input id="player-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={16} autoComplete="nickname" placeholder="e.g. Left Leg Larry" className="field-input" /><p className="field-hint">16 characters max. A name is generated if you leave this blank.</p><div className="action-grid"><button type="button" disabled={busy} onClick={() => create(false)} className="button button--primary"><span>Create room</span><small>3 or 5 per team</small><span className="button__arrow" aria-hidden="true">↗</span></button><button type="button" disabled={busy} onClick={() => create(true)} className="button button--secondary"><span>Solo practice</span><small>Control every part</small><span className="button__arrow" aria-hidden="true">↗</span></button></div><div className="join-divider"><span>or join an existing room</span></div><form className="join-form" onSubmit={(event) => { event.preventDefault(); join(); }}><label className="sr-only" htmlFor="room-code">Four-character room code</label><input id="room-code" value={code} onChange={(e) => { setCode(e.target.value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, "")); setJoinError(""); }} maxLength={4} inputMode="text" autoComplete="off" placeholder="ROOM CODE" aria-invalid={Boolean(joinError)} aria-describedby={joinError ? "room-code-error" : "room-code-hint"} className="field-input field-input--code" /><button type="submit" disabled={busy} className="button button--join">Join <span aria-hidden="true">↗</span></button></form>{joinError ? <p id="room-code-error" className="form-message form-message--error" role="alert">{joinError}</p> : <p id="room-code-hint" className="field-hint">Ask your host for the code displayed in their lobby.</p>}{busy && <p className="form-message form-message--loading" role="status"><span className="loading-bar" /> Preparing your physics world...</p>}</section>
        </section>
        <section className="roles-section" aria-labelledby="roles-heading"><div className="section-heading"><div><p className="eyebrow eyebrow--small">The team anatomy</p><h2 id="roles-heading">Every limb has a job.</h2></div><p>Communication is the control scheme. Pick a role in the lobby, then find your rhythm.</p></div><div className="roles-grid">{ROLES_5.map((r, index) => <div key={r} className="role-card" style={{ "--role-delay": `${(index * 0.14).toFixed(2)}s` } as CSSProperties}><span className="role-card__number">0{index + 1}</span><RoleGlyph role={r} className="role-card__glyph" /><span className="role-card__label">{ROLE_INFO[r].label}</span><span className="role-card__blurb">{ROLE_INFO[r].blurb}</span></div>)}</div></section>
        <section id="leaderboard" className="leaderboard-section" aria-labelledby="leaderboard-heading"><div className="section-heading section-heading--board"><div><p className="eyebrow eyebrow--small">Records from the water</p><h2 id="leaderboard-heading">Best times</h2></div><div className="board-tabs" role="group" aria-label="Leaderboard squad size">{([3, 5] as SquadSize[]).map((n) => <button type="button" key={n} onClick={() => { setLeaderboardError(""); setTab(n); }} aria-pressed={tab === n} className={tab === n ? "is-active" : ""}>{n}P board</button>)}</div></div>{leaderboardError && <p className="form-message form-message--error board-error" role="status">{leaderboardError}</p>}<div className="leaderboard-grid">{CHALLENGES.map((c) => <article key={c.id} className="challenge-card"><div className="challenge-card__header"><span className="challenge-card__icon" aria-hidden="true">{c.icon}</span><div><h3>{c.name}</h3><p>{c.tagline}</p></div><span className={`difficulty difficulty--${c.difficulty.toLowerCase()}`}>{c.difficulty}</span></div><div className="score-list">{(board[c.id] ?? []).length === 0 ? <div className="empty-score">No times yet. Be the first crew on the board.</div> : (board[c.id] ?? []).map((row, i) => <div key={row.id} className="score-row"><span className="score-row__rank">{String(i + 1).padStart(2, "0")}</span><span className="score-row__team">{row.teamName}</span><span className="score-row__time">{formatTime(row.timeMs)}</span></div>)}</div></article>)}</div></section>
        <footer className="site-footer"><span>Many Hands / Built with Three.js + Rapier physics</span><span>Best with a keyboard and friends who communicate loudly.</span></footer>
      </div>
    </main>
  );
}
