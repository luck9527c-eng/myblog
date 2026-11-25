import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import * as api from './api/endpoints';
import { ApiError, getErrorMessage, setUnauthorizedHandler } from './api/client';
import { AdminDashboard } from './components/AdminDashboard';
import { ArticleFeed } from './components/ArticleFeed';
import { ConfirmModal } from './components/ConfirmModal';
import { DiaryView } from './components/DiaryView';
import { LeftSidebar } from './components/LeftSidebar';
import { LoginModal } from './components/LoginModal';
import { MobileBottomNav, MobileDrawer, MobileTopBar } from './components/MobileNav';
import { RightSidebar } from './components/RightSidebar';

const RainBackground = lazy(() => import('./components/RainBackground'));
import type {
  AdminTab,
  AppView,
  ArchiveItem,
  Article,
  ArticleDetail,
  ArticleDraft,
  BlogDataState,
  Category,
  CategoryInput,
  DiaryDraft,
  DiaryEntry,
  SiteSettings,
  SiteSettingsInput,
  TagStat,
  ThemeMode,
} from './types';
import { extractHeadings } from './utils/markdown';

/** 仅主题偏好与氛围开关保留在 localStorage（内容数据全部来自后端） */
const STORAGE_KEY_THEME = 'blog_gemini_proto_theme_v1';
const STORAGE_KEY_RAIN = 'blog_gemini_proto_rain_v1';
const FEED_PAGE_SIZE = 50;

/** bootstrap 未到达前的占位站点配置，保证首屏不白屏 */
const INITIAL_SETTINGS: SiteSettings = {
  blogTitle: '个人博客',
  blogSubtitle: '',
  authorName: '',
  authorHandle: '',
  authorBio: '',
  authorLocation: '',
  authorEmail: '',
  aboutContent: '',
  updatedAt: '',
};

function loadInitialTheme(): ThemeMode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_THEME);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch {
    // ignore
  }
  return 'light';
}

function loadInitialRain(): boolean {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_RAIN);
    if (saved === 'true') return true;
    if (saved === 'false') return false;
  } catch {
    // ignore
  }
  if (typeof window !== 'undefined' && window.matchMedia) {
    return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  return true;
}

/** 归档接口只返回精简字段，这里补成 ArticleFeed 可消费的形状 */
function archiveItemToArticle(item: ArchiveItem): Article {
  return {
    id: item.id,
    title: item.title,
    excerpt: '',
    content: '',
    categoryId: item.categoryId,
    tags: [],
    publishedAt: item.publishedAt,
    status: 'published',
    pinned: item.pinned,
    createdAt: item.publishedAt,
    updatedAt: item.publishedAt,
  };
}

export function App() {
  const [theme, setTheme] = useState<ThemeMode>(loadInitialTheme);
  const [rainEnabled, setRainEnabled] = useState<boolean>(loadInitialRain);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [pendingNavAction, setPendingNavAction] = useState<(() => void) | null>(null);
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null);

  // 启动 / 降级提示
  const [booting, setBooting] = useState(true);
  const [bootAttempt, setBootAttempt] = useState(0);
  const [bootError, setBootError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // 站点元数据（bootstrap）
  const [settings, setSettings] = useState<SiteSettings>(INITIAL_SETTINGS);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tagStats, setTagStats] = useState<TagStat[]>([]);
  const [publishedCount, setPublishedCount] = useState(0);

  // 公开文章列表（服务端筛选 + 分页）
  const [feed, setFeed] = useState<{ items: Article[]; total: number; page: number }>({
    items: [],
    total: 0,
    page: 1,
  });
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedLoadingMore, setFeedLoadingMore] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);

  // 归档
  const [archiveItems, setArchiveItems] = useState<ArchiveItem[]>([]);
  const [archiveTotal, setArchiveTotal] = useState(0);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  // 单篇详情
  const [articleDetail, setArticleDetail] = useState<ArticleDetail | null>(null);
  const [articleLoading, setArticleLoading] = useState(false);
  const [articleError, setArticleError] = useState<string | null>(null);

  // 管理员数据（后台全量，含草稿）
  const [adminArticles, setAdminArticles] = useState<Article[]>([]);
  const [adminDiaries, setAdminDiaries] = useState<DiaryEntry[]>([]);

  const [currentView, setCurrentView] = useState<AppView>('home');
  const [activeArticleId, setActiveArticleId] = useState<string | null>(null);
  const [adminEditArticleId, setAdminEditArticleId] = useState<string | null>(null);
  const [adminInitialTab, setAdminInitialTab] = useState<AdminTab | null>(null);

  // Shared RightSidebar Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // Mobile Drawers
  const [leftDrawerOpen, setLeftDrawerOpen] = useState(false);
  const [rightDrawerOpen, setRightDrawerOpen] = useState(false);

  // 主题：仅此一项写 localStorage
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem(STORAGE_KEY_THEME, theme);
    } catch {
      // ignore
    }
  }, [theme]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_RAIN, String(rainEnabled));
    } catch {
      // ignore
    }
  }, [rainEnabled]);

  // 站点标题
  useEffect(() => {
    document.title = settings.blogTitle || '个人博客';
  }, [settings.blogTitle]);

  // 搜索防抖 250ms，避免每次按键都打后端
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // 任意接口 401 → 退出管理员态并提示登录过期
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setIsAdmin(false);
      setAdminArticles([]);
      setAdminDiaries([]);
      setCurrentView((view) => (view === 'admin' || view === 'diary' ? 'home' : view));
      setNotice('登录已过期，请重新登录管理员账号');
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  const refreshBootstrap = async () => {
    const bootstrap = await api.fetchBootstrap();
    setSettings(bootstrap.settings);
    setCategories(bootstrap.categories);
    setTagStats(bootstrap.tags);
    setPublishedCount(bootstrap.meta.articleCount);
  };

  const feedSeq = useRef(0);
  const fetchFeedPage = useCallback(
    async (page: number, append: boolean): Promise<void> => {
      const seq = ++feedSeq.current;
      if (append) setFeedLoadingMore(true);
      else setFeedLoading(true);
      setFeedError(null);
      try {
        const result = await api.listArticles({
          q: debouncedSearch.trim() || undefined,
          categoryId: selectedCategoryId,
          tag: selectedTag,
          page,
          pageSize: FEED_PAGE_SIZE,
        });
        if (seq !== feedSeq.current) return;
        setFeed((prev) => ({
          items: append ? [...prev.items, ...result.items] : result.items,
          total: result.total,
          page: result.page,
        }));
      } catch (err) {
        if (seq !== feedSeq.current) return;
        setFeedError(getErrorMessage(err, '文章列表加载失败'));
        if (!append) setFeed({ items: [], total: 0, page: 1 });
      } finally {
        if (seq === feedSeq.current) {
          setFeedLoading(false);
          setFeedLoadingMore(false);
        }
      }
    },
    [debouncedSearch, selectedCategoryId, selectedTag],
  );

  const archiveSeq = useRef(0);
  const reloadArchive = useCallback(async (): Promise<void> => {
    const seq = ++archiveSeq.current;
    setArchiveLoading(true);
    setArchiveError(null);
    try {
      const result = await api.listArchive({
        q: debouncedSearch.trim() || undefined,
        categoryId: selectedCategoryId,
        tag: selectedTag,
      });
      if (seq !== archiveSeq.current) return;
      setArchiveItems(result.items);
      setArchiveTotal(result.total);
    } catch (err) {
      if (seq !== archiveSeq.current) return;
      setArchiveError(getErrorMessage(err, '归档加载失败'));
      setArchiveItems([]);
      setArchiveTotal(0);
    } finally {
      if (seq === archiveSeq.current) setArchiveLoading(false);
    }
  }, [debouncedSearch, selectedCategoryId, selectedTag]);

  const reloadAdminArticles = useCallback(async (): Promise<void> => {
    const result = await api.adminListArticles();
    setAdminArticles(result.items);
  }, []);

  const reloadAdminDiaries = useCallback(async (): Promise<void> => {
    const result = await api.adminListDiaries();
    setAdminDiaries(result.items);
  }, []);

  // 启动：并发 GET /api/auth/me + /api/public/bootstrap（首页列表由下面的 effect 同时发起）
  useEffect(() => {
    let cancelled = false;
    setBooting(true);
    setBootError(null);
    const load = async () => {
      const [meResult, bootResult] = await Promise.allSettled([
        api.fetchMe(),
        api.fetchBootstrap(),
      ]);
      if (cancelled) return;
      if (meResult.status === 'fulfilled') {
        setIsAdmin(meResult.value.isAdmin);
      } else {
        setNotice(`登录状态检查失败：${getErrorMessage(meResult.reason)}`);
      }
      if (bootResult.status === 'fulfilled') {
        const bootstrap = bootResult.value;
        setSettings(bootstrap.settings);
        setCategories(bootstrap.categories);
        setTagStats(bootstrap.tags);
        setPublishedCount(bootstrap.meta.articleCount);
      } else {
        setBootError(getErrorMessage(bootResult.reason, '站点数据加载失败'));
      }
      setBooting(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [bootAttempt]);

  const isPublicView = currentView !== 'diary' && currentView !== 'admin';

  // 筛选条件变化（防抖后）→ 服务端重新筛选并重置到第 1 页
  useEffect(() => {
    if (!isPublicView) return;
    void fetchFeedPage(1, false);
  }, [fetchFeedPage, isPublicView]);

  // 归档视图：进入或筛选变化时重新拉取
  useEffect(() => {
    if (currentView !== 'archive') return;
    void reloadArchive();
  }, [currentView, reloadArchive]);

  // 单篇详情：优先用已加载列表，找不到再 GET /api/articles/{id}
  useEffect(() => {
    if (currentView !== 'article' || !activeArticleId) {
      setArticleDetail(null);
      setArticleError(null);
      setArticleLoading(false);
      return;
    }
    const id = activeArticleId;
    const cachedIndex = feed.items.findIndex((item) => item.id === id);
    if (cachedIndex >= 0) {
      const cached = feed.items[cachedIndex];
      const prevArticle = cachedIndex > 0 ? feed.items[cachedIndex - 1] : null;
      const nextArticle =
        cachedIndex < feed.items.length - 1 ? feed.items[cachedIndex + 1] : null;
      setArticleDetail({
        ...cached,
        prev: prevArticle ? { id: prevArticle.id, title: prevArticle.title } : null,
        next: nextArticle ? { id: nextArticle.id, title: nextArticle.title } : null,
      });
      setArticleError(null);
      setArticleLoading(false);
      return;
    }

    let cancelled = false;
    const load = async () => {
      setArticleLoading(true);
      setArticleError(null);
      try {
        const detail = await api.getArticle(id);
        if (cancelled) return;
        setArticleDetail(detail);
      } catch (err) {
        if (cancelled) return;
        setArticleDetail(null);
        if (err instanceof ApiError && err.status === 404) {
          setArticleError('文章不存在或已被删除');
        } else {
          setArticleError(getErrorMessage(err, '文章加载失败'));
        }
      } finally {
        if (!cancelled) setArticleLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [currentView, activeArticleId, feed.items]);

  // 登录后按需加载后台数据
  useEffect(() => {
    if (!isAdmin) {
      setAdminArticles([]);
      setAdminDiaries([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      const [articlesResult, diariesResult] = await Promise.allSettled([
        api.adminListArticles(),
        api.adminListDiaries(),
      ]);
      if (cancelled) return;
      const messages: string[] = [];
      if (articlesResult.status === 'fulfilled') {
        setAdminArticles(articlesResult.value.items);
      } else {
        messages.push(`后台文章加载失败：${getErrorMessage(articlesResult.reason)}`);
      }
      if (diariesResult.status === 'fulfilled') {
        setAdminDiaries(diariesResult.value.items);
      } else {
        messages.push(`日记加载失败：${getErrorMessage(diariesResult.reason)}`);
      }
      if (messages.length > 0) setNotice(messages.join('；'));
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  // Guard admin-only routes
  const effectiveView: AppView =
    !isAdmin && (currentView === 'diary' || currentView === 'admin') ? 'home' : currentView;

  const tocHeadings = useMemo(() => {
    if (effectiveView !== 'article' || !articleDetail) return [];
    return extractHeadings(articleDetail.content);
  }, [effectiveView, articleDetail]);

  // 阅读长文时，右侧「文章目录」随滚动位置自动高亮当前章节
  useEffect(() => {
    if (effectiveView !== 'article' || tocHeadings.length === 0) {
      setActiveHeadingId(null);
      return;
    }

    const updateActiveHeading = () => {
      const offset = 120;
      let current: string | null = tocHeadings[0]?.id ?? null;
      for (const h of tocHeadings) {
        const el = document.getElementById(h.id);
        if (!el) continue;
        if (el.getBoundingClientRect().top <= offset) {
          current = h.id;
        } else {
          break;
        }
      }
      setActiveHeadingId(current);
    };

    updateActiveHeading();
    window.addEventListener('scroll', updateActiveHeading, { passive: true });
    return () => window.removeEventListener('scroll', updateActiveHeading);
  }, [effectiveView, tocHeadings]);

  const runWithUnsavedGuard = (action: () => void) => {
    if (!hasUnsavedChanges) {
      action();
      return;
    }
    setPendingNavAction(() => action);
  };

  const archiveArticles = useMemo(() => archiveItems.map(archiveItemToArticle), [archiveItems]);

  const adminData: BlogDataState = useMemo(
    () => ({ articles: adminArticles, diaries: adminDiaries, categories, settings }),
    [adminArticles, adminDiaries, categories, settings],
  );

  const handleNavigate = (view: AppView) => {
    if (!isAdmin && (view === 'diary' || view === 'admin')) {
      setLoginModalOpen(true);
      return;
    }
    if (view === effectiveView) return;
    runWithUnsavedGuard(() => {
      // Reset cross-view conflicting filters when entering diary vs public pages
      if ((view === 'diary') !== (effectiveView === 'diary')) {
        setSearchQuery('');
        setSelectedTag(null);
      }
      setCurrentView(view);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  };

  const handleOpenArticle = (id: string) => {
    runWithUnsavedGuard(() => {
      setActiveArticleId(id);
      setCurrentView('article');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  };

  const clearAllFilters = () => {
    setSearchQuery('');
    setSelectedCategoryId(null);
    setSelectedTag(null);
  };

  const handleLogin = async (password: string): Promise<void> => {
    const result = await api.login(password);
    if (!result.isAdmin) {
      throw new Error('登录失败，请稍后重试');
    }
    setNotice(null);
    setIsAdmin(true);
    setLoginModalOpen(false);
  };

  const handleLogout = async (): Promise<void> => {
    const performLogout = async () => {
      try {
        await api.logout();
      } catch (err) {
        setNotice(`退出登录请求失败：${getErrorMessage(err)}`);
      } finally {
        setHasUnsavedChanges(false);
        setIsAdmin(false);
        setAdminArticles([]);
        setAdminDiaries([]);
        setCurrentView((view) => (view === 'admin' || view === 'diary' ? 'home' : view));
      }
    };
    runWithUnsavedGuard(() => {
      void performLogout();
    });
  };

  // 写操作成功后的统一刷新：bootstrap 计数 + 公开列表 + 归档 +（可选）后台文章列表
  const refreshViews = async (withAdminArticles = false): Promise<void> => {
    const tasks: Array<Promise<unknown>> = [
      refreshBootstrap(),
      fetchFeedPage(1, false),
      reloadArchive(),
    ];
    if (withAdminArticles) tasks.push(reloadAdminArticles());
    await Promise.all(tasks);
  };

  const handleSaveArticle = async (draft: ArticleDraft): Promise<void> => {
    const { id, ...input } = draft;
    if (id) {
      await api.updateArticle(id, input);
    } else {
      await api.createArticle(input);
    }
    await refreshViews(true);
  };

  const handleDeleteArticle = async (id: string): Promise<void> => {
    await api.deleteArticle(id);
    if (activeArticleId === id) {
      setActiveArticleId(null);
      setCurrentView((view) => (view === 'article' ? 'home' : view));
    }
    await refreshViews(true);
  };

  const handleTogglePin = async (id: string): Promise<void> => {
    await api.togglePin(id);
    await refreshViews(true);
  };

  const handleSaveDiary = async (draft: DiaryDraft): Promise<void> => {
    const { id, ...input } = draft;
    if (id) {
      await api.updateDiary(id, input);
    } else {
      await api.createDiary(input);
    }
    await reloadAdminDiaries();
  };

  const handleDeleteDiary = async (id: string): Promise<void> => {
    await api.deleteDiary(id);
    await reloadAdminDiaries();
  };

  const handleCreateCategory = async (input: CategoryInput): Promise<void> => {
    await api.createCategory(input);
    await refreshViews(true);
  };

  const handleDeleteCategory = async (id: string): Promise<void> => {
    await api.deleteCategory(id);
    await refreshViews(true);
  };

  const handleRenameTagGlobal = async (oldTag: string, newTag: string): Promise<void> => {
    await api.renameTag(oldTag, newTag);
    await refreshViews(true);
  };

  const handleDeleteTagGlobal = async (tag: string): Promise<void> => {
    await api.deleteTag(tag);
    await refreshViews(true);
  };

  const handleSaveSettings = async (input: SiteSettingsInput): Promise<void> => {
    await api.updateSettings(input);
    await refreshBootstrap();
  };

  const handleChangePassword = async (
    oldPassword: string,
    newPassword: string,
  ): Promise<void> => {
    await api.changePassword(oldPassword, newPassword);
    await refreshBootstrap();
  };

  const hasActiveFilter = Boolean(searchQuery || selectedCategoryId || selectedTag);
  const searchPending = searchQuery !== debouncedSearch;

  const leftSidebarNode = (onClose?: () => void) => (
    <LeftSidebar
      settings={settings}
      currentView={effectiveView}
      onNavigate={handleNavigate}
      isAdmin={isAdmin}
      onOpenLogin={() => setLoginModalOpen(true)}
      onLogout={handleLogout}
      theme={theme}
      onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
      rainEnabled={rainEnabled}
      onToggleRain={() => setRainEnabled((r) => !r)}
      publishedCount={publishedCount}
      diaryCount={adminDiaries.length}
      onCloseMobileDrawer={onClose}
    />
  );

  const rightSidebarNode = (onClose?: () => void) => (
    <RightSidebar
      currentView={effectiveView}
      searchQuery={searchQuery}
      onSearchChange={(q) => {
        setSearchQuery(q);
        if (effectiveView === 'article' || effectiveView === 'about') {
          setCurrentView('home');
        }
      }}
      selectedCategoryId={selectedCategoryId}
      onSelectCategory={(id) => {
        setSelectedCategoryId(id);
        if (effectiveView !== 'home' && effectiveView !== 'archive') {
          setCurrentView('home');
        }
      }}
      selectedTag={selectedTag}
      onSelectTag={(tag) => {
        setSelectedTag(tag);
        if (effectiveView !== 'home' && effectiveView !== 'archive' && effectiveView !== 'diary') {
          setCurrentView('home');
        }
      }}
      categories={categories}
      publishedArticles={feed.items}
      tagStats={tagStats}
      diaries={adminDiaries}
      isAdmin={isAdmin}
      tocHeadings={tocHeadings}
      activeHeadingId={activeHeadingId}
      onOpenArticle={handleOpenArticle}
      onCloseMobileDrawer={onClose}
    />
  );

  return (
    <div className="relative min-h-[var(--app-vh)] flex flex-col">
      {/* Ambient Mesh Gradient Backdrop for Frosted Glass Refraction */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none" aria-hidden="true">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-100 via-indigo-50/70 to-sky-100/80 dark:from-[#07090f] dark:via-[#0b1020] dark:to-[#0d0b1a]" />
        <div className="absolute -top-32 -left-24 w-[480px] h-[480px] rounded-full bg-indigo-300/35 dark:bg-indigo-600/20 blur-[110px]" />
        <div className="absolute top-1/4 -right-24 w-[440px] h-[440px] rounded-full bg-sky-300/35 dark:bg-cyan-500/15 blur-[110px]" />
        <div className="absolute -bottom-32 left-1/3 w-[520px] h-[520px] rounded-full bg-rose-200/35 dark:bg-purple-600/15 blur-[120px]" />
      </div>

      {/* Lazy-Loaded Three.js 3D Depth Rain + Bokeh Ambience */}
      {rainEnabled && (
        <Suspense fallback={null}>
          <RainBackground theme={theme} />
        </Suspense>
      )}

      {/* Mobile Header */}
      <MobileTopBar
        blogTitle={settings.blogTitle}
        isAdmin={isAdmin}
        onOpenLeftDrawer={() => setLeftDrawerOpen(true)}
        onOpenRightDrawer={() => setRightDrawerOpen(true)}
        hasActiveFilter={hasActiveFilter}
      />

      {/* Desktop 3-Column Container */}
      <div className="flex-1 w-full max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 pt-5 pb-24 lg:py-8">
        {/* 后端连接状态 / 降级提示（不白屏） */}
        {booting && (
          <div className="mb-4 glass-card rounded-2xl px-4 py-3 flex items-center gap-2.5 text-sm text-zinc-500 dark:text-zinc-400">
            <span className="w-3.5 h-3.5 rounded-full border-2 border-zinc-300 border-t-transparent animate-spin dark:border-zinc-600 dark:border-t-transparent" />
            <span>正在连接后端，加载站点数据…</span>
          </div>
        )}
        {bootError && (
          <div className="mb-4 glass-card rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-sm text-rose-600 dark:text-rose-400">
            <span className="min-w-0 break-words">
              站点数据加载失败：{bootError}（当前展示降级视图）
            </span>
            <button
              type="button"
              onClick={() => setBootAttempt((n) => n + 1)}
              className="shrink-0 px-3 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 font-medium"
            >
              重试
            </button>
          </div>
        )}
        {notice && (
          <div className="mb-4 glass-card rounded-2xl px-4 py-3 flex items-center justify-between gap-3 text-sm text-amber-700 dark:text-amber-300">
            <span className="min-w-0 break-words">{notice}</span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="shrink-0 p-1 rounded-lg hover:bg-amber-500/15"
              aria-label="关闭提示"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div
          className={`grid grid-cols-1 gap-6 xl:gap-8 ${
            effectiveView === 'admin'
              ? 'lg:grid-cols-[264px_minmax(0,1fr)] xl:grid-cols-[288px_minmax(0,1fr)]'
              : 'lg:grid-cols-[264px_minmax(0,1fr)_280px] xl:grid-cols-[288px_minmax(0,1fr)_312px]'
          }`}
        >
          {/* Left Column (Desktop Sticky) */}
          <aside className="hidden lg:block">
            <div className="sticky top-6 h-[calc(var(--app-vh)-3rem)]">{leftSidebarNode()}</div>
          </aside>

          {/* Center Main Column */}
          <main className="min-w-0">
            {effectiveView === 'admin' && isAdmin ? (
              <AdminDashboard
                data={adminData}
                initialTab={adminInitialTab}
                onClearInitialTab={() => setAdminInitialTab(null)}
                initialEditArticleId={adminEditArticleId}
                onClearInitialEditArticle={() => setAdminEditArticleId(null)}
                onSaveArticle={handleSaveArticle}
                onDeleteArticle={handleDeleteArticle}
                onTogglePin={handleTogglePin}
                onSaveDiary={handleSaveDiary}
                onDeleteDiary={handleDeleteDiary}
                onCreateCategory={handleCreateCategory}
                onDeleteCategory={handleDeleteCategory}
                onRenameTagGlobal={handleRenameTagGlobal}
                onDeleteTagGlobal={handleDeleteTagGlobal}
                onSaveSettings={handleSaveSettings}
                onChangePassword={handleChangePassword}
                onPreviewArticle={handleOpenArticle}
                onDirtyChange={setHasUnsavedChanges}
              />
            ) : effectiveView === 'diary' && isAdmin ? (
              <DiaryView
                diaries={adminDiaries}
                searchQuery={searchQuery}
                selectedTag={selectedTag}
                onSelectTag={setSelectedTag}
                onClearFilters={clearAllFilters}
                onSaveDiary={handleSaveDiary}
                onDeleteDiary={handleDeleteDiary}
                onDirtyChange={setHasUnsavedChanges}
              />
            ) : (
              <ArticleFeed
                view={
                  effectiveView === 'article' ||
                  effectiveView === 'archive' ||
                  effectiveView === 'about'
                    ? effectiveView
                    : 'home'
                }
                articles={feed.items}
                total={feed.total}
                feedLoading={feedLoading || searchPending}
                feedLoadingMore={feedLoadingMore}
                feedError={feedError}
                hasMore={feed.items.length < feed.total}
                onLoadMore={() => {
                  void fetchFeedPage(feed.page + 1, true);
                }}
                archiveArticles={archiveArticles}
                archiveTotal={archiveTotal}
                archiveLoading={archiveLoading}
                archiveError={archiveError}
                article={articleDetail}
                articleLoading={articleLoading}
                articleError={articleError}
                categories={categories}
                settings={settings}
                searchQuery={searchQuery}
                selectedCategoryId={selectedCategoryId}
                selectedTag={selectedTag}
                isAdmin={isAdmin}
                onOpenArticle={handleOpenArticle}
                onBackHome={() => setCurrentView('home')}
                onSelectCategory={(id) => {
                  setSelectedCategoryId(id);
                  if (effectiveView === 'article') setCurrentView('home');
                }}
                onSelectTag={(tag) => {
                  setSelectedTag(tag);
                  if (effectiveView === 'article') setCurrentView('home');
                }}
                onClearAllFilters={clearAllFilters}
                onEditArticleInAdmin={(id) => {
                  setAdminEditArticleId(id);
                  setCurrentView('admin');
                }}
                onOpenResumeSettings={() => {
                  setAdminInitialTab('settings');
                  setCurrentView('admin');
                }}
              />
            )}
          </main>

          {/* Right Column (Desktop Sticky - hidden inside Admin Backend to give editor full space) */}
          {effectiveView !== 'admin' && (
            <aside className="hidden lg:block">
              <div className="sticky top-6 max-h-[calc(var(--app-vh)-3rem)] overflow-y-auto pr-0.5">
                {rightSidebarNode()}
              </div>
            </aside>
          )}
        </div>
      </div>

      {/* Mobile Bottom Fixed Navigation */}
      <MobileBottomNav
        currentView={effectiveView}
        isAdmin={isAdmin}
        onNavigate={handleNavigate}
      />

      {/* Mobile Slide-Out Drawers */}
      <MobileDrawer
        isOpen={leftDrawerOpen}
        side="left"
        title="菜单与身份"
        onClose={() => setLeftDrawerOpen(false)}
      >
        {leftSidebarNode(() => setLeftDrawerOpen(false))}
      </MobileDrawer>

      <MobileDrawer
        isOpen={rightDrawerOpen}
        side="right"
        title="搜索与分类筛选"
        onClose={() => setRightDrawerOpen(false)}
      >
        {rightSidebarNode(() => setRightDrawerOpen(false))}
      </MobileDrawer>

      {/* Admin Login Modal */}
      <LoginModal
        isOpen={loginModalOpen}
        onClose={() => setLoginModalOpen(false)}
        onSubmit={handleLogin}
      />

      {/* Navigation Guard Modal for Unsaved Editor Changes */}
      <ConfirmModal
        isOpen={pendingNavAction !== null}
        title="离开当前编辑页？"
        message="当前编辑器有未保存的改动，切换页面将会丢失这些内容。"
        confirmLabel="放弃并离开"
        cancelLabel="留在当前页"
        onConfirm={() => {
          const action = pendingNavAction;
          setPendingNavAction(null);
          setHasUnsavedChanges(false);
          action?.();
        }}
        onCancel={() => setPendingNavAction(null)}
      />
    </div>
  );
}

export default App;
