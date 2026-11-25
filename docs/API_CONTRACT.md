# API 契约（前后端共同遵守的唯一实现标准）

> 本文件是 `docs/DEVELOPMENT_SPEC.md` 第 5 章的**可执行细化版**。前后端各自实现时必须逐字对齐本文件；
> 若本文件与 DEVELOPMENT_SPEC.md 冲突，以 `DEVELOPMENT_SPEC.md` 为准并立刻回报 Lead。

## 0. 通用约定

### 0.1 命名与序列化
- **JSON 的请求体与响应体字段一律使用 camelCase**（与仓库现有 `src/types.ts` 保持一致）。
- 例外：**查询参数（query string）使用 snake_case**，与 DEVELOPMENT_SPEC.md 第 5 章完全一致
  （`category_id`、`page_size`、`status`、`q`、`tag`）。
- 所有 `id` 在 JSON 中**一律是字符串**（DB 里是 BIGINT UNSIGNED，避免 JS 精度问题）。
- 所有时间字段为 **Asia/Shanghai 本地时间、无时区后缀、无 Z**：
  - `publishedAt` / `createdAt` / `updatedAt`：`YYYY-MM-DDTHH:mm:ss`（例：`2026-11-25T10:30:00`）
  - 日记 `date`：`YYYY-MM-DD`；`time`：`HH:mm`
  - **写入时**后端必须同时接受 `YYYY-MM-DDTHH:mm`、`YYYY-MM-DDTHH:mm:ss`、`YYYY-MM-DD HH:mm(:ss)` 三种写法；
    **输出时**统一 `YYYY-MM-DDTHH:mm:ss`（日记 `time` 输出 `HH:mm`）。

### 0.2 错误格式
- 错误统一 `{"detail": "中文错误原因"}`（FastAPI `HTTPException` 默认格式）。
- 状态码：`400` 业务规则冲突、`401` 未鉴权/密码错误、`404` 不存在或不可见、`429` 登录限流。
- 前端 `request()` 只认 `detail` 作为提示文案，缺失时使用 `请求失败（HTTP xxx）`。

### 0.3 鉴权
- Cookie 名 `blog_admin_session`；属性 `httponly=True`, `samesite="lax"`, `path="/"`, `secure=${COOKIE_SECURE}`。
- Token：JWT HS256，payload `{"sub": "admin", "ver": <token_version>, "exp": <unix ts>}`。
- 校验：签名合法 + 未过期 + `ver == site_settings.token_version`，任一不满足 → `401`。
- 受保护接口在缺失/非法 Cookie 时必须返回 `401`，且**不得**返回任何业务数据。
- `GET /api/public/bootstrap` 及所有公开接口**绝不包含** `adminPasswordHash` / `admin_password_hash`。

### 0.4 数据类型定义
```ts
type ArticleStatus = 'published' | 'draft';
type Mood = 'focused' | 'calm' | 'inspired' | 'happy' | 'tired';

interface Article {
  id: string;
  title: string;
  excerpt: string;          // 后端在 excerpt 为空时自动截取正文纯文本前 90 字
  content: string;          // Markdown 原文（列表接口也返回，前端需要本地检索/预览）
  categoryId: string | null;
  tags: string[];
  publishedAt: string;      // YYYY-MM-DDTHH:mm:ss
  status: ArticleStatus;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

interface DiaryEntry {
  id: string;
  date: string;             // YYYY-MM-DD
  time: string;             // HH:mm
  title: string;            // 为空由后端生成 `${date} 每日日报`
  mood: Mood;
  tags: string[];
  content: string;
  createdAt: string;
  updatedAt: string;
}

interface Category {
  id: string;
  name: string;
  description: string;
  dotColor: string;         // #rrggbb
  sortOrder: number;
  articleCount?: number;    // 仅 bootstrap 与 admin 列表明细中返回
}

interface TagStat { name: string; count: number; }

interface SiteSettings {
  // 注意：不含任何密码字段
  blogTitle: string;
  blogSubtitle: string;
  authorName: string;
  authorHandle: string;
  authorBio: string;
  authorLocation: string;
  authorEmail: string;
  aboutContent: string;
  updatedAt: string;
}

interface Page<T> { items: T[]; total: number; page: number; pageSize: number; }
```

---

## 1. 认证接口 `/api/auth`

### `POST /api/auth/login`
- 请求：`{"password": "..."}`（`1..64` 字符）
- 成功 `200`：`{"isAdmin": true}` + `Set-Cookie: blog_admin_session=...`
- 失败 `401`：`{"detail": "密码不正确"}`
- 限流：同一 IP 每分钟最多 10 次失败尝试，超出返回 `429 {"detail": "尝试过于频繁，请稍后再试"}`

### `POST /api/auth/logout`
- 成功 `200`：`{"isAdmin": false}`，并删除 Cookie（`max_age=0`）

### `GET /api/auth/me`
- 成功 `200`：`{"isAdmin": true}` 或 `{"isAdmin": false}`（永不 401）

---

## 2. 公开接口（访客）

### `GET /api/public/bootstrap`
```json
{
  "settings": { /* SiteSettings，无密码 */ },
  "categories": [ { "id": "1", "name": "工程实践", "description": "...", "dotColor": "#3b82f6", "sortOrder": 0, "articleCount": 3 } ],
  "tags": [ { "name": "Tailwind", "count": 2 } ],
  "meta": { "articleCount": 5, "categoryCount": 3 }
}
```
- `categories` 与 `tags` 的计数**只统计 `status='published'`** 的文章。

### `GET /api/articles`
- 查询参数：`q`、`category_id`、`tag`、`page`（默认 1）、`page_size`（默认 20，最大 100）
- 强制 `status = 'published'`；排序 `pinned DESC, published_at DESC, id DESC`
- `q` 模糊匹配 `title / excerpt / content / 标签名`
- 响应：`Page<Article>` → `{"items": [...], "total": 12, "page": 1, "pageSize": 20}`

### `GET /api/articles/archive`
- 查询参数：`q`、`category_id`、`tag`（可选，语义同上）
- 不分页，返回**全部**命中的已发布文章精简字段，按 `published_at DESC` 排序
- 响应：`{"items": [{"id": "3", "title": "...", "categoryId": "1", "publishedAt": "2026-11-25T10:30:00", "pinned": false}], "total": 12}`

### `GET /api/articles/{id}`
- 仅 `status='published'` 可读，草稿/不存在 → `404 {"detail": "文章不存在"}`
- 响应：`Article` 平铺 + `prev` / `next`（同排序序列中的相邻文章，无则 `null`）：
```json
{ "id": "3", "...": "...", "prev": {"id": "2", "title": "上一篇"} , "next": null }
```

---

## 3. 管理员接口（全部 `require_admin`，未鉴权一律 `401`）

### 文章
| 方法 | 路径 | 请求体 | 响应 |
|---|---|---|---|
| `GET` | `/api/admin/articles` | — (`status`, `q` 可选) | `{"items": Page<Article> 的 items, "total": n}`（含草稿，`pinned DESC, published_at DESC`） |
| `POST` | `/api/admin/articles` | `ArticleInput` | `Article` |
| `PUT` | `/api/admin/articles/{id}` | `ArticleInput` | `Article` |
| `PATCH` | `/api/admin/articles/{id}/pin` | `{"pinned"?: boolean}` | `Article`（不传 `pinned` 则取反） |
| `DELETE` | `/api/admin/articles/{id}` | — | `{"ok": true}` |

```ts
interface ArticleInput {
  title: string;                 // 必填 1..200
  excerpt?: string;              // 留空后端自动截取
  content: string;               // 必填
  categoryId?: string | null;    // 为空则 null
  tags?: string[];               // 自动去空、去重、去前导 #，按出现顺序
  publishedAt?: string | null;   // 不传/空 → 服务器当前 Asia/Shanghai 时间
  status?: ArticleStatus;        // 默认 published
  pinned?: boolean;              // 默认 false
}
```
- 标签：输入不存在则自动创建；传入的完整标签集合替换原关联（差集删除）。

### 日记
| 方法 | 路径 | 请求体 | 响应 |
|---|---|---|---|
| `GET` | `/api/admin/diaries` | — (`q`, `tag` 可选) | `{"items": DiaryEntry[], "total": n}`，`entry_date DESC, entry_time DESC` |
| `POST` | `/api/admin/diaries` | `DiaryInput` | `DiaryEntry` |
| `PUT` | `/api/admin/diaries/{id}` | `DiaryInput` | `DiaryEntry` |
| `DELETE` | `/api/admin/diaries/{id}` | — | `{"ok": true}` |

```ts
interface DiaryInput {
  date: string;                  // YYYY-MM-DD 必填（支持任意历史/未来日期）
  time?: string | null;          // HH:mm，为空 → 服务器当前时间
  title?: string;                // 为空 → `${date} 每日日报`
  mood?: Mood;                   // 默认 focused
  tags?: string[];               // 默认 []
  content: string;               // 必填
}
```

### 分类
| 方法 | 路径 | 请求体 | 响应 |
|---|---|---|---|
| `POST` | `/api/admin/categories` | `{name, description?, dotColor?, sortOrder?}` | `Category` |
| `PUT` | `/api/admin/categories/{id}` | `{name?, description?, dotColor?, sortOrder?}` | `Category` |
| `DELETE` | `/api/admin/categories/{id}` | — | `{"ok": true}` |

- 分类名唯一，重复 → `400 {"detail": "分类名称已存在"}`。
- 删除规则：该分类下仍有文章 → `400 {"detail": "该分类下仍有 N 篇文章，请先迁移"}`；全站仅剩 1 个分类 → `400 {"detail": "至少保留一个分类"}`；否则把文章 `category_id` 外键 `ON DELETE SET NULL` 兜底。

### 标签（路径中的 `{tag_name}` 需 URL 编码）
| 方法 | 路径 | 请求体 | 响应 |
|---|---|---|---|
| `PATCH` | `/api/admin/tags/{tag_name}` | `{"newName": "新名字"}` | `{"ok": true, "name": "新名字", "merged": false, "affected": 3}` |
| `DELETE` | `/api/admin/tags/{tag_name}` | — | `{"ok": true, "affected": 3}` |

- 重命名时若 `newName` 已存在 → 合并：把 `article_tags` 指向新标签、去重后删除旧标签，`merged: true`。
- 删除标签：解除所有文章关联后删除标签行。

### 站点设置
| 方法 | 路径 | 请求体 | 响应 |
|---|---|---|---|
| `GET` | `/api/admin/settings` | — | `SiteSettings` |
| `PUT` | `/api/admin/settings` | `Partial<SiteSettings>`（不含密码，字段全部可选） | `SiteSettings` |

### 密码
- `PUT /api/admin/password`，请求 `{"oldPassword": "...", "newPassword": "..."}`
  - 旧密码错误 → `400 {"detail": "原密码不正确"}`
  - 新密码长度 `6..64`，否则 `400`
  - 成功：更新 `admin_password_hash`，`token_version += 1`，并**为当前会话重新签发 Cookie**（响应 `{"ok": true}`），
    使其它旧会话失效但当前浏览器不掉线。

---

## 4. 运维接口
- `GET /health`（**无 `/api` 前缀**）：执行 `SELECT 1` 成功 → `200 {"status": "ok", "database": "up"}`；
  数据库异常 → `503 {"status": "error", "database": "down"}`。

---

## 5. 验收自检（第 8 章映射）
1. 未登录 `GET /api/admin/diaries`、`/api/admin/articles`、`/api/admin/settings` → 全部 `401`。
2. 未登录 `GET /api/articles` 结果中无 `status='draft'`；`GET /api/articles/{draftId}` → `404`。
3. `GET /api/public/bootstrap` 响应中不含 `adminPasswordHash`（字符串检查）。
4. `POST /api/admin/articles` 不传 `publishedAt` → 落库时间为当前上海时间。
5. `publishedAt=2026-12-01T09:00` + `status=published` → 访客首页立刻可见，排在普通近期文章之前、置顶文章之后。
6. 日记按 `date=前一天` 补写后重新 `GET` 仍在。
7. `aboutContent` 更新后 `GET /api/public/bootstrap` 立即可见。
