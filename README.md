# BAIS Webinar · 第 1 阶段

互动式线上直播课：报名页 → WhatsApp Community 发链接 → 直播教室（打字 + 表情）→ 投票 / Kahoot 式抢答 + 排行榜。

| 页面 | 网址 | 给谁用 |
|---|---|---|
| 报名页 | `/w/lansidai` | 广告点进来的人（可带 `?utm_source=fb&utm_campaign=xxx` 追踪来源） |
| 直播教室 | `/live/lansidai` | 学员（发在 WhatsApp Community 的就是这条） |
| 老师控制台 | `/host/lansidai` | 老师 / 主持人（要输入 HOST_KEY） |

技术：Next.js 16 + Supabase（资料）+ LiveKit（直播视频、聊天、互动广播）。
单向直播：只有老师能开镜头 / 麦克风 / 分享屏幕；学员只能打字、发表情、作答，所以 500–1000 人没问题。

## 上线步骤（约 30 分钟）

1. **Supabase**：开一个新 project → SQL Editor → 贴上 `supabase/schema.sql` 执行。
2. **LiveKit Cloud**：在 cloud.livekit.io 开 project，拿 URL、API Key、Secret。
3. **Vercel**：Import 这个 GitHub repo → Environment Variables 照 `.env.example` 填 → Deploy。
4. **域名**：Vercel → Domains 加 `webinar.baismy.com`（在域名商加一条 CNAME 指向 Vercel）。
5. 改内容：`src/lib/config.ts`（标题、日期、讲师、**WhatsApp Community 邀请链接**）→ push 就会自动更新。

## 当天怎么用

1. 老师开 `/host/lansidai`（建议用电脑 + Chrome），按「摄像头」「麦克风」，要放 PPT 就按「分享屏幕」。
2. 在「题库」先把题目改好（第一次打开会放 4 题示范题）。
3. 上课时按「▶ 开始」/「▶ 下一题」出题：
   - 投票：学员投完马上看到百分比，时间到自动截止。
   - 抢答：学员有 X 秒作答，时间到自动公布答案；答对 500–1000 分，越快越高。
   - 按「🏆 显示排行榜」出 Top 10。
4. 「报名名单」可看报名人数、出席率，下载 CSV。
5. 彩排完记得按最下面「清空所有作答和分数」。

## 本地开发

```bash
npm install
# 没设 SUPABASE_URL 时会用内存存资料（只供测试）
# LiveKit 本地：livekit-server --dev（key=devkey secret=secret）
npm run dev
```

## 下一阶段（还没做）

- 课程结尾弹出正式课报名 + 付款（ToyyibPay / Stripe）+ 选日期锁名额
- 参与度评分、自动跟进、多场 Webinar 后台
