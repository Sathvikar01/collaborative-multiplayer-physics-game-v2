import { pgTable, serial, text, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";

export const scores = pgTable(
  "scores",
  {
    id: serial("id").primaryKey(),
    challengeId: text("challenge_id").notNull(),
    teamName: text("team_name").notNull(),
    players: jsonb("players").$type<string[]>().notNull().default([]),
    timeMs: integer("time_ms").notNull(),
    roomCode: text("room_code"),
    // 3- or 5-player squad category. Defaults to 5 so legacy rows read as 5P.
    squadSize: integer("squad_size").notNull().default(5),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("scores_challenge_time_idx").on(t.challengeId, t.timeMs), index("scores_challenge_squad_time_idx").on(t.challengeId, t.squadSize, t.timeMs)]
);

export type Score = typeof scores.$inferSelect;
