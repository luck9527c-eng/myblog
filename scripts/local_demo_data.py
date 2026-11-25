#!/usr/bin/env python3
"""向本地开发库灌入一份「看起来像样」的示例内容，方便验收界面。

仅在本地开发环境使用；内容可在后台「文章管理 / 日记管理」中随时删除。
脚本幂等：若已存在同名标题的文章/日记则跳过。

    python scripts/local_demo_data.py
    BLOG_BASE_URL=http://127.0.0.1:8005 BLOG_ADMIN_PASSWORD=admin123456 python scripts/local_demo_data.py
"""

from __future__ import annotations

import http.cookiejar
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta
from typing import Any

BASE = os.environ.get("BLOG_BASE_URL", "http://127.0.0.1:8005").rstrip("/")
ADMIN_PASSWORD = os.environ.get("BLOG_ADMIN_PASSWORD", "admin123456")

ARTICLES: list[dict[str, Any]] = [
    {
        "title": "为什么个人博客第一版应该先砍掉评论和阅读量？",
        "excerpt": "在搭建个人写作空间时，最容易陷入“功能越多越完整”的误区。减法往往能带来更持久的写作动力。",
        "category": "产品与设计",
        "tags": ["极简主义", "信息架构", "博客"],
        "pinned": True,
        "days_ago": 0,
        "content": """很多人开始搭建个人博客时，第一件事不是写文章，而是研究评论系统、阅读量计数器、点赞动画和访客地图。

但在实际运营中，这些指标往往会悄悄改变写作心态。

## 1. 去掉阅读数，恢复纯粹的表达

当每篇文章标题下方都挂着一个 `12 次阅读` 的数字时，作者很容易被短期反馈牵着走。去掉计数之后，写给三个月后自己的技术备忘，和写给大众的教程拥有同样的地位。

## 2. 没有评论区，反而降低了维护成本

对于独立博客而言，评论区意味着垃圾留言过滤、邮箱通知配置以及跨设备样式兼容。将反馈渠道收敛到一封邮件或社交主页链接，既保持了版面的干净，也让交流更有质量。

## 3. 三栏布局的克制边界

> 好的工具应当像一张平整的桌面：常用索引触手可及，正文区域安静克制。

在三栏结构里：

- **左栏** 固定角色身份与核心导航
- **中栏** 只承接文章列表与沉浸阅读
- **右栏** 负责搜索、分类标签与时间归档

如果你也在规划自己的第一版站点，不妨先把 80% 的精力放在排版可读性与后台写作体验上。
""",
    },
    {
        "title": "三栏布局在桌面与移动端之间的响应式折中方案",
        "excerpt": "桌面端宽裕的横向空间可以容纳左中右三栏，但到了手机端，抽屉与底部导航该如何配合才能不显拥挤？",
        "category": "工程实践",
        "tags": ["Tailwind", "响应式设计", "UI"],
        "days_ago": 3,
        "content": """桌面端的三栏布局非常适合信息密度适中的知识库或个人站点，但一进入 `< 1024px` 视口，三栏如果硬塞就会彻底不可用。

## 桌面端的黄金比例

以 `1280px` 容器为例，比较舒服的宽度分配是：

- 左侧导航栏：`240px` 固定宽度，粘性定位（sticky）
- 中间主内容区：`minmax(0, 1fr)`，保证正文阅读行宽落在 `65ch ~ 75ch`
- 右侧辅助栏：`280px` 固定宽度，承载搜索、标签与时间索引

## 移动端的交互收敛

在手机屏幕上，用户最核心的动作只有两类：**阅读正文** 与 **快速切换频道/筛选**。

```tsx
// 移动端断点下的核心适配策略
// 1. 顶部极简栏：左侧抽屉触发器 + 站点标题 + 右侧筛选抽屉触发器
// 2. 底部固定导航：首页 / 归档 / [管理员专属：日记 / 后台]
```

通过将左栏和右栏分别转为左右滑出抽屉（Drawer），再配合底部的拇指热区导航栏，单手操作体验会非常顺滑。
""",
    },
    {
        "title": "自定义发布时间：把旧笔记搬进时间线的正确姿势",
        "excerpt": "补录历史笔记时最容易破坏的就是时间轴。允许自由设定发布时间、且未来时间也立即公开，是更贴合个人写作习惯的设计。",
        "category": "随笔与思考",
        "tags": ["时间轴", "工作流"],
        "days_ago": 7,
        "content": """这是一篇用于验证**自定义发布时间**的示例文章。

## 为什么需要自由设定发布时间？

1. **补录历史笔记**：把去年写在本地 Markdown 文件夹里的旧文章搬运上来时，可以精确还原当时的创作日期，不破坏归档时间线。
2. **编排系列顺序**：写系列教程时，可以通过微调发布时间控制文章在时间轴上的前后顺序。
3. **预设专题日期**：希望某篇月度总结严格落在月初第一天展示，无需等待定时任务。

> 注意：本项目**不做**定时发布隐藏逻辑 —— 未来时间只是展示与排序时间，状态为「已发布」就立即对访客公开。

在后台「文章管理 → 编辑」里可以随时修改发布时间，或点「设为当前时间」一键重置。
""",
    },
]

DIARIES: list[dict[str, Any]] = [
    {
        "days_ago": 0,
        "title": "博客第一版上线与三栏布局复盘",
        "mood": "focused",
        "tags": ["日报", "复盘"],
        "content": """### 今日完成
- 把原型里的 localStorage 数据层换成了真实 API + MySQL 持久化。
- 校验了访客与管理员两条链路的权限隔离：未登录访问后台接口一律 401。
- 确认了自定义发布时间的排序：置顶优先，其余按发布时间倒序。

### 遇到问题与思考
- 移动端既要保留抽屉查看个人名片与搜索，又要快速切到日记和后台，底部固定导航栏是最稳妥的解法。
- XSS：Markdown 渲染统一走 DOMPurify 清洗，简历页也一并覆盖。

### 明日计划
- [ ] 补充两篇长文的技术细节
- [ ] 给归档页加一个按年份折叠的交互
""",
    },
    {
        "days_ago": 2,
        "title": "深色模式下的文字对比度调优",
        "mood": "calm",
        "tags": ["视觉细节", "CSS"],
        "content": """### 今日完成
- 对比了纯黑背景 `#000000` 和微灰深色 `#0b0c0f` 的长文阅读疲劳感，最终选定微灰炭黑底色配合柔和边框。
- 调整了 Markdown 引用块与行内代码块的圆角与间距。

### 遇到问题与思考
- 深色模式下蓝色链接过亮会刺眼，调低饱和度后舒适很多。

### 明日计划
- [ ] 在手机真机尺寸下检查抽屉动画与安全区适配
""",
    },
]


class Client:
    def __init__(self) -> None:
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))

    def call(self, method: str, path: str, body: Any = None) -> tuple[int, Any]:
        data = None
        headers = {"Accept": "application/json"}
        if body is not None:
            data = json.dumps(body, ensure_ascii=False).encode("utf-8")
            headers["Content-Type"] = "application/json"
        req = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
        try:
            with self.opener.open(req, timeout=20) as resp:
                raw = resp.read().decode("utf-8", "replace")
                return resp.status, (json.loads(raw) if raw else None)
        except urllib.error.HTTPError as err:
            raw = err.read().decode("utf-8", "replace")
            try:
                payload = json.loads(raw) if raw else None
            except json.JSONDecodeError:
                payload = raw
            return err.code, payload


def main() -> int:
    client = Client()
    status, body = client.call("POST", "/api/auth/login", {"password": ADMIN_PASSWORD})
    if status != 200:
        print(f"登录失败（{status}）：{body}")
        print("请确认后端已启动，且 backend/.env 的 ADMIN_INIT_PASSWORD 与传入值一致。")
        return 1

    _, boot = client.call("GET", "/api/public/bootstrap")
    cats = {c["name"]: str(c["id"]) for c in (boot or {}).get("categories", []) or []}
    default_cat = next(iter(cats.values()), None)

    _, existing = client.call("GET", "/api/admin/articles")
    existing_titles = {str(a.get("title")) for a in (existing or {}).get("items", []) or []}

    created = 0
    now = datetime.now()
    for item in ARTICLES:
        if item["title"] in existing_titles:
            print(f"跳过已存在文章：{item['title']}")
            continue
        published = (now - timedelta(days=int(item["days_ago"]))).replace(second=0, microsecond=0)
        status, resp = client.call(
            "POST",
            "/api/admin/articles",
            {
                "title": item["title"],
                "excerpt": item["excerpt"],
                "content": item["content"],
                "categoryId": cats.get(item["category"], default_cat),
                "tags": item["tags"],
                "publishedAt": published.strftime("%Y-%m-%dT%H:%M:%S"),
                "status": "published",
                "pinned": bool(item.get("pinned", False)),
            },
        )
        print(f"{'新建' if status == 200 else '失败'}文章：{item['title']} ({status})")
        created += 1

    _, existing_diaries = client.call("GET", "/api/admin/diaries")
    existing_diary_titles = {str(d.get("title")) for d in (existing_diaries or {}).get("items", []) or []}
    for item in DIARIES:
        if item["title"] in existing_diary_titles:
            print(f"跳过已存在日记：{item['title']}")
            continue
        day = (now - timedelta(days=int(item["days_ago"]))).strftime("%Y-%m-%d")
        status, resp = client.call(
            "POST",
            "/api/admin/diaries",
            {
                "date": day,
                "title": item["title"],
                "mood": item["mood"],
                "tags": item["tags"],
                "content": item["content"],
            },
        )
        print(f"{'新建' if status == 200 else '失败'}日记：{item['title']} ({status})")
        created += 1

    client.call("POST", "/api/auth/logout")
    print(f"\n完成，新增 {created} 条示例内容。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
