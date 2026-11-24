// 每场 Webinar 的内容都在这里改：标题、日期、亮点、讲师、WhatsApp Community 链接。
// 加新的一场 = 在 WEBINARS 里多加一个 slug。

export type WebinarConfig = {
  slug: string;
  brand: string;
  title: string;
  subtitle: string;
  /** ISO 时间（含时区），例如 2026-12-12T20:00:00+08:00 */
  startAt: string;
  durationMin: number;
  priceLabel: string;
  highlights: { icon: string; title: string; text: string }[];
  agenda: { time: string; text: string }[];
  speakers: { name: string; role: string; initials: string }[];
  audience: string[];
  /** 报名成功后让学员点的 WhatsApp Community 邀请链接 */
  communityLink: string;
  interests: string[];
  theme: { primary: string; primaryDark: string; accent: string };
  /** 直播最后推的正式课程 */
  offer: {
    title: string;
    subtitle: string;
    bullets: string[];
    /** 以「分」为单位：RM 298 = 29800 */
    priceCents: number;
    /** 原价（划掉显示，可不填） */
    compareAtCents?: number;
    currency: "MYR";
    badge?: string;
    note?: string;
  };
};

export const WEBINARS: Record<string, WebinarConfig> = {
  lansidai: {
    slug: "lansidai",
    brand: "蓝丝带 Lansidai",
    title: "产后康复 Preview Class",
    subtitle: "90 分钟免费线上体验课：看懂产后身体的变化，学会专业评估的思路。",
    startAt: "2026-12-12T20:00:00+08:00",
    durationMin: 90,
    priceLabel: "免费参加",
    highlights: [
      { icon: "🧠", title: "看懂产后身体", text: "骨盆、腹直肌、体态之间的关联，一次讲清楚。" },
      { icon: "🎯", title: "现场互动抢答", text: "投票、限时抢答、排行榜，边玩边学不枯燥。" },
      { icon: "💬", title: "老师现场答疑", text: "直接打字提问，老师在直播中回答。" },
      { icon: "🎁", title: "课后复习资源", text: "出席学员可领取 3 支重点复习视频。" },
    ],
    agenda: [
      { time: "00–10", text: "欢迎 & 课程目标" },
      { time: "10–25", text: "产后康复的整体概念 · 即时投票" },
      { time: "25–40", text: "姿势与身体排列 · 情境判断" },
      { time: "40–55", text: "实际案例 · 限时抢答 + 排行榜" },
      { time: "55–65", text: "Live Q&A" },
      { time: "65–90", text: "正式课程介绍 & 学习方向" },
    ],
    speakers: [
      { name: "Joe Tan", role: "主持人 · Borderless AI Solution", initials: "JT" },
      { name: "蓝丝带专业导师", role: "产后康复导师", initials: "蓝" },
    ],
    audience: ["美容 / 产后护理从业者", "想进修专业技术的妈妈", "想开拓新服务项目的店主"],
    communityLink: "https://chat.whatsapp.com/REPLACE_WITH_COMMUNITY_INVITE",
    interests: ["产后康复技术", "体态评估", "开店 / 增加服务项目", "只是想了解"],
    theme: { primary: "#1d4ed8", primaryDark: "#0b1f5c", accent: "#f59e0b" },
    offer: {
      title: "蓝丝带产后康复 · 正式培训课程",
      subtitle: "从评估到实操，学会一套能直接用在客人身上的产后康复技术。",
      bullets: [
        "完整产后体态与骨盆评估流程",
        "腹直肌、骨盆、体态的实操手法",
        "真人案例示范 + 导师现场纠正",
        "结业证书 + 课后学员群支持",
      ],
      priceCents: 29800,
      compareAtCents: 59800,
      currency: "MYR",
      badge: "Preview Class 学员专属价",
      note: "付款后名额才算锁定；没付款的名额 35 分钟后自动释放。",
    },
  },
};

export const DEFAULT_SLUG = "lansidai";

export function getWebinar(slug: string): WebinarConfig | null {
  return WEBINARS[slug] ?? null;
}
