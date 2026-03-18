# X Watchdog

BD (Business Development) pipeline tự động — theo dõi tài khoản X (Twitter), chấm điểm tweet bằng AI, phát hiện lead tiềm năng, và tự động hoá outreach.

## Tổng quan

X Watchdog giám sát các tài khoản X theo dự án, dùng AI (GPT-4o, Claude, Gemini, Mistral) chấm điểm tweet, phát hiện tín hiệu BD, và hỗ trợ gửi outreach qua X DM / Telegram / Discord.

**Plugin repo:** [paperclip_x_watchdog](https://github.com/leeknowsai/paperclip_x_watchdog)

Chạy trên [Paperclip MC](https://github.com/paperclipai/paperclip) — tích hợp agent system, Chrome search, project config UI.

### Demo

[![Xem video demo](https://img.shields.io/badge/▶_Xem_Demo-Google_Drive-4285F4?style=for-the-badge&logo=googledrive&logoColor=white)](https://drive.google.com/file/d/1y3VybA3bGnd2GKfTHSprAnLBiQWe-dgq/view?usp=sharing)

<details>
<summary><strong>Mục lục Video Demo (17 phút)</strong></summary>

| Thời gian | Nội dung |
|-----------|----------|
| [00:00](https://drive.google.com/file/d/1y3VybA3bGnd2GKfTHSprAnLBiQWe-dgq/view?t=0) | Giới thiệu — Tương lai của AI Agents |
| [00:26](https://drive.google.com/file/d/1y3VybA3bGnd2GKfTHSprAnLBiQWe-dgq/view?t=26) | Issues List — Danh sách task của agents |
| [02:16](https://drive.google.com/file/d/1y3VybA3bGnd2GKfTHSprAnLBiQWe-dgq/view?t=136) | CEO Agent Dashboard — Chi phí, hoạt động, tỉ lệ thành công |
| [02:30](https://drive.google.com/file/d/1y3VybA3bGnd2GKfTHSprAnLBiQWe-dgq/view?t=150) | BD Scorer Agent — Lead Analyst, pipeline scoring |
| [04:53](https://drive.google.com/file/d/1y3VybA3bGnd2GKfTHSprAnLBiQWe-dgq/view?t=293) | BD Writer Agent — Outreach Specialist |
| [04:59](https://drive.google.com/file/d/1y3VybA3bGnd2GKfTHSprAnLBiQWe-dgq/view?t=299) | BD Coordinator Agent — Pipeline Management |
| [06:27](https://drive.google.com/file/d/1y3VybA3bGnd2GKfTHSprAnLBiQWe-dgq/view?t=387) | X Watchdog Dashboard — Leads, Tweets, DMs |
| [06:42](https://drive.google.com/file/d/1y3VybA3bGnd2GKfTHSprAnLBiQWe-dgq/view?t=402) | Company Settings — Cấu hình công ty AI |
| [06:48](https://drive.google.com/file/d/1y3VybA3bGnd2GKfTHSprAnLBiQWe-dgq/view?t=408) | Plugin Manager — X Search, Discord, Telegram, Agency Agents |
| [08:04](https://drive.google.com/file/d/1y3VybA3bGnd2GKfTHSprAnLBiQWe-dgq/view?t=484) | Goals — Mục tiêu của công ty |
| [09:20](https://drive.google.com/file/d/1y3VybA3bGnd2GKfTHSprAnLBiQWe-dgq/view?t=560) | Org Chart — Sơ đồ tổ chức agents |
| [10:17](https://drive.google.com/file/d/1y3VybA3bGnd2GKfTHSprAnLBiQWe-dgq/view?t=617) | Discord Integration — Notifications & Approvals |
| [11:30](https://drive.google.com/file/d/1y3VybA3bGnd2GKfTHSprAnLBiQWe-dgq/view?t=690) | Project Settings — Cấu hình dự án (active/paused) |
| [11:51](https://drive.google.com/file/d/1y3VybA3bGnd2GKfTHSprAnLBiQWe-dgq/view?t=711) | Leads Tab — Danh sách leads từ agents |
| [12:10](https://drive.google.com/file/d/1y3VybA3bGnd2GKfTHSprAnLBiQWe-dgq/view?t=730) | Feed Tab — Tweets đã cào và chấm điểm |
| [12:28](https://drive.google.com/file/d/1y3VybA3bGnd2GKfTHSprAnLBiQWe-dgq/view?t=748) | DMs Tab — Quản lý tin nhắn X |
| [12:45](https://drive.google.com/file/d/1y3VybA3bGnd2GKfTHSprAnLBiQWe-dgq/view?t=765) | Insights Tab (beta) — Analytics & conversion funnel |
| [13:07](https://drive.google.com/file/d/1y3VybA3bGnd2GKfTHSprAnLBiQWe-dgq/view?t=787) | Search Config — Project keywords & scoring prompt |
| [14:31](https://drive.google.com/file/d/1y3VybA3bGnd2GKfTHSprAnLBiQWe-dgq/view?t=871) | Agent Workflow — BD Scorer → CEO approval flow |
| [15:02](https://drive.google.com/file/d/1y3VybA3bGnd2GKfTHSprAnLBiQWe-dgq/view?t=902) | BD Writer Workflow — Draft outreach & Discord oversight |
| [17:25](https://drive.google.com/file/d/1y3VybA3bGnd2GKfTHSprAnLBiQWe-dgq/view?t=1045) | Tổng kết |

</details>

---

## Cài đặt

### Yêu cầu

- [Paperclip MC](https://github.com/paperclipai/paperclip) đã cài và chạy (mặc định port 3100)
- Node.js >= 18, pnpm
- Google Chrome (nếu dùng search scraping)
- Bun runtime (nếu chạy scripts search)

### Bước 1: Clone plugin vào Paperclip

```bash
cd /path/to/paperclip/packages/plugins/
git clone git@github.com:leeknowsai/paperclip_x_watchdog.git x-watchdog
```

### Bước 2: Cài dependencies & build

```bash
# Từ thư mục root của Paperclip
pnpm install
cd packages/plugins/x-watchdog
pnpm build
```

### Bước 3: Cài plugin trên Paperclip UI

1. Mở Paperclip → Settings → Plugins
2. Click **Install from disk**
3. Chọn thư mục `packages/plugins/x-watchdog`
4. Plugin sẽ xuất hiện trong danh sách → bật **Enable**

### Bước 4: Cấu hình secrets

Vào Paperclip → Settings → Secrets, tạo các secret cần thiết. Sau đó vào Plugin Settings → X Watchdog, map secret references:

| Secret | Bắt buộc | Mô tả |
|--------|----------|-------|
| `xBearerTokenRef` | Có | X API v2 Bearer token — lấy từ [developer.x.com](https://developer.x.com) |
| `openaiApiKeyRef` | Có | OpenAI API key — dùng cho AI scoring |
| `twitterApiIoKeyRef` | Không | TwitterAPI.io key — fallback data provider (enrichment) |
| `rapidApiKeyRef` | Không | RapidAPI key — twitter-api45 (free tier) |
| `xOAuthClientId` | Không | X OAuth 2.0 Client ID — cần cho DM read/write |
| `xOAuthClientSecretRef` | Không | X OAuth 2.0 Client Secret |
| `minimaxApiKeyRef` | Không | MiniMax API key — LLM provider thay thế |

### Bước 5: Seed data (tự động)

Plugin tự động seed dữ liệu khi khởi động lần đầu:

| Dữ liệu | Số lượng | Chi tiết |
|----------|----------|---------|
| **Projects** | 4 | Clawfriend, Clawquest, Whalesmarket, Web3 Skills — đầy đủ keywords, scoring prompts, outreach templates, project docs |
| **Handles** | 1,155 | Tài khoản X đang theo dõi (founders, KOLs, projects, media) |
| **Mappings** | 1,506 | Gán handle vào project |

> Seed chỉ chạy 1 lần. Không ghi đè nếu đã tự thêm data. Vào plugin → **Projects** để xem data đã có sẵn.

### Bước 6: Tuỳ chỉnh (nếu cần)

Vào plugin → **Projects** → chọn project → **Configure**:
- **Trigger keywords** — thêm/bớt từ khoá phát hiện lead
- **Handles** — thêm tài khoản X cần theo dõi
- **Chrome profiles** — gán profile Chrome cho search scraping
- **Scoring prompt** — tuỳ chỉnh hướng dẫn AI chấm điểm

> **Lưu ý:** Plugin settings (API keys, secrets) cần set tay qua Paperclip UI vì mỗi instance có secrets riêng — xem Bước 4.

---

## Setup Chrome Search Scraping

Hệ thống hỗ trợ 2 cách lấy tweet từ X:

| Phương pháp | Ưu điểm | Nhược điểm |
|-------------|---------|------------|
| **X API v2** (Bearer token) | Ổn định, chính thức | Giới hạn rate, tốn phí, không search keyword |
| **Chrome CDP scraping** | Miễn phí, search keyword, không rate limit | Cần Chrome + login sẵn, cần máy local chạy |

### Cách 1: Chỉ dùng X API (đơn giản)

Chỉ cần set `xBearerTokenRef` trong plugin settings. Hệ thống sẽ tự fetch tweet từ timeline của các handle đã follow. Không cần Chrome.

### Cách 2: Chrome CDP scraping (search keyword)

Dùng khi muốn search tweet theo keyword trên X — cần login sẵn tài khoản X trên Chrome.

#### Bước 1: Chuẩn bị tài khoản X

Mỗi project cần 1 tài khoản X đã login trên Chrome. Ví dụ:
- Project "ClawFriend" → dùng tài khoản `@clawfriend_ai` (Chrome Profile 9)
- Project "ClawQuest" → dùng tài khoản `@clawquest_ai` (Chrome Profile 7)

#### Bước 2: Tạo Chrome profiles tự động

**Yêu cầu:** Tất cả tài khoản X đã login sẵn trên Chrome profile "Default".

```bash
# QUAN TRỌNG: Đóng Chrome trước khi chạy
bun run scripts/x-profiles/create-x-profiles.ts
```

Script sẽ:
1. Đọc cookies từ Chrome profile mặc định (giải mã qua macOS Keychain)
2. Tạo profile mới cho mỗi tài khoản X
3. Copy cookies `auth_token`, `auth_multi`, `twid` sang profile mới
4. Đăng ký profile trong Chrome `Local State`

#### Bước 3: Gán Chrome profile cho project

Vào plugin → Project Settings → **Chrome Profiles**:
1. Chọn Chrome profile từ dropdown (auto-detect profiles có sẵn)
2. Nhập `@username` tương ứng
3. Gán keywords cho profile (keyword nào search bằng profile nào)
4. Đánh dấu **outreach account** (tài khoản dùng để gửi DM/reply)

#### Bước 4: Chạy search

```bash
# Mở tabs search trên Chrome (mỗi keyword 1 tab)
bun run scripts/x-profiles/open-x-search.ts

# Tuỳ chọn
bun run scripts/x-profiles/open-x-search.ts --projects clawfriend,clawquest --kw-limit 3
bun run scripts/x-profiles/open-x-search.ts --dry-run  # Xem trước, không mở Chrome
```

#### Bước 5: Scrape kết quả

```bash
# Scrape tweets từ các tab đã mở → score → lưu DB
bun run scripts/x-profiles/x-search-scraper.ts
```

Scraper sẽ: kết nối Chrome CDP (port 9222) → extract tweets từ DOM → dedup với DB → AI scoring → lưu vào DB → tạo report → gửi TG thông báo.

---

## Setup Telegram Bot

Telegram dùng để nhận thông báo tweet điểm cao và điều khiển hệ thống qua bot commands.

### Bước 1: Tạo bot

1. Mở Telegram, chat với [@BotFather](https://t.me/BotFather)
2. Gửi `/newbot` → đặt tên → nhận **Bot Token**
3. Lưu token vào Paperclip Secrets

### Bước 2: Tạo group + forum topics

1. Tạo Telegram group mới
2. Bật **Topics** (Group Settings → Topics → Enable)
3. Thêm bot vào group, set làm **Admin** (quyền: Send Messages, Manage Topics)
4. Lấy **Chat ID** của group:
   ```bash
   # Gửi 1 tin nhắn trong group, sau đó chạy:
   curl "https://api.telegram.org/bot<BOT_TOKEN>/getUpdates" | jq '.result[-1].message.chat.id'
   # Chat ID dạng: -100xxxxxxxxxx
   ```
5. Tạo forum topic cho mỗi project (tay hoặc qua bot command `/settopic`)

### Bước 3: Cấu hình

Set trong plugin config (Paperclip → X Watchdog Settings):
- `TG_BOT_TOKEN` → Paperclip Secret
- `TG_CHAT_ID` → group chat ID (dạng `-100...`)
- `TG_WEBHOOK_SECRET` → random string (`openssl rand -hex 32`)

### Bước 4: Đăng ký webhook (chỉ production)

```bash
curl -X POST "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-api-domain/telegram/webhook",
    "secret_token": "<TG_WEBHOOK_SECRET>"
  }'
```

### Bot Commands

| Lệnh | Cách dùng | Mô tả |
|-------|-----------|-------|
| `/add` | `/add @handle [category]` | Thêm tài khoản X vào danh sách theo dõi |
| `/remove` | `/remove @handle` | Xoá khỏi danh sách |
| `/list` | `/list` | Hiện danh sách handles theo category |
| `/threshold` | `/threshold 7` | Đặt ngưỡng thông báo (0-10) |
| `/mute` | `/mute 2h` | Tắt thông báo tạm thời |
| `/stats` | `/stats` | Thống kê: số handles, tweets, signals |
| `/projects` | `/projects` | Liệt kê projects |
| `/newproject` | `/newproject <tên>` | Tạo project mới |
| `/settopic` | `/settopic <project> <topic_id>` | Gán forum topic cho project |
| `/addhandles` | `/addhandles <project> @h1 @h2` | Thêm handles vào project |
| `/syncnow` | `/syncnow <project>` | Trigger sync ngay lập tức |

### Auto-detect tweet link

Khi paste link tweet `https://x.com/user/status/123` vào forum topic → bot tự động:
1. Extract tweet ID
2. Map topic → project
3. Tạo analysis job
4. Gửi kết quả phân tích + inline buttons

### Thông báo tự động

Tweet điểm cao (≥ threshold) gửi về group với format:
```
🔔 Signal [8/10] — @handle_name

"Nội dung tweet..."

💡 AI summary

#tag1 #tag2
📎 https://x.com/...
```

- Có project + topic ID → gửi vào forum topic tương ứng
- Không có project → gửi vào chat chính

---

## Setup Discord

Discord dùng cho thông báo từ Paperclip MC (agent events, approvals, errors).

### Bước 1: Join server

Server đã setup sẵn: **https://discord.gg/fykd89Rp**

1. Join server qua link trên
2. Liên hệ Robin (@Hephaestus010 trên TG) để được set **Admin**

### Channels có sẵn

| Channel | Mục đích |
|---------|----------|
| `#notifications` | Tweet/lead alerts |
| `#approvals` | BD task approvals |
| `#errors` | Error logs |
| `#bd-pipeline` | BD workflow events |
| `#community-intel` | Research/intel |

> Bot "Clipboard MC" và channel IDs đã được cấu hình sẵn. Anh em chỉ cần join server.

### Bước 2: Cài Discord plugin trên Paperclip

```bash
cd /path/to/paperclip/packages/plugins/
git clone git@github.com:mvanhorn/paperclip-plugin-discord.git discord
cd discord && git checkout fix/worker-bootstrap-and-packaging  # Branch có fixes
cd ../../.. && pnpm install
cd packages/plugins/discord && pnpm build
```

Cài plugin trên Paperclip UI → Install from disk → Enable.

### Bước 3: Cấu hình Discord plugin

Trong Paperclip → Discord Plugin Settings:

1. **Bot Token** → nhận từ Robin (đã tạo sẵn)
2. **Guild ID** → `1470000908107645145`
3. **Channel routing** (đã setup sẵn):
   - `notificationsChannelId` → `1470000908711759987`
   - `approvalsChannelId` → `1470005997853605911`
   - `errorsChannelId` → `1482808696793731212`
   - `bdPipelineChannelId` → `1470006023220756702`

### Subscribed Events

Plugin tự động gửi thông báo khi:
- `issue.created` — tạo issue mới trên Paperclip
- `issue.updated(done)` — issue hoàn thành
- `approval.created` — yêu cầu phê duyệt
- `agent.run.started` — agent bắt đầu chạy
- `agent.run.finished` — agent chạy xong
- `agent.run.failed` — agent lỗi

---

## Setup BD Agents (Paperclip MC)

4 agent AI tự động hoá quy trình BD. Chạy trên Paperclip MC, dùng Claude models.

### Kiến trúc agent

```
CEO (claude-opus)
 ├── BD Coordinator (claude-sonnet) — 30 phút/lần
 ├── BD Scorer (claude-haiku) — on-demand
 └── BD Writer (claude-sonnet) — on-demand
```

| Agent | Model | Heartbeat | Vai trò |
|-------|-------|-----------|---------|
| **CEO** | claude-opus-4-6 | 4 giờ | Giám sát tổng thể, phê duyệt outreach, daily report, phân task |
| **BD Coordinator** | claude-sonnet-4 | 30 phút | Monitor DM, detect TG handles, theo dõi lead conversion |
| **BD Scorer** | claude-haiku-4-5 | On-demand | Chấm điểm lead, áp dụng ICP filters, loại spam/trader |
| **BD Writer** | claude-sonnet-4 | On-demand | Viết outreach messages cho X DM, TG, Discord |

### Bước 1: Chuẩn bị file agent

Mỗi agent cần 4 file trong thư mục `agents/<tên>/`:

```
agents/
  ceo/
    AGENTS.md       # Hướng dẫn chi tiết cho agent
    SOUL.md         # Persona — tính cách, phong cách giao tiếp
    HEARTBEAT.md    # Checklist chạy mỗi heartbeat cycle
    TOOLS.md        # Danh sách API + tools agent được dùng
    memory/         # Thư mục lưu trữ state (agent tự ghi)
  bd-coordinator/
    AGENTS.md
    SOUL.md
    HEARTBEAT.md
    TOOLS.md
    memory/
  bd-scorer/
    ...
  bd-writer/
    ...
```

Các file này đã có sẵn trong repo. Tuỳ chỉnh nếu cần (ví dụ: sửa SOUL.md để thay đổi persona).

### Bước 2: Đăng ký agents trên Paperclip

Mỗi agent cần đăng ký qua Paperclip API hoặc UI:

**Qua UI:**
1. Mở Paperclip → Agents → Create Agent
2. Điền: Name, Model (claude-opus/sonnet/haiku), Heartbeat interval
3. Upload hoặc link tới thư mục agent files
4. Enable agent

**Qua script (nếu có):**
```bash
bash scripts/paperclip/register-agents.sh
```

### Bước 3: Cấu hình agent tools

Agents cần truy cập X Watchdog API. Đảm bảo:

1. **API URL** — agent biết endpoint Worker:
   - Production: `https://api-watchdog.clawfriend.ai`
   - Local: `http://localhost:8787`
2. **API Key** — header `X-API-Key` để authenticate
3. **Paperclip MC API** — `http://127.0.0.1:3100` (agents tự có quyền)

Các tools agent dùng (định nghĩa trong `TOOLS.md`):

| Tool | Endpoint | Mô tả |
|------|----------|-------|
| Lấy leads | `GET /api/leads` | Danh sách leads cần xử lý |
| Chấm điểm | `POST /api/tweets/score` | AI scoring batch |
| Gửi reply | `POST /api/actions/reply` | Reply tweet (dryRun hỗ trợ) |
| Gửi DM | `POST /api/actions/dm` | Gửi X DM (dryRun hỗ trợ) |
| Sync DM | `POST /api/dm/sync/:username` | Sync DM conversations |
| Tạo issue | Paperclip API | Tạo task cho agent khác |
| Gửi TG | `POST /api/telegram/send` | Gửi tin nhắn Telegram |

### Bước 4: Quy trình chạy

1. **CEO** thức dậy mỗi 4h:
   - Check pipeline status (`GET /api/analytics/volume`)
   - Review leads mới → tạo issue cho BD Scorer
   - Phê duyệt outreach drafts từ BD Writer
   - Gửi daily report qua TG (20:00 UTC+7)

2. **BD Coordinator** chạy mỗi 30 phút:
   - Sync DM (`POST /api/dm/sync/:username`) cho mỗi OAuth account
   - Phát hiện TG handles trong DM (regex: `@handle`, `t.me/user`)
   - Escalate leads nóng cho CEO

3. **BD Scorer** (trigger bởi CEO hoặc Coordinator):
   - Nhận issue với danh sách leads cần score
   - Gọi AI scoring API
   - Áp dụng ICP filters (loại: traders, inactive >14 ngày, meme accounts)
   - Update lead priority

4. **BD Writer** (trigger bởi CEO):
   - Nhận issue với lead + context
   - Generate outreach draft cho từng channel (X DM, TG, Discord)
   - Submit draft để CEO review
   - Sau khi approved → gửi qua `POST /api/actions/dm` hoặc `/reply`

---

## Cấu hình Plugin (Settings → X Watchdog)

| Config key | Env tương đương | Ghi chú |
|------------|-----------------|---------|
| `xBearerTokenRef` | `X_BEARER_TOKEN` | Secret reference UUID |
| `openaiApiKeyRef` | `OPENAI_API_KEY` | Secret reference UUID |
| `twitterApiIoKeyRef` | `TWITTERAPIIO_API_KEY` | Optional |
| `rapidApiKeyRef` | `RAPIDAPI_KEY` | Optional |
| `xOAuthClientId` | `X_OAUTH_CLIENT_ID` | Plain text |
| `xOAuthClientSecretRef` | `X_OAUTH_CLIENT_SECRET` | Secret reference UUID |
| `notificationThreshold` | `NOTIFICATION_THRESHOLD` | Number 0-10 |
| `discordNotify` | — | Boolean on/off |
| `maxFollowUps` | — | Số lần follow-up tối đa |
| `followUpWaitHours` | — | Giờ chờ giữa follow-ups |

---

## Cấu trúc thư mục

```
src/
  worker/           # CF Worker — API + cron jobs + Telegram bot
    api/            # Hono routes (tweets, handles, projects, leads, DM, actions, analytics)
    cron/           # Tác vụ định kỳ (fetch, score, notify, detect-leads, cleanup)
    lib/            # Utils (ai-scorer, x-api, x-write, llm-providers, signal-detector...)
    telegram/       # TG bot commands
  dashboard/        # React SPA (Vite)
    src/pages/      # Overview, Projects, Leads, Feed, DM, Analytics, Settings
  db/
    schema.ts       # Drizzle schema
    migrations/     # D1 migration SQL
agents/             # 4 agent Paperclip MC (CEO, BD Coordinator, BD Scorer, BD Writer)
scripts/
  paperclip/        # Agent orchestration (register, trigger, create-issue...)
  x-profiles/       # Chrome profile + search scripts
docs/               # Tài liệu kiến trúc, API reference
plans/              # Kế hoạch triển khai, báo cáo
```

## Cách hoạt động

### Pipeline chính (chạy mỗi giờ)

1. **Fetch tweets** — lấy tweet mới từ handle đã theo dõi + keyword search
2. **Dedup** — loại bỏ tweet trùng lặp
3. **AI Scoring** — chấm điểm 0-10 bằng LLM (global prompt + project prompt)
4. **Detect leads** — so khớp trigger keywords → tạo lead mới
5. **Notify** — gửi thông báo Telegram cho tweet điểm cao (≥ threshold)

### Cron schedules

| Schedule | Tác vụ |
|----------|--------|
| `0 * * * *` | Fetch + score + notify + detect leads |
| `0 3 * * *` | Cleanup tweet >30 ngày, refresh handle profiles |

## API Endpoints chính

```
GET  /api/tweets              # Danh sách tweet + filter
GET  /api/handles             # Tài khoản đang theo dõi
GET  /api/projects            # Danh sách dự án
GET  /api/leads               # Lead BD (filter: status, urgency, project)
GET  /api/dm/conversations    # DM threads + TG handle detection
GET  /api/analytics/volume    # Chart data

POST /api/actions/reply       # Reply tweet (hỗ trợ dryRun)
POST /api/actions/dm          # Gửi DM (hỗ trợ dryRun)
GET  /api/actions/history     # Lịch sử action (audit log)

POST /api/trigger/cron        # Chạy cron thủ công
PUT  /api/projects/:id        # Cập nhật project config
POST /api/tweets/score        # AI scoring batch
POST /api/tweets/bulk         # Lưu tweets batch
POST /api/dm/sync/:username   # Sync DM cho account
POST /api/telegram/send       # Gửi TG message
```

## Lệnh phát triển

```bash
npm run dev                    # Worker local (wrangler dev, port 8787)
npm run dashboard:dev          # Dashboard local (vite, port 5173)
npm run deploy                 # Deploy worker → CF
npm run dashboard:deploy       # Deploy dashboard → CF Pages
npm run db:generate            # Generate migration từ schema thay đổi
npm run db:migrate:local       # Chạy migration local
npm run db:migrate:remote      # Chạy migration production
```

## Tài liệu chi tiết

| Tài liệu | Nội dung |
|-----------|----------|
| [Architecture](docs/architecture.md) | Thiết kế hệ thống, data flow, DB schema |
| [Development](docs/development.md) | Setup local, scripts, deployment |
| [API Reference](docs/api-reference.md) | Chi tiết API endpoints |
| [Configuration](docs/configuration.md) | Env vars, cron, settings |

## Lưu ý bảo mật

- **Không commit** `.dev.vars`, API keys, OAuth secrets
- Dùng Paperclip Secrets cho API keys
- Endpoint write hỗ trợ `dryRun: true` để test an toàn
- Mọi X write action được log vào bảng `action_log`
- OAuth tokens lưu trong DB, tự refresh khi hết hạn
- Dashboard auth qua header `X-API-Key`

## License

Private — Internal use only.
