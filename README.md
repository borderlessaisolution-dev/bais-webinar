# BAIS Webinar · 第 1 阶段

互动式线上直播课：报名页 → WhatsApp Community 发链接 → 直播教室（打字 + 表情）→ 投票 / Kahoot 式抢答 + 排行榜。

| 页面 | 网址 | 给谁用 |
|---|---|---|
| 报名页 | `/w/lansidai` | 广告点进来的人（可带 `?utm_source=fb&utm_campaign=xxx` 追踪来源） |
| 直播教室 | `/live/lansidai` | 学员（发在 WhatsApp Community 的就是这条） |
| 老师控制台 | `/host/lansidai` | 老师 / 主持人（要输入 HOST_KEY） |
| 正式课报名付款 | `/checkout/lansidai` | 直播中弹窗点进来；也可以直接发这个链接给没上直播的人 |

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

## 第 2 阶段：正式课报名 + 付款

流程：老师按「🎓 开放正式课程报名」→ 所有学员弹出报名卡 → 选上课日期（显示剩几位）→ 付款 → 成功页 + 加到日历。

- 选了日期先**保留名额 35 分钟**，付款成功才锁定；没付 / 按返回 / 过期就自动释放。
- 名额用数据库锁（`create_order`），很多人同时抢最后几个位也不会超卖。
- 同一个 Email 重新下单，之前没付款的订单会自动取消，不会一个人占几个位。
- 老师控制台「💰 课程报名」：新增开课日期和名额、看已付款人数和收入、订单列表、下载 CSV。

### 上线步骤

1. Supabase → SQL Editor 跑 `supabase/002_courses.sql`。
2. **Stripe**（stripe.com，用 Borderless 的 SSM 资料开户；FPX 需要填公司注册号码 BRN）：
   - Settings → Payment methods：打开 **FPX**、**Cards**、**GrabPay**
   - Developers → API keys → 复制 **Secret key** → Vercel 的 `STRIPE_SECRET_KEY`
   - Developers → Webhooks → Add endpoint：
     - URL：`https://你的网址/api/pay/stripe/webhook`
     - Events：`checkout.session.completed`、`checkout.session.async_payment_succeeded`、`checkout.session.async_payment_failed`、`checkout.session.expired`
     - 复制 **Signing secret** → Vercel 的 `STRIPE_WEBHOOK_SECRET`
   - Settings → Emails：打开「Successful payments」，学员会自动收到收据。
3. Vercel 加 `NEXT_PUBLIC_SITE_URL`（例如 `https://webinar.baismy.com`）→ Redeploy。
4. 改课程名称、价格、卖点：`src/lib/config.ts` 的 `offer`（价格以「分」为单位：RM 298 = `29800`）。
5. 老师控制台 → 💰 课程报名 → 新增开课日期。

还没接 Stripe 想先走一遍流程：Vercel 加 `PAYMENT_PROVIDER=mock`，付款时会出现「测试付款页」（不扣钱）。正式上线前记得删掉。

## 下一阶段（还没做）

- WhatsApp 自动通知（付款成功、开课提醒）
- 参与度评分、自动跟进、多场 Webinar 后台
