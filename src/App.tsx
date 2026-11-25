import { useEffect, useMemo, useState } from 'react';
import { AdminDashboard } from './components/AdminDashboard';
import { ArticleFeed } from './components/ArticleFeed';
import { DiaryView } from './components/DiaryView';
import { LeftSidebar } from './components/LeftSidebar';
import { LoginModal } from './components/LoginModal';
import { MobileBottomNav, MobileDrawer, MobileTopBar } from './components/MobileNav';
import { RightSidebar } from './components/RightSidebar';
import { SEED_DATA } from './data/seedData';
import type {
  AdminTab,
  AppView,
  Article,
  BlogDataState,
  Category,
  DiaryEntry,
  SiteSettings,
  ThemeMode,
} from './types';
import { extractHeadings } from './utils/markdown';

const STORAGE_KEY_DATA = 'blog_gemini_proto_data_v2';
const STORAGE_KEY_THEME = 'blog_gemini_proto_theme_v1';

function loadInitialData(): BlogDataState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_DATA);
    if (raw) {
      const parsed = JSON.parse(raw) as BlogDataState;
      if (parsed && Array.isArray(parsed.articles) && Array.isArray(parsed.diaries)) {
        return parsed;
      }
    }
  } catch {
    // Fallback to seed data
  }
  return SEED_DATA;
}

function loadInitialTheme(): ThemeMode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_THEME);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch {
    // ignore
  }
  return 'light';
}

export function App() {
  const [data, setData] = useState<BlogDataState>(loadInitialData);
  const [theme, setTheme] = useState<ThemeMode>(loadInitialTheme);

  // Default opens in Guest/Visitor view (diary & admin hidden until login)
  const [isAdmin, setIsAdmin] = useState(false);
  const [loginModalOpen, setLoginModalOpen] = useState(false);

  const [currentView, setCurrentView] = useState<AppView>('home');
  const [activeArticleId, setActiveArticleId] = useState<string | null>(null);
  const [adminEditArticleId, setAdminEditArticleId] = useState<string | null>(null);
  const [adminInitialTab, setAdminInitialTab] = useState<AdminTab | null>(null);

  // Shared RightSidebar Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // Mobile Drawers
  const [leftDrawerOpen, setLeftDrawerOpen] = useState(false);
  const [rightDrawerOpen, setRightDrawerOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_DATA, JSON.stringify(data));
    } catch {
      // ignore storage quota errors
    }
  }, [data]);

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

  const publishedArticles = useMemo(
    () => data.articles.filter((a) => a.status === 'published'),
    [data.articles],
  );

  // Guard admin-only routes
  const effectiveView: AppView =
    !isAdmin && (currentView === 'diary' || currentView === 'admin') ? 'home' : currentView;

  const activeArticle = useMemo(
    () => publishedArticles.find((a) => a.id === activeArticleId) || null,
    [publishedArticles, activeArticleId],
  );

  const tocHeadings = useMemo(() => {
    if (effectiveView !== 'article' || !activeArticle) return [];
    return extractHeadings(activeArticle.content);
  }, [effectiveView, activeArticle]);

  const handleNavigate = (view: AppView) => {
    if (!isAdmin && (view === 'diary' || view === 'admin')) {
      setLoginModalOpen(true);
      return;
    }
    // Reset cross-view conflicting filters when entering diary vs public pages
    if ((view === 'diary') !== (effectiveView === 'diary')) {
      setSearchQuery('');
      setSelectedTag(null);
    }
    setCurrentView(view);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenArticle = (id: string) => {
    setActiveArticleId(id);
    setCurrentView('article');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const clearAllFilters = () => {
    setSearchQuery('');
    setSelectedCategoryId(null);
    setSelectedTag(null);
  };

  const handleLogout = () => {
    setIsAdmin(false);
    if (currentView === 'diary' || currentView === 'admin') {
      setCurrentView('home');
    }
  };

  // CRUD Handlers
  const handleSaveArticle = (article: Article) => {
    setData((prev) => {
      const exists = prev.articles.some((a) => a.id === article.id);
      return {
        ...prev,
        articles: exists
          ? prev.articles.map((a) => (a.id === article.id ? article : a))
          : [article, ...prev.articles],
      };
    });
  };

  const handleDeleteArticle = (id: string) => {
    setData((prev) => ({
      ...prev,
      articles: prev.articles.filter((a) => a.id !== id),
    }));
    if (activeArticleId === id) {
      setActiveArticleId(null);
      if (currentView === 'article') setCurrentView('home');
    }
  };

  const handleSaveDiary = (entry: DiaryEntry) => {
    setData((prev) => {
      const exists = prev.diaries.some((d) => d.id === entry.id);
      return {
        ...prev,
        diaries: exists
          ? prev.diaries.map((d) => (d.id === entry.id ? entry : d))
          : [entry, ...prev.diaries],
      };
    });
  };

  const handleDeleteDiary = (id: string) => {
    setData((prev) => ({
      ...prev,
      diaries: prev.diaries.filter((d) => d.id !== id),
    }));
  };

  const handleSaveCategories = (categories: Category[]) => {
    setData((prev) => ({ ...prev, categories }));
  };

  const handleRenameTagGlobal = (oldTag: string, newTag: string) => {
    setData((prev) => ({
      ...prev,
      articles: prev.articles.map((a) => ({
        ...a,
        tags: Array.from(new Set(a.tags.map((t) => (t === oldTag ? newTag : t)))),
      })),
    }));
  };

  const handleDeleteTagGlobal = (tag: string) => {
    setData((prev) => ({
      ...prev,
      articles: prev.articles.map((a) => ({
        ...a,
        tags: a.tags.filter((t) => t !== tag),
      })),
    }));
  };

  const handleSaveSettings = (settings: SiteSettings) => {
    setData((prev) => ({ ...prev, settings }));
  };

  const handleResetDemoData = () => {
    setData(SEED_DATA);
    clearAllFilters();
  };

  const hasActiveFilter = Boolean(searchQuery || selectedCategoryId || selectedTag);

  const leftSidebarNode = (onClose?: () => void) => (
    <LeftSidebar
      settings={data.settings}
      currentView={effectiveView}
      onNavigate={handleNavigate}
      isAdmin={isAdmin}
      onOpenLogin={() => setLoginModalOpen(true)}
      onLogout={handleLogout}
      theme={theme}
      onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
      publishedCount={publishedArticles.length}
      diaryCount={data.diaries.length}
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
      categories={data.categories}
      publishedArticles={publishedArticles}
      diaries={data.diaries}
      isAdmin={isAdmin}
      tocHeadings={tocHeadings}
      onOpenArticle={handleOpenArticle}
      onCloseMobileDrawer={onClose}
    />
  );

  return (
    <div className="relative min-h-screen flex flex-col">
      {/* Ambient Mesh Gradient Backdrop for Frosted Glass Refraction */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none" aria-hidden="true">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-100 via-indigo-50/70 to-sky-100/80 dark:from-[#07090f] dark:via-[#0b1020] dark:to-[#0d0b1a]" />
        <div className="absolute -top-32 -left-24 w-[480px] h-[480px] rounded-full bg-indigo-300/35 dark:bg-indigo-600/20 blur-[110px]" />
        <div className="absolute top-1/4 -right-24 w-[440px] h-[440px] rounded-full bg-sky-300/35 dark:bg-cyan-500/15 blur-[110px]" />
        <div className="absolute -bottom-32 left-1/3 w-[520px] h-[520px] rounded-full bg-rose-200/35 dark:bg-purple-600/15 blur-[120px]" />
        <div
          className="absolute inset-0 opacity-[0.35] dark:opacity-[0.18]"
          style={{
            backgroundImage:
              'radial-gradient(rgba(100,116,139,0.22) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />
      </div>

      {/* Mobile Header */}
      <MobileTopBar
        blogTitle={data.settings.blogTitle}
        isAdmin={isAdmin}
        onOpenLeftDrawer={() => setLeftDrawerOpen(true)}
        onOpenRightDrawer={() => setRightDrawerOpen(true)}
        hasActiveFilter={hasActiveFilter}
      />

      {/* Desktop 3-Column Container */}
      <div className="flex-1 w-full max-w-[1280px] mx-auto px-3 sm:px-5 lg:px-8 pt-4 pb-24 lg:py-8">
        <div
          className={`grid grid-cols-1 gap-6 ${
            effectiveView === 'admin'
              ? 'lg:grid-cols-[248px_minmax(0,1fr)]'
              : 'lg:grid-cols-[248px_minmax(0,1fr)_272px]'
          }`}
        >
          {/* Left Column (Desktop Sticky) */}
          <aside className="hidden lg:block">
            <div className="sticky top-8 h-[calc(100vh-4rem)]">{leftSidebarNode()}</div>
          </aside>

          {/* Center Main Column */}
          <main className="min-w-0">
            {effectiveView === 'admin' && isAdmin ? (
              <AdminDashboard
                data={data}
                initialTab={adminInitialTab}
                onClearInitialTab={() => setAdminInitialTab(null)}
                initialEditArticleId={adminEditArticleId}
                onClearInitialEditArticle={() => setAdminEditArticleId(null)}
                onSaveArticle={handleSaveArticle}
                onDeleteArticle={handleDeleteArticle}
                onSaveDiary={handleSaveDiary}
                onDeleteDiary={handleDeleteDiary}
                onSaveCategories={handleSaveCategories}
                onRenameTagGlobal={handleRenameTagGlobal}
                onDeleteTagGlobal={handleDeleteTagGlobal}
                onSaveSettings={handleSaveSettings}
                onResetDemoData={handleResetDemoData}
                onPreviewArticle={handleOpenArticle}
              />
            ) : effectiveView === 'diary' && isAdmin ? (
              <DiaryView
                diaries={data.diaries}
                searchQuery={searchQuery}
                selectedTag={selectedTag}
                onSelectTag={setSelectedTag}
                onClearFilters={clearAllFilters}
                onSaveDiary={handleSaveDiary}
                onDeleteDiary={handleDeleteDiary}
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
                articles={publishedArticles}
                categories={data.categories}
                settings={data.settings}
                activeArticleId={activeArticleId}
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
              <div className="sticky top-8 max-h-[calc(100vh-4rem)] overflow-y-auto pr-0.5">
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
        expectedPassword={data.settings.adminPassword}
        onClose={() => setLoginModalOpen(false)}
        onSuccess={() => {
          setIsAdmin(true);
          setLoginModalOpen(false);
        }}
      />
    </div>
  );
}

export default App;
