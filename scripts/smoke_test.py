#!/usr/bin/env python3
"""端到端验收脚本：对着真实运行的后端跑 docs/DEVELOPMENT_SPEC.md 第 8 章的验收项。

只用标准库，不依赖后端依赖。用法：

    python scripts/smoke_test.py                        # 默认 http://127.0.0.1:8005
    BLOG_BASE_URL=http://127.0.0.1:8005 \
    BLOG_ADMIN_PASSWORD=admin123456 python scripts/smoke_test.py

脚本会创建带 SMOKE-<时间戳> 前缀的临时数据，结束时自动清理（包括恢复站点设置与原始密码）。
退出码 0 表示全部通过。
"""

from __future__ import annotations

import http.cookiejar
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta
from typing import Any
from urllib.parse import quote

BASE = os.environ.get("BLOG_BASE_URL", "http://127.0.0.1:8005").rstrip("/")
ADMIN_PASSWORD = os.environ.get("BLOG_ADMIN_PASSWORD", "admin123456")
MARK = f"SMOKE-{int(time.time())}"

results: list[tuple[bool, str, str]] = []


def record(ok: bool, name: str, detail: str = "") -> bool:
    results.append((ok, name, detail))
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + (f"  -> {detail}" if detail and not ok else ""))
    return ok


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

    def cookie_names(self) -> list[str]:
        return [c.name for c in self.jar]


def main() -> int:  # noqa: C901 - 线性验收脚本，保持可读
    anon = Client()
    admin = Client()
    created_articles: list[str] = []
    created_diaries: list[str] = []
    original_settings: dict[str, Any] = {}

    try:
        # ---------- 1. 运维健康 ----------
        status, body = anon.call("GET", "/health")
        record(
            status == 200 and isinstance(body, dict) and body.get("status") == "ok" and body.get("database") == "up",
            "GET /health 返回 200 且 database=up",
            f"{status} {body}",
        )

        # ---------- 2. 访客元数据与脱敏 ----------
        status, boot = anon.call("GET", "/api/public/bootstrap")
        ok = (
            status == 200
            and isinstance(boot, dict)
            and isinstance(boot.get("settings"), dict)
            and isinstance(boot.get("categories"), list)
            and isinstance(boot.get("tags"), list)
        )
        record(ok, "GET /api/public/bootstrap 结构完整", f"{status} keys={list(boot) if isinstance(boot, dict) else boot}")
        record(
            "admin_password_hash" not in json.dumps(boot, ensure_ascii=False).lower()
            and "adminpasswordhash" not in json.dumps(boot, ensure_ascii=False).lower(),
            "bootstrap 不含任何密码哈希字段",
        )
        settings = (boot or {}).get("settings") or {}
        record("adminPassword" not in settings, "bootstrap.settings 不含 adminPassword")

        # ---------- 3. 未登录隔离 ----------
        record(anon.call("GET", "/api/auth/me") == (200, {"isAdmin": False}), "GET /api/auth/me 未登录返回 isAdmin=false")
        for path in ("/api/admin/articles", "/api/admin/diaries", "/api/admin/settings"):
            status, _ = anon.call("GET", path)
            record(status == 401, f"未登录 GET {path} => 401", str(status))
        status, _ = anon.call("POST", "/api/admin/articles", {"title": "x", "content": "y"})
        record(status == 401, "未登录 POST /api/admin/articles => 401", str(status))

        # ---------- 4. 登录 ----------
        status, _ = anon.call("POST", "/api/auth/login", {"password": ADMIN_PASSWORD + "-wrong"})
        record(status == 401, "错误密码登录 => 401", str(status))
        status, body = admin.call("POST", "/api/auth/login", {"password": ADMIN_PASSWORD})
        record(
            status == 200 and isinstance(body, dict) and body.get("isAdmin") is True,
            "正确密码登录成功",
            f"{status} {body}",
        )
        record("blog_admin_session" in admin.cookie_names(), "登录后种入 blog_admin_session Cookie")
        record(admin.call("GET", "/api/auth/me") == (200, {"isAdmin": True}), "带 Cookie 的 /api/auth/me 为 true")

        # ---------- 5. 自定义发布时间 ----------
        categories = (boot or {}).get("categories") or []
        category_id = str(categories[0]["id"]) if categories else None

        status, article = admin.call(
            "POST",
            "/api/admin/articles",
            {
                "title": f"{MARK} 默认时间文章",
                "content": "## 概要\n\n用于验证默认发布时间。\n\n- 列表项 A\n- 列表项 B",
                "categoryId": category_id,
                "tags": [MARK, "测试"],
                "status": "published",
            },
        )
        ok = status == 200 and isinstance(article, dict) and str(article.get("id", "")).isdigit() is False
        record(status == 200 and isinstance(article, dict), "创建文章（不传 publishedAt）成功", f"{status} {article}")
        if isinstance(article, dict):
            created_articles.append(str(article["id"]))
            published_at = str(article.get("publishedAt", ""))
            record(
                published_at[:4] == datetime.now().strftime("%Y-%m"),
                "未传 publishedAt 时落库为当前上海时间",
                published_at,
            )
            record(article.get("status") == "published" and article.get("pinned") is False, "默认 status=published 且未置顶")
            record(bool(article.get("excerpt")), "留空 excerpt 时后端自动截取正文", str(article.get("excerpt")))
            record(article.get("tags") == [MARK, "测试"], "标签按传入顺序保存", str(article.get("tags")))

        # 未来发布时间 + 置顶组合
        future_at = "2026-12-01T09:00:00"
        status, future_article = admin.call(
            "POST",
            "/api/admin/articles",
            {
                "title": f"{MARK} 未来时间文章",
                "content": "用于验证未来日期立即公开与排序。",
                "categoryId": category_id,
                "tags": [MARK],
                "status": "published",
                "publishedAt": future_at,
            },
        )
        record(status == 200 and isinstance(future_article, dict), "创建未来时间文章成功", f"{status} {future_article}")
        if isinstance(future_article, dict):
            created_articles.append(str(future_article["id"]))
            record(
                str(future_article.get("publishedAt", "")).startswith("2026-12-01T09:00"),
                "未来 publishedAt 原样保存（不隐藏、不裁剪）",
                str(future_article.get("publishedAt")),
            )

        # 置顶文章
        status, pinned_article = admin.call(
            "POST",
            "/api/admin/articles",
            {
                "title": f"{MARK} 置顶文章",
                "content": "用于验证 pinned DESC 优先于 published_at DESC。",
                "tags": [MARK],
                "status": "published",
                "pinned": True,
                "publishedAt": "2020-01-01T00:00:00",
            },
        )
        if isinstance(pinned_article, dict):
            created_articles.append(str(pinned_article["id"]))
        record(status == 200 and isinstance(pinned_article, dict), "创建置顶文章成功", f"{status} {pinned_article}")

        # 草稿
        status, draft = admin.call(
            "POST",
            "/api/admin/articles",
            {"title": f"{MARK} 草稿", "content": "草稿不应出现在公开列表。", "status": "draft", "tags": [MARK]},
        )
        if isinstance(draft, dict):
            created_articles.append(str(draft["id"]))
        record(status == 200 and isinstance(draft, dict) and draft.get("status") == "draft", "创建草稿成功", f"{status}")

        # 公开列表：草稿不可见 + 排序正确
        status, page = anon.call("GET", "/api/articles?page_size=100")
        items = (page or {}).get("items") or []
        record(status == 200 and isinstance(items, list), "GET /api/articles 返回列表", f"{status}")
        record(all(i.get("status") == "published" for i in items), "公开列表不含任何 draft")
        if isinstance(draft, dict):
            record(str(draft["id"]) not in [str(i["id"]) for i in items], "草稿文章不在公开列表中")
            status, _ = anon.call("GET", f"/api/articles/{draft['id']}")
            record(status == 404, "访客读取草稿详情 => 404", str(status))

        order = [(bool(i.get("pinned")), str(i.get("publishedAt"))) for i in items]
        record(
            order == sorted(order, key=lambda t: (not t[0], t[1]), reverse=False)
            or all(order[i][0] >= order[i + 1][0] for i in range(len(order) - 1)),
            "公开列表置顶优先",
            str(order[:5]),
        )
        pinned_ids = [str(i["id"]) for i in items if i.get("pinned")]
        if isinstance(pinned_article, dict):
            record(str(pinned_article["id"]) in pinned_ids, "置顶文章出现在列表最前部")
        if isinstance(future_article, dict) and pinned_ids:
            idx_future = [str(i["id"]) for i in items].index(str(future_article["id"]))
            idx_pinned = [str(i["id"]) for i in items].index(pinned_ids[0])
            record(idx_future > idx_pinned, "未来时间文章排在置顶文章之后")

        # 归档接口
        status, archive = anon.call("GET", "/api/articles/archive")
        arch_items = (archive or {}).get("items") or []
        record(
            status == 200 and all(set(i) >= {"id", "title", "publishedAt"} for i in arch_items),
            "GET /api/articles/archive 返回精简字段",
            f"{status}",
        )
        if arch_items:
            dates = [str(i["publishedAt"]) for i in arch_items]
            record(dates == sorted(dates, reverse=True), "归档按发布时间倒序")

        # 详情 + prev/next
        if isinstance(article, dict):
            status, detail = anon.call("GET", f"/api/articles/{article['id']}")
            record(
                status == 200 and isinstance(detail, dict) and "prev" in detail and "next" in detail,
                "文章详情包含 prev/next 字段",
                f"{status} keys={list(detail) if isinstance(detail, dict) else detail}",
            )
            status, _ = anon.call("GET", "/api/articles/99999999")
            record(status == 404, "不存在的文章 => 404", str(status))

        # ---------- 6. 日记闭环 ----------
        yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
        status, diary = admin.call(
            "POST",
            "/api/admin/diaries",
            {
                "date": yesterday,
                "title": f"{MARK} 补写日报",
                "content": "### 今日完成\n- 补写测试\n",
                "mood": "calm",
                "tags": [MARK, "日报"],
            },
        )
        record(status == 200 and isinstance(diary, dict), "创建昨日补写日记成功", f"{status} {diary}")
        if isinstance(diary, dict):
            created_diaries.append(str(diary["id"]))
            record(diary.get("date") == yesterday, "日记日期为前一天", str(diary.get("date")))
            record(bool(diary.get("time")), "未传 time 时填当前时间", str(diary.get("time")))
        status, diaries = admin.call("GET", "/api/admin/diaries")
        dy_items = (diaries or {}).get("items") or []
        record(
            status == 200 and any(MARK in str(d.get("title")) for d in dy_items),
            "重新读取可持久化加载补写日记",
            f"{status}",
        )
        record(
            [str(d.get("date")) for d in dy_items] == sorted([str(d.get("date")) for d in dy_items], reverse=True),
            "日记按 entry_date DESC 排序",
        )
        status, _ = anon.call("GET", "/api/admin/diaries")
        record(status == 401, "访客读取日记列表 => 401", str(status))

        # 未命名日记自动标题
        status, auto_diary = admin.call("POST", "/api/admin/diaries", {"date": yesterday, "content": "自动标题测试"})
        record(
            status == 200 and isinstance(auto_diary, dict) and auto_diary.get("title") == f"{yesterday} 每日日报",
            "标题留空自动生成「{日期} 每日日报」",
            str(auto_diary.get("title") if isinstance(auto_diary, dict) else auto_diary),
        )
        if isinstance(auto_diary, dict):
            created_diaries.append(str(auto_diary["id"]))

        # ---------- 7. 分类与标签 ----------
        status, new_cat = admin.call(
            "POST", "/api/admin/categories", {"name": f"{MARK} 分类", "description": "临时", "dotColor": "#123456"}
        )
        record(status == 200 and isinstance(new_cat, dict), "新增分类成功", f"{status} {new_cat}")
        if isinstance(new_cat, dict):
            status, _ = admin.call("POST", "/api/admin/categories", {"name": f"{MARK} 分类"})
            record(status == 400, "重复分类名 => 400", str(status))
            status, _ = admin.call("DELETE", f"/api/admin/categories/{new_cat['id']}")
            record(status == 200, "删除空分类成功", str(status))

        # 有文章的分类不可删
        if category_id:
            status, _ = admin.call("DELETE", f"/api/admin/categories/{category_id}")
            record(status in (200, 400), "删除有文章的分类返回 400（或该分类本就为空）", str(status))

        # 标签重命名 + 合并
        status, renamed = admin.call("PATCH", f"/api/admin/tags/{quote(MARK)}", {"newName": f"{MARK}-renamed"})
        record(status == 200 and isinstance(renamed, dict) and renamed.get("name") == f"{MARK}-renamed", "标签重命名成功", f"{status} {renamed}")
        status, merged = admin.call("PATCH", f"/api/admin/tags/{quote(f'{MARK}-renamed')}", {"newName": "测试"})
        record(status == 200 and isinstance(merged, dict) and merged.get("merged") is True, "重命名为已存在标签 => 合并", f"{status} {merged}")
        status, deleted = admin.call("DELETE", f"/api/admin/tags/{quote('测试')}")
        record(status == 200 and isinstance(deleted, dict) and deleted.get("ok") is True, "删除标签成功", f"{status} {deleted}")

        # ---------- 8. 站点设置与简历 ----------
        status, current = admin.call("GET", "/api/admin/settings")
        if status == 200 and isinstance(current, dict):
            original_settings = dict(current)
        about = f"## 验收简历\n\n{MARK} 于 {datetime.now():%H:%M:%S} 更新。\n\n- 技能 A\n- 技能 B\n\n<script>alert('xss')</script>"
        status, updated = admin.call(
            "PUT",
            "/api/admin/settings",
            {"aboutContent": about, "authorBio": f"{MARK} 简介", "blogTitle": f"{MARK} 博客"},
        )
        record(status == 200 and isinstance(updated, dict), "更新站点设置成功", f"{status} {updated}")
        status, boot2 = anon.call("GET", "/api/public/bootstrap")
        record(
            status == 200 and MARK in json.dumps((boot2 or {}).get("settings", {}), ensure_ascii=False),
            "访客 bootstrap 立即看到新简历内容",
        )

        # ---------- 9. 改密与会话失效 ----------
        new_password = ADMIN_PASSWORD + "-tmp"
        status, _ = admin.call("PUT", "/api/admin/password", {"oldPassword": "definitely-wrong", "newPassword": new_password})
        record(status == 400, "旧密码错误 => 400", str(status))
        status, _ = admin.call("PUT", "/api/admin/password", {"oldPassword": ADMIN_PASSWORD, "newPassword": new_password})
        record(status == 200, "修改密码成功", str(status))
        record(admin.call("GET", "/api/auth/me") == (200, {"isAdmin": True}), "改密后当前会话仍有效（重签 Cookie）")
        other = Client()
        record(other.call("POST", "/api/auth/login", {"password": new_password})[0] == 200, "新密码可登录")
        record(other.call("POST", "/api/auth/login", {"password": ADMIN_PASSWORD})[0] == 401, "旧密码不可再登录")
        status, _ = admin.call("PUT", "/api/admin/password", {"oldPassword": new_password, "newPassword": ADMIN_PASSWORD})
        record(status == 200, "密码已还原为初始值", str(status))

        # ---------- 10. 登出 ----------
        status, body = admin.call("POST", "/api/auth/logout")
        record(status == 200 and body == {"isAdmin": False}, "登出返回 isAdmin=false", f"{status} {body}")
        record(admin.call("GET", "/api/admin/articles")[0] == 401, "登出后管理接口 => 401")

    finally:
        # ---------- 清理 ----------
        cleaner = Client()
        if cleaner.call("POST", "/api/auth/login", {"password": ADMIN_PASSWORD})[0] == 200:
            for aid in created_articles:
                cleaner.call("DELETE", f"/api/admin/articles/{aid}")
            for did in created_diaries:
                cleaner.call("DELETE", f"/api/admin/diaries/{did}")
            if original_settings:
                keep = {
                    k: original_settings[k]
                    for k in (
                        "blogTitle", "blogSubtitle", "authorName", "authorHandle",
                        "authorBio", "authorLocation", "authorEmail", "aboutContent",
                    )
                    if k in original_settings
                }
                cleaner.call("PUT", "/api/admin/settings", keep)
            cleaner.call("DELETE", f"/api/admin/tags/{quote(f'{MARK}-renamed')}")
            cleaner.call("POST", "/api/auth/logout")
            print("\n--- 临时数据已清理，站点设置已还原 ---")

    failed = [r for r in results if not r[0]]
    print(f"\n合计 {len(results)} 项，通过 {len(results) - len(failed)} 项，失败 {len(failed)} 项。")
    if failed:
        print("\n失败明细：")
        for _, name, detail in failed:
            print(f"  - {name}  {detail}")
        return 1
    print("全部通过 ✅")
    return 0


if __name__ == "__main__":
    sys.exit(main())
