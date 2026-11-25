import React, { useMemo } from 'react';
import { Folder, Hash, ListTree, Search, Sparkles, X } from 'lucide-react';
import type { AppView, Article, Category, DiaryEntry } from '../types';
import { formatDateOnly } from '../utils/date';
import type { TocHeading } from '../utils/markdown';

interface RightSidebarProps {
  currentView: AppView;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  selectedCategoryId: string | null;
  onSelectCategory: (id: string | null) => void;
  selectedTag: string | null;
  onSelectTag: (tag: string | null) => void;
  categories: Category[];
  publishedArticles: Article[];
  diaries: DiaryEntry[];
  isAdmin: boolean;
  tocHeadings: TocHeading[];
  onOpenArticle: (articleId: string) => void;
  onCloseMobileDrawer?: () => void;
}

export const RightSidebar: React.FC<RightSidebarProps> = ({
  currentView,
  searchQuery,
  onSearchChange,
  selectedCategoryId,
  onSelectCategory,
  selectedTag,
  onSelectTag,
  categories,
  publishedArticles,
  diaries,
  isAdmin,
  tocHeadings,
  onOpenArticle,
  onCloseMobileDrawer,
}) => {
  const isDiaryMode = isAdmin && currentView === 'diary';

  const categoryCounts = useMemo(() => {
    const map: Record<string, number> = {};
    publishedArticles.forEach((a) => {
      map[a.categoryId] = (map[a.categoryId] || 0) + 1;
    });
    return map;
  }, [publishedArticles]);

  const allTags = useMemo(() => {
    const map = new Map<string, number>();
    if (isDiaryMode) {
      diaries.forEach((d) => d.tags.forEach((t) => map.set(t, (map.get(t) || 0) + 1)));
    } else {
      publishedArticles.forEach((a) =>
        a.tags.forEach((t) => map.set(t, (map.get(t) || 0) + 1)),
      );
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [publishedArticles, diaries, isDiaryMode]);

  const recentArticles = useMemo(() => {
    return [...publishedArticles]
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
      .slice(0, 4);
  }, [publishedArticles]);

  const handleHeadingClick = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      onCloseMobileDrawer?.();
    }
  };

  return (
    <div className="space-y-4">
      {/* Search Box */}
      <div className="relative">
        <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none z-10" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={isDiaryMode ? '搜索日记标题、内容或标签...' : '搜索文章标题、内容或标签...'}
          className="glass-input w-full pl-9 pr-8 py-2.5 text-xs rounded-2xl text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/25 transition"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => onSearchChange('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 z-10"
            aria-label="清除搜索"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Article Table of Contents (shown when reading an article) */}
      {currentView === 'article' && tocHeadings.length > 0 && (
        <section className="glass-card rounded-2xl p-4">
          <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5 mb-2.5">
            <ListTree className="w-3.5 h-3.5 text-indigo-500" />
            <span>文章目录</span>
          </h3>
          <ul className="space-y-1.5">
            {tocHeadings.map((h) => (
              <li key={h.id}>
                <button
                  type="button"
                  onClick={() => handleHeadingClick(h.id)}
                  style={{ paddingLeft: `${(h.level - 1) * 10}px` }}
                  className="w-full text-left text-xs text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white py-0.5 truncate transition-colors"
                >
                  {h.text}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Categories (shown in article views) */}
      {!isDiaryMode && (
        <section className="glass-card rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2.5">
            <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
              <Folder className="w-3.5 h-3.5 text-indigo-500" />
              <span>文章分类</span>
            </h3>
            {selectedCategoryId && (
              <button
                type="button"
                onClick={() => onSelectCategory(null)}
                className="text-[11px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
              >
                全部
              </button>
            )}
          </div>
          <div className="space-y-1">
            {categories.map((cat) => {
              const active = selectedCategoryId === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    onSelectCategory(active ? null : cat.id);
                    onCloseMobileDrawer?.();
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs transition-all ${
                    active
                      ? 'bg-zinc-900/90 text-white dark:bg-white/90 dark:text-zinc-900 font-medium shadow-xs'
                      : 'text-zinc-600 hover:bg-white/60 dark:text-zinc-300 dark:hover:bg-white/10'
                  }`}
                >
                  <span className="flex items-center gap-2 truncate">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: cat.dotColor }}
                    />
                    <span className="truncate">{cat.name}</span>
                  </span>
                  <span className="text-[11px] opacity-70 tabular-nums">
                    {categoryCounts[cat.id] || 0}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Tags */}
      <section className="glass-card rounded-2xl p-4">
        <div className="flex items-center justify-between mb-2.5">
          <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
            <Hash className="w-3.5 h-3.5 text-indigo-500" />
            <span>{isDiaryMode ? '日记标签' : '标签索引'}</span>
          </h3>
          {selectedTag && (
            <button
              type="button"
              onClick={() => onSelectTag(null)}
              className="text-[11px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
            >
              重置
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {allTags.length === 0 ? (
            <span className="text-xs text-zinc-400">暂无标签</span>
          ) : (
            allTags.map(([tag, count]) => {
              const active = selectedTag === tag;
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => {
                    onSelectTag(active ? null : tag);
                    onCloseMobileDrawer?.();
                  }}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] transition-all ${
                    active
                      ? 'bg-zinc-900/90 text-white dark:bg-white/90 dark:text-zinc-900 font-medium shadow-xs'
                      : 'bg-white/60 text-zinc-700 hover:bg-white/90 border border-white/70 dark:bg-white/5 dark:text-zinc-300 dark:border-white/10 dark:hover:bg-white/15'
                  }`}
                >
                  <span>#{tag}</span>
                  <span className="opacity-60 tabular-nums">{count}</span>
                </button>
              );
            })
          )}
        </div>
      </section>

      {/* Recent Updates */}
      {!isDiaryMode && (
        <section className="glass-card rounded-2xl p-4">
          <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5 mb-3">
            <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
            <span>近期更新</span>
          </h3>
          <div className="space-y-2.5">
            {recentArticles.map((art) => (
              <button
                key={art.id}
                type="button"
                onClick={() => {
                  onOpenArticle(art.id);
                  onCloseMobileDrawer?.();
                }}
                className="w-full text-left group block rounded-lg p-1.5 -mx-1.5 hover:bg-white/50 dark:hover:bg-white/5 transition-colors"
              >
                <p className="text-xs font-medium text-zinc-700 group-hover:text-zinc-950 dark:text-zinc-300 dark:group-hover:text-white line-clamp-1 transition-colors">
                  {art.title}
                </p>
                <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5 tabular-nums">
                  {formatDateOnly(art.publishedAt)}
                </p>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
