import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowUp,
  BookOpen,
  Briefcase,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Mail,
  MapPin,
  Pin,
  X,
} from 'lucide-react';
import type { AppView, Article, ArticleDetail, Category, SiteSettings } from '../types';
import {
  formatDateTimeLabel,
  getMonthKey,
  getYearMonthLabel,
} from '../utils/date';
import { estimateReadingStats, renderMarkdown } from '../utils/markdown';
import { AuthorAvatar } from './AuthorAvatar';
import { MarkdownBody } from './MarkdownBody';

interface ArticleFeedProps {
  view: Extract<AppView, 'home' | 'article' | 'archive' | 'about'>;
  /** 首页列表：服务端已按 pinned DESC, published_at DESC 排序并完成 q / 分类 / 标签筛选 */
  articles: Article[];
  total: number;
  feedLoading: boolean;
  feedLoadingMore: boolean;
  feedError: string | null;
  hasMore: boolean;
  onLoadMore: () => void;
  /** 归档页：由 GET /api/articles/archive 映射成的精简 Article 列表 */
  archiveArticles: Article[];
  archiveTotal: number;
  archiveLoading: boolean;
  archiveError: string | null;
  /** 单篇详情（含 prev/next） */
  article: ArticleDetail | null;
  articleLoading: boolean;
  articleError: string | null;
  categories: Category[];
  settings: SiteSettings;
  searchQuery: string;
  selectedCategoryId: string | null;
  selectedTag: string | null;
  isAdmin: boolean;
  onOpenArticle: (id: string) => void;
  onBackHome: () => void;
  onSelectCategory: (id: string | null) => void;
  onSelectTag: (tag: string | null) => void;
  onClearAllFilters: () => void;
  onEditArticleInAdmin: (articleId: string) => void;
  onOpenResumeSettings?: () => void;
}

const LoadingCard: React.FC<{ text?: string }> = ({ text = '正在加载…' }) => (
  <div className="glass-card rounded-2xl px-6 py-5 text-center">
    <span className="inline-flex items-center gap-2.5 text-sm text-zinc-500 dark:text-zinc-400">
      <span className="w-4 h-4 rounded-full border-2 border-zinc-300 border-t-transparent animate-spin dark:border-zinc-600 dark:border-t-transparent" />
      <span>{text}</span>
    </span>
  </div>
);

const ErrorCard: React.FC<{ message: string }> = ({ message }) => (
  <div className="glass-card rounded-2xl px-6 py-5 text-center text-sm text-rose-600 dark:text-rose-400">
    {message}
  </div>
);

export const ArticleFeed: React.FC<ArticleFeedProps> = ({
  view,
  articles,
  total,
  feedLoading,
  feedLoadingMore,
  feedError,
  hasMore,
  onLoadMore,
  archiveArticles,
  archiveTotal,
  archiveLoading,
  archiveError,
  article,
  articleLoading,
  articleError,
  categories,
  settings,
  searchQuery,
  selectedCategoryId,
  selectedTag,
  isAdmin,
  onOpenArticle,
  onBackHome,
  onSelectCategory,
  onSelectTag,
  onClearAllFilters,
  onEditArticleInAdmin,
  onOpenResumeSettings,
}) => {
  const categoryMap = useMemo(() => {
    const map = new Map<string, Category>();
    categories.forEach((c) => map.set(c.id, c));
    return map;
  }, [categories]);

  // 服务端已按 pinned DESC, published_at DESC 排序，这里不再本地过滤/重排
  const visibleArticles = articles;
  const hasFilters = Boolean(searchQuery || selectedCategoryId || selectedTag);

  // 长文阅读进度与回到顶部状态
  const [readProgress, setReadProgress] = useState(0);
  const [showBackToTop, setShowBackToTop] = useState(false);

  useEffect(() => {
    if (view !== 'article') {
      setReadProgress(0);
      setShowBackToTop(false);
      return;
    }

    const updateScroll = () => {
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const docHeight =
        document.documentElement.scrollHeight - document.documentElement.clientHeight;
      const progress = docHeight > 0 ? Math.min(100, Math.max(0, (scrollTop / docHeight) * 100)) : 0;
      setReadProgress(progress);
      setShowBackToTop(scrollTop > 360);
    };

    updateScroll();
    window.addEventListener('scroll', updateScroll, { passive: true });
    window.addEventListener('resize', updateScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', updateScroll);
      window.removeEventListener('resize', updateScroll);
    };
  }, [view, article?.id]);

  // ABOUT ME / RESUME VIEW
  if (view === 'about') {
    return (
      <article className="glass-card-reading rounded-2xl p-6 sm:p-8 space-y-6" data-rain-ledge>
        {/* Resume Header Card */}
        <header className="pb-6 border-b border-zinc-200/70 dark:border-white/10">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <AuthorAvatar
                avatarUrl={settings.authorAvatar}
                authorName={settings.authorName}
                className="h-16 w-16 rounded-2xl font-bold text-2xl shadow-md"
              />
              <div>
                <div className="flex items-center gap-2.5">
                  <h1 className="text-2xl sm:text-[26px] font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
                    {settings.authorName}
                  </h1>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20">
                    <Briefcase className="w-3.5 h-3.5" />
                    个人简历
                  </span>
                </div>
                <p className="mt-1.5 text-sm sm:text-[15px] text-zinc-600 dark:text-zinc-300">
                  {settings.authorBio}
                </p>
              </div>
            </div>

            {isAdmin && onOpenResumeSettings && (
              <button
                type="button"
                onClick={onOpenResumeSettings}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium bg-zinc-900/90 text-white hover:bg-zinc-900 dark:bg-white/90 dark:text-zinc-900 transition-colors"
              >
                <Edit3 className="w-4 h-4" />
                <span>编辑简历</span>
              </button>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/60 dark:bg-white/5 border border-white/70 dark:border-white/10">
              <MapPin className="w-4 h-4 text-indigo-500" />
              {settings.authorLocation}
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/60 dark:bg-white/5 border border-white/70 dark:border-white/10">
              <Mail className="w-4 h-4 text-indigo-500" />
              {settings.authorEmail}
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/60 dark:bg-white/5 border border-white/70 dark:border-white/10 font-mono text-xs">
              {settings.authorHandle}
            </span>
          </div>
        </header>

        <MarkdownBody html={renderMarkdown(settings.aboutContent)} />
      </article>
    );
  }

  // ARCHIVE VIEW
  if (view === 'archive') {
    const chronoArticles = [...archiveArticles].sort((a, b) =>
      b.publishedAt.localeCompare(a.publishedAt),
    );
    const grouped = new Map<string, Article[]>();
    chronoArticles.forEach((art) => {
      const ym = getMonthKey(art.publishedAt);
      const list = grouped.get(ym) || [];
      list.push(art);
      grouped.set(ym, list);
    });

    return (
      <div className="space-y-4">
        <div className="glass-card rounded-2xl p-5 sm:p-6" data-rain-ledge>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">时间归档</h1>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                按文章设定的发布时间倒序排列（共 {archiveTotal} 篇）
              </p>
            </div>
            {hasFilters && (
              <button
                type="button"
                onClick={onClearAllFilters}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-white/70 hover:bg-white dark:bg-white/10 dark:hover:bg-white/20 text-zinc-700 dark:text-zinc-200"
              >
                <X className="w-4 h-4" />
                <span>清除筛选</span>
              </button>
            )}
          </div>
        </div>

        {archiveError && <ErrorCard message={archiveError} />}

        {archiveLoading && grouped.size === 0 ? (
          <LoadingCard text="正在加载归档…" />
        ) : grouped.size === 0 ? (
          <div className="glass-card rounded-2xl p-10 text-center text-base text-zinc-500">
            没有符合当前筛选条件的归档文章
          </div>
        ) : (
          Array.from(grouped.entries()).map(([ym, list]) => (
            <section key={ym} className="glass-card rounded-2xl p-5 sm:p-6">
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-zinc-200/60 dark:border-white/10">
                <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                  {getYearMonthLabel(ym)}
                </h2>
                <span className="text-sm text-zinc-500 dark:text-zinc-400 tabular-nums">{list.length} 篇</span>
              </div>
              <ul className="divide-y divide-zinc-200/50 dark:divide-white/10">
                {list.map((art) => {
                  const cat = art.categoryId ? categoryMap.get(art.categoryId) : undefined;
                  return (
                    <li key={art.id} className="py-3.5 first:pt-1 last:pb-1">
                      <button
                        type="button"
                        onClick={() => onOpenArticle(art.id)}
                        className="w-full text-left flex flex-col sm:flex-row sm:items-center justify-between gap-2 group"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {cat && (
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: cat.dotColor }}
                            />
                          )}
                          <span className="text-[15px] font-medium text-zinc-800 group-hover:text-indigo-600 dark:text-zinc-200 dark:group-hover:text-indigo-400 truncate transition-colors">
                            {art.title}
                          </span>
                        </div>
                        <span className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 tabular-nums shrink-0 pl-5 sm:pl-0">
                          {formatDateTimeLabel(art.publishedAt)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </div>
    );
  }

  // SINGLE ARTICLE READER VIEW
  if (view === 'article') {
    if (articleLoading) {
      return <LoadingCard text="正在加载文章…" />;
    }

    if (articleError || !article) {
      return (
        <div className="glass-card rounded-2xl p-8 text-center">
          <p className="text-base text-zinc-500 dark:text-zinc-400">
            {articleError || '文章不存在或已被删除'}
          </p>
          <button
            type="button"
            onClick={onBackHome}
            className="mt-3 text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            返回文章列表
          </button>
        </div>
      );
    }

    const cat = article.categoryId ? categoryMap.get(article.categoryId) : undefined;
    const prevArticle = article.prev;
    const nextArticle = article.next;
    const stats = estimateReadingStats(article.content);

    return (
      <div className="space-y-4">
        {/* Top Reading Progress Bar */}
        <div
          aria-hidden="true"
          className="fixed top-0 left-0 right-0 z-40 h-[3px] bg-transparent pointer-events-none"
        >
          <div
            className="h-full bg-gradient-to-r from-indigo-500 via-sky-500 to-cyan-400 transition-[width] duration-75"
            style={{ width: `${readProgress}%` }}
          />
        </div>

        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onBackHome}
            className="glass-card inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-zinc-700 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>返回文章列表</span>
          </button>

          {isAdmin && (
            <button
              type="button"
              onClick={() => onEditArticleInAdmin(article.id)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-zinc-900/90 text-white hover:bg-zinc-900 dark:bg-white/90 dark:text-zinc-900 transition-colors shadow-sm"
            >
              <Edit3 className="w-4 h-4" />
              <span>编辑此文章</span>
            </button>
          )}
        </div>

        <article className="glass-card-reading rounded-2xl p-6 sm:p-8 lg:p-9" data-rain-ledge>
          <header className="pb-6 mb-6 border-b border-zinc-200/70 dark:border-white/10">
            <div className="flex flex-wrap items-center gap-2.5 text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mb-3.5">
              {article.pinned && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-amber-500/15 text-amber-700 border border-amber-500/25 dark:text-amber-300 text-xs font-medium">
                  <Pin className="w-3.5 h-3.5" />
                  置顶
                </span>
              )}
              {cat && (
                <button
                  type="button"
                  onClick={() => {
                    onBackHome();
                    onSelectCategory(cat.id);
                  }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-white/70 dark:bg-white/10 text-zinc-700 dark:text-zinc-200 hover:bg-white dark:hover:bg-white/20 transition-colors"
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: cat.dotColor }}
                  />
                  <span>{cat.name}</span>
                </button>
              )}
              <span className="inline-flex items-center gap-1.5 tabular-nums text-zinc-600 dark:text-zinc-300">
                <Calendar className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
                {formatDateTimeLabel(article.publishedAt)}
              </span>
              <span className="inline-flex items-center gap-1.5 tabular-nums text-zinc-500 dark:text-zinc-400">
                <BookOpen className="w-3.5 h-3.5" />
                约 {stats.minutes} 分钟读完 · {stats.wordCount.toLocaleString()} 字
              </span>
            </div>

            <h1 className="text-2xl sm:text-[28px] font-bold tracking-tight text-zinc-900 dark:text-zinc-50 leading-snug">
              {article.title}
            </h1>

            {article.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-4">
                {article.tags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => {
                      onBackHome();
                      onSelectTag(tag);
                    }}
                    className="px-2.5 py-1 rounded-lg text-xs bg-white/60 text-zinc-700 border border-white/70 hover:bg-white dark:bg-white/5 dark:text-zinc-300 dark:border-white/10 dark:hover:bg-white/15"
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            )}
          </header>

          <MarkdownBody html={renderMarkdown(article.content)} />
        </article>

        {/* Floating Back to Top Button */}
        {showBackToTop && (
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            title="回到顶部"
            aria-label="回到顶部"
            className="glass-card-interactive fixed bottom-20 lg:bottom-8 right-5 z-30 p-3 rounded-full text-zinc-700 dark:text-zinc-200 shadow-lg"
          >
            <ArrowUp className="w-4 h-4" />
          </button>
        )}

        {/* Prev / Next Navigation (clean, no comments!) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {prevArticle ? (
            <button
              type="button"
              onClick={() => onOpenArticle(prevArticle.id)}
              className="glass-card-interactive rounded-2xl p-4.5 text-left"
            >
              <span className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-1">
                <ChevronLeft className="w-4 h-4" />
                上一篇
              </span>
              <p className="mt-1 text-sm font-semibold text-zinc-800 dark:text-zinc-200 line-clamp-1">
                {prevArticle.title}
              </p>
            </button>
          ) : (
            <div />
          )}

          {nextArticle && (
            <button
              type="button"
              onClick={() => onOpenArticle(nextArticle.id)}
              className="glass-card-interactive rounded-2xl p-4.5 text-right"
            >
              <span className="text-xs text-zinc-500 dark:text-zinc-400 inline-flex items-center gap-1 justify-end">
                下一篇
                <ChevronRight className="w-4 h-4" />
              </span>
              <p className="mt-1 text-sm font-semibold text-zinc-800 dark:text-zinc-200 line-clamp-1">
                {nextArticle.title}
              </p>
            </button>
          )}
        </div>
      </div>
    );
  }

  // HOME ARTICLE LIST VIEW
  return (
    <div className="space-y-4">
      {/* Header Banner */}
      <div className="glass-card rounded-2xl px-6 py-5 flex flex-wrap items-center justify-between gap-3" data-rain-ledge>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
            {settings.blogTitle}
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-200/85 mt-1">
            {settings.blogSubtitle}
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs sm:text-sm text-zinc-600 dark:text-zinc-100 px-3.5 py-1.5 rounded-full bg-white/60 dark:bg-white/15 border border-white/75 dark:border-white/25">
          <span>共 {total} 篇文章</span>
        </div>
      </div>

      {/* Active Filter Chips */}
      {hasFilters && (
        <div className="flex flex-wrap items-center gap-2 px-1">
          <span className="text-sm text-zinc-500 dark:text-zinc-400">当前筛选：</span>
          {selectedCategoryId && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs sm:text-sm bg-zinc-900/90 text-white dark:bg-white/90 dark:text-zinc-900 shadow-xs">
              分类：{categoryMap.get(selectedCategoryId)?.name}
              <button type="button" onClick={() => onSelectCategory(null)}>
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          )}
          {selectedTag && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs sm:text-sm bg-zinc-900/90 text-white dark:bg-white/90 dark:text-zinc-900 shadow-xs">
              #{selectedTag}
              <button type="button" onClick={() => onSelectTag(null)}>
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          )}
          {searchQuery && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs sm:text-sm bg-white/80 dark:bg-white/10 text-zinc-800 dark:text-zinc-200 border border-white/70 dark:border-white/10">
              关键词：{searchQuery}
            </span>
          )}
          <button
            type="button"
            onClick={onClearAllFilters}
            className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 underline ml-1"
          >
            重置全部
          </button>
        </div>
      )}

      {feedError && <ErrorCard message={feedError} />}

      {/* Article Cards */}
      {feedLoading && visibleArticles.length === 0 ? (
        <LoadingCard text="正在加载文章…" />
      ) : visibleArticles.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center">
          <p className="text-base text-zinc-500 dark:text-zinc-400">暂无符合条件的文章</p>
          {hasFilters && (
            <button
              type="button"
              onClick={onClearAllFilters}
              className="mt-4 px-4 py-2 rounded-xl text-sm font-medium bg-zinc-900/90 text-white dark:bg-white/90 dark:text-zinc-900"
            >
              查看全部文章
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {visibleArticles.map((art) => {
            const cat = art.categoryId ? categoryMap.get(art.categoryId) : undefined;
            return (
              <article
                key={art.id}
                onClick={() => onOpenArticle(art.id)}
                className="glass-card-interactive group cursor-pointer rounded-2xl p-5 sm:p-6"
              >
                <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-zinc-600 dark:text-zinc-200/85 mb-2.5">
                  {art.pinned && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-800 border border-amber-500/35 dark:bg-amber-400/20 dark:text-amber-200 dark:border-amber-300/35 text-xs font-medium">
                      <Pin className="w-3.5 h-3.5" />
                      置顶
                    </span>
                  )}
                  {cat && (
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectCategory(cat.id);
                      }}
                      className="inline-flex items-center gap-1.5 hover:text-zinc-950 dark:hover:text-white"
                    >
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: cat.dotColor }}
                      />
                      <span>{cat.name}</span>
                    </span>
                  )}
                  <span className="text-zinc-500 dark:text-white/40">·</span>
                  <time className="tabular-nums">{formatDateTimeLabel(art.publishedAt)}</time>
                </div>

                <h2 className="text-lg sm:text-[20px] font-semibold text-zinc-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-cyan-200 transition-colors leading-snug">
                  {art.title}
                </h2>

                <p className="mt-2 text-sm sm:text-[15px] leading-relaxed text-zinc-700 dark:text-zinc-100/85 line-clamp-2">
                  {art.excerpt}
                </p>

                {art.tags.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {art.tags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectTag(tag);
                        }}
                        className="px-3 py-1 rounded-full text-xs font-medium bg-white/70 text-zinc-800 border border-white/80 hover:bg-white dark:bg-white/15 dark:text-white dark:border-white/25 dark:hover:bg-white/25 transition-colors"
                      >
                        #{tag}
                      </button>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {/* Pagination: load next page and append */}
      {hasMore && (
        <div className="pt-1 flex flex-col items-center gap-2">
          <button
            type="button"
            disabled={feedLoadingMore}
            onClick={onLoadMore}
            className="glass-card px-5 py-2.5 rounded-xl text-sm font-medium text-zinc-700 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {feedLoadingMore ? '正在加载更多…' : '加载更多文章'}
          </button>
          <span className="text-xs text-zinc-600 dark:text-zinc-400 tabular-nums">
            已显示 {visibleArticles.length} / {total} 篇
          </span>
        </div>
      )}
    </div>
  );
};
