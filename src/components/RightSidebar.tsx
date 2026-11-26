import React, { useMemo } from 'react';
import { Folder, Hash, ListTree, Search, Sparkles, X } from 'lucide-react';
import type { AppView, Article, Category, DiaryEntry, TagStat } from '../types';
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
  /** bootstrap 返回的分类（含已发布文章数 articleCount） */
  categories: Category[];
  /** 首页已加载的文章（仅用于「近期更新」） */
  publishedArticles: Article[];
  /** bootstrap 返回的已发布文章标签统计 */
  tagStats: TagStat[];
  diaries: DiaryEntry[];
  isAdmin: boolean;
  tocHeadings: TocHeading[];
  activeHeadingId?: string | null;
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
  tagStats,
  diaries,
  isAdmin,
  tocHeadings,
  activeHeadingId,
  onOpenArticle,
  onCloseMobileDrawer,
}) => {
  const isDiaryMode = isAdmin && currentView === 'diary';

  const allTags = useMemo<Array<[string, number]>>(() => {
    if (isDiaryMode) {
      const map = new Map<string, number>();
      diaries.forEach((d) => d.tags.forEach((t) => map.set(t, (map.get(t) || 0) + 1)));
      return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
    }
    const rendered: Array<[string, number]> = tagStats.map((stat) => [stat.name, stat.count]);
    return rendered.sort((a, b) => b[1] - a[1]);
  }, [diaries, tagStats, isDiaryMode]);

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
      <div className="relative" data-rain-ledge>
        <Search className="w-4 h-4 text-zinc-500 dark:text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none z-10" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={isDiaryMode ? '搜索日记标题、内容或标签...' : '搜索文章标题、内容或标签...'}
          className="glass-input w-full pl-10 pr-9 py-2.5 text-sm rounded-2xl text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 dark:placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/25 transition"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => onSearchChange('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 z-10"
            aria-label="清除搜索"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Article Table of Contents (shown when reading an article) */}
      {currentView === 'article' && tocHeadings.length > 0 && (
        <section className="glass-card rounded-2xl p-4.5">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2 mb-3">
            <ListTree className="w-4 h-4 text-indigo-500" />
            <span>文章目录</span>
          </h3>
          <ul className="space-y-1">
            {tocHeadings.map((h) => {
              const isActive = activeHeadingId === h.id;
              return (
                <li key={h.id}>
                  <button
                    type="button"
                    onClick={() => handleHeadingClick(h.id)}
                    style={{ paddingLeft: `${8 + (h.level - 1) * 12}px` }}
                    className={`w-full text-left text-sm py-1 pr-2 rounded-lg truncate transition-all border-l-2 ${
                      isActive
                        ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 font-medium'
                        : 'border-transparent text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white hover:bg-white/40 dark:hover:bg-white/5'
                    }`}
                  >
                    {h.text}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Categories (shown in article views) */}
      {!isDiaryMode && (
        <section className="glass-card rounded-2xl p-4.5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <Folder className="w-4 h-4 text-indigo-500" />
              <span>文章分类</span>
            </h3>
            {selectedCategoryId && (
              <button
                type="button"
                onClick={() => onSelectCategory(null)}
                className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
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
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm transition-all ${
                    active
                      ? 'bg-zinc-900/90 text-white dark:bg-white/90 dark:text-zinc-900 font-medium shadow-xs'
                      : 'text-zinc-600 hover:bg-white/60 dark:text-zinc-300 dark:hover:bg-white/10'
                  }`}
                >
                  <span className="flex items-center gap-2.5 truncate">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: cat.dotColor }}
                    />
                    <span className="truncate">{cat.name}</span>
                  </span>
                  <span className="text-xs opacity-70 tabular-nums">
                    {cat.articleCount ?? 0}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Tags */}
      <section className="glass-card rounded-2xl p-4.5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <Hash className="w-4 h-4 text-indigo-500" />
            <span>{isDiaryMode ? '日记标签' : '标签索引'}</span>
          </h3>
          {selectedTag && (
            <button
              type="button"
              onClick={() => onSelectTag(null)}
              className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
            >
              重置
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {allTags.length === 0 ? (
            <span className="text-sm text-zinc-500 dark:text-zinc-400">暂无标签</span>
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
                  className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-all ${
                    active
                      ? 'bg-zinc-900/90 text-white dark:bg-white dark:text-zinc-900 font-medium shadow-xs'
                      : 'bg-white/70 text-zinc-800 hover:bg-white border border-white/80 dark:bg-white/15 dark:text-white dark:border-white/25 dark:hover:bg-white/25'
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
        <section className="glass-card rounded-2xl p-4.5">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-indigo-500" />
            <span>近期更新</span>
          </h3>
          <div className="space-y-3">
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
                <p className="text-sm font-medium text-zinc-700 group-hover:text-zinc-950 dark:text-zinc-100 dark:group-hover:text-white line-clamp-1 transition-colors">
                  {art.title}
                </p>
                <p className="text-xs text-zinc-600 dark:text-zinc-300/80 mt-0.5 tabular-nums">
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
