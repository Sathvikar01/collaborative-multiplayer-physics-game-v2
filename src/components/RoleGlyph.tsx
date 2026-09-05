import type { SVGProps } from "react";
import type { Role } from "@/game/types";

type RoleGlyphProps = SVGProps<SVGSVGElement> & {
  role: Role;
};

const strokeProps = {
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  strokeWidth: 1.65,
  vectorEffect: "non-scaling-stroke" as const,
};

function Hand({ mirrored = false }: { mirrored?: boolean }) {
  return (
    <g transform={mirrored ? "translate(24 0) scale(-1 1)" : undefined}>
      <path {...strokeProps} d="M7.2 11.2V6.1a1.2 1.2 0 0 1 2.4 0v3.2-4.7a1.2 1.2 0 0 1 2.4 0v4.7-4a1.2 1.2 0 0 1 2.4 0v4.1-2.7a1.2 1.2 0 0 1 2.4 0v5.9c0 4.4-2.4 7.1-6.3 7.1-2.9 0-4.3-1.6-5.7-4.1l-1.5-2.8a1.35 1.35 0 0 1 2.25-1.47L7.2 12.7" />
      <path {...strokeProps} d="M8.2 17.2c1.7.7 3.5.7 5.2-.1" opacity=".5" />
    </g>
  );
}

function Leg({ mirrored = false }: { mirrored?: boolean }) {
  return (
    <g transform={mirrored ? "translate(24 0) scale(-1 1)" : undefined}>
      <path {...strokeProps} d="M9 3.8c2.2-.8 4.2-.7 5.8.4l-.4 6.4-2.8 4.1 1.1 4.7" />
      <path {...strokeProps} d="m12.7 19.4 3.4.8c1.1.3 1.8.9 2.1 1.8h-6.7l-1.4-6.8-2-4.8.9-6.6" />
      <circle cx="11.7" cy="14.7" r="1.1" fill="currentColor" opacity=".45" />
    </g>
  );
}

export function RoleGlyph({ role, ...props }: RoleGlyphProps) {
  const isRight = role === "rhand" || role === "rleg";

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...props}>
      {(role === "lhand" || role === "rhand") && <Hand mirrored={isRight} />}
      {role === "arms" && (
        <>
          <path {...strokeProps} d="M9.6 6.4 6.9 8.1 4.3 12 2 10.7M14.4 6.4l2.7 1.7 2.6 3.9 2.3-1.3" />
          <path {...strokeProps} d="M9.6 5.5h4.8v9H9.6zM10.4 14.5 9.6 21M13.6 14.5l.8 6.5" />
          <circle cx="2.2" cy="10.8" r="1.35" fill="currentColor" opacity=".45" />
          <circle cx="21.8" cy="10.8" r="1.35" fill="currentColor" opacity=".45" />
        </>
      )}
      {role === "torso" && (
        <>
          <path {...strokeProps} d="M5.2 7.2 9 4.8h6l3.8 2.4-2.1 4.1-.6 8H7.9l-.6-8z" />
          <path {...strokeProps} d="M9 4.8 12 9l3-4.2M8 14h8" opacity=".65" />
          <circle cx="12" cy="11.4" r="1.15" fill="currentColor" opacity=".45" />
        </>
      )}
      {(role === "lleg" || role === "rleg") && <Leg mirrored={isRight} />}
      {role === "legs" && (
        <>
          <path {...strokeProps} d="M7.8 3.8h8.4l-.5 7-2.2 3.8.9 5.1 3.1 1.4H12l-1.2-6.5-2.5-3.8z" />
          <path {...strokeProps} d="m10.8 14.6-1.2 5.1-3.1 1.4H12" />
        </>
      )}
      {role === "head" && (
        <>
          <path {...strokeProps} d="M6 11.2C6 6.7 8.3 4 12 4s6 2.7 6 7.2c0 5-2.5 8.8-6 8.8s-6-3.8-6-8.8Z" />
          <circle cx="9.6" cy="11.2" r="1.15" fill="currentColor" />
          <circle cx="14.4" cy="11.2" r="1.15" fill="currentColor" />
          <path {...strokeProps} d="M10 16c1.3.7 2.7.7 4 0" opacity=".65" />
        </>
      )}
    </svg>
  );
}
