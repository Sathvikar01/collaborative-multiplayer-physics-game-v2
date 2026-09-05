"use client";

import dynamic from "next/dynamic";
import { useParams, useSearchParams } from "next/navigation";

function LoadingGame() {
  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-[#080b10] px-6 text-[#f4f0e8]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(211,169,92,0.16),transparent_34%),linear-gradient(180deg,#101720_0%,#080b10_70%)]" />
      <div className="relative flex flex-col items-center" role="status" aria-live="polite">
        <div className="relative h-16 w-16" aria-hidden="true">
          <div className="absolute inset-0 rounded-full border border-[#d3a95c]/20" />
          <div className="absolute inset-1 animate-spin rounded-full border-2 border-transparent border-t-[#d3a95c] border-r-[#d3a95c]/30 motion-reduce:animate-none" />
          <div className="absolute inset-[42%] rounded-full bg-[#d3a95c] shadow-[0_0_24px_rgba(211,169,92,0.65)]" />
        </div>
        <div className="mt-6 text-[0.65rem] font-semibold uppercase tracking-[0.38em] text-[#d3a95c]">Many Hands</div>
        <p className="mt-2 text-sm text-white/55">Preparing physics and atmosphere…</p>
      </div>
    </main>
  );
}

const GameClient = dynamic(() => import("@/components/GameClient"), { ssr: false, loading: LoadingGame });

export default function PlayPage() {
  const params = useParams<{ code: string }>();
  const search = useSearchParams();
  const code = String(params.code ?? "").toUpperCase();
  const solo = search.get("solo") === "1";
  return <GameClient code={code} solo={solo} />;
}
