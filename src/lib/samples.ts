import type { Activity } from "./types";

/** 第一次打开老师控制台、题库还是空的时候放进去的示范题（老师可以改/删） */
export function sampleActivities(slug: string): Omit<Activity, "id">[] {
  return [
    {
      webinar_slug: slug,
      type: "poll",
      question: "你现在是做哪一行的？",
      options: ["美容 / 护理", "产后护理 / 月子", "全职妈妈", "其他"],
      correct_index: null,
      duration_sec: 30,
      sort: 1,
    },
    {
      webinar_slug: slug,
      type: "poll",
      question: "你觉得产后女性最容易忽略哪个身体问题？",
      options: ["骨盆问题", "腹直肌问题", "体态问题", "私密健康问题"],
      correct_index: null,
      duration_sec: 30,
      sort: 2,
    },
    {
      webinar_slug: slug,
      type: "quiz",
      question: "产后女性的骨盆问题，只会影响外观吗？",
      options: ["是，只影响外观", "也可能影响身体功能", "完全没有影响", "只影响体重"],
      correct_index: 1,
      duration_sec: 15,
      sort: 3,
    },
    {
      webinar_slug: slug,
      type: "quiz",
      question: "评估产后体态时，第一步应该先做什么？",
      options: ["马上开始运动", "先观察和评估", "直接按摩", "先节食"],
      correct_index: 1,
      duration_sec: 15,
      sort: 4,
    },
  ];
}
