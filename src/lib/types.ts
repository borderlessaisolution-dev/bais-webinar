export type ActivityType = "poll" | "quiz";

export type Activity = {
  id: string;
  webinar_slug: string;
  type: ActivityType;
  question: string;
  options: string[];
  correct_index: number | null;
  duration_sec: number;
  sort: number;
};

/** 发给学员的题目（不含答案） */
export type PublicActivity = Omit<Activity, "correct_index" | "webinar_slug" | "sort">;

export type LeaderRow = { id: string; name: string; score: number };

export type LiveState =
  | { kind: "idle"; v: number }
  | {
      kind: "poll";
      v: number;
      activity: PublicActivity;
      startedAt: number;
      closed: boolean;
      counts: number[];
    }
  | {
      kind: "quiz";
      v: number;
      activity: PublicActivity;
      startedAt: number;
      phase: "question" | "reveal";
      correctIndex: number | null;
      counts: number[];
    }
  | { kind: "leaderboard"; v: number; top: LeaderRow[] };

export type Registration = {
  id: string;
  webinar_slug: string;
  name: string;
  email: string;
  phone: string;
  country: string;
  interest: string | null;
  utm_source: string | null;
  utm_campaign: string | null;
  created_at: string;
  joined_at: string | null;
};

export type ChatMsg = { id: string; name: string; text: string; ts: number; host?: boolean };
