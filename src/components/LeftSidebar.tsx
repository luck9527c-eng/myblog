import React from 'react';
import {
  Archive,
  BookOpen,
  FileText,
  Lock,
  LogIn,
  LogOut,
  Mail,
  MapPin,
  Moon,
  NotebookPen,
  Settings,
  Sun,
  User,
} from 'lucide-react';
import type { AppView, SiteSettings, ThemeMode } from '../types';

interface LeftSidebarProps {
  settings: SiteSettings;
  currentView: AppView;
  onNavigate: (view: AppView) => void;
  isAdmin: boolean;
  onOpenLogin: () => void;
  onLogout: () => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
  publishedCount: number;
  diaryCount: number;
  onCloseMobileDrawer?: () => void;
}

export const LeftSidebar: React.FC<LeftSidebarProps> = ({
  settings,
  currentView,
  onNavigate,
  isAdmin,
  onOpenLogin,
  onLogout,
  theme,
  onToggleTheme,
  publishedCount,
  diaryCount,
  onCloseMobileDrawer,
}) => {
  const handleNav = (view: AppView) => {
    onNavigate(view);
    onCloseMobileDrawer?.();
  };

  const navItemClass = (active: boolean) =>
    `w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm font-medium transition-all ${
      active
        ? 'bg-zinc-900/90 text-white dark:bg-white/90 dark:text-zinc-900 shadow-sm backdrop-blur-md'
        : 'text-zinc-600 hover:text-zinc-950 hover:bg-white/55 dark:text-zinc-300 dark:hover:text-white dark:hover:bg-white/10'
    }`;

  return (
    <div className="flex flex-col h-full justify-between gap-4">
      <div className="space-y-4 overflow-y-auto pr-0.5">
        {/* Blogger Profile Card */}
        <div className="glass-card rounded-2xl p-4">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 shrink-0 rounded-xl bg-gradient-to-br from-indigo-500 via-blue-500 to-cyan-500 text-white flex items-center justify-center font-semibold text-base tracking-tight shadow-sm">
              {settings.authorName.slice(0, 1)}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                  {settings.authorName}
                </h2>
                {isAdmin && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/15 text-emerald-700 border border-emerald-500/25 dark:text-emerald-300">
                    管理员
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                {settings.authorHandle}
              </p>
            </div>
          </div>

          <p className="mt-3 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300/90">
            {settings.authorBio}
          </p>

          <div className="mt-3 pt-3 border-t border-zinc-200/60 dark:border-white/10 space-y-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
            <div className="flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 shrink-0 text-zinc-400" />
              <span className="truncate">{settings.authorLocation}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 shrink-0 text-zinc-400" />
              <span className="truncate">{settings.authorEmail}</span>
            </div>
          </div>
        </div>

        {/* Public Navigation */}
        <nav className="glass-card rounded-2xl p-2.5 space-y-1" aria-label="主导航">
          <p className="px-2.5 pt-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            导航
          </p>
          <button
            type="button"
            onClick={() => handleNav('home')}
            className={navItemClass(currentView === 'home' || currentView === 'article')}
          >
            <span className="flex items-center gap-2.5">
              <FileText className="w-4 h-4" />
              <span>首页文章</span>
            </span>
            <span
              className={`text-xs tabular-nums ${
                currentView === 'home' || currentView === 'article'
                  ? 'text-zinc-300 dark:text-zinc-600'
                  : 'text-zinc-400 dark:text-zinc-500'
              }`}
            >
              {publishedCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleNav('archive')}
            className={navItemClass(currentView === 'archive')}
          >
            <span className="flex items-center gap-2.5">
              <Archive className="w-4 h-4" />
              <span>时间归档</span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleNav('about')}
            className={navItemClass(currentView === 'about')}
          >
            <span className="flex items-center gap-2.5">
              <User className="w-4 h-4" />
              <span>关于自己</span>
            </span>
          </button>
        </nav>

        {/* Admin-Only Navigation (Completely hidden from guests) */}
        {isAdmin && (
          <nav className="glass-card rounded-2xl p-2.5 space-y-1" aria-label="管理员专属">
            <div className="px-2.5 pt-1 pb-1.5 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <Lock className="w-3 h-3" />
                仅管理员可见
              </span>
            </div>

            <button
              type="button"
              onClick={() => handleNav('diary')}
              className={navItemClass(currentView === 'diary')}
            >
              <span className="flex items-center gap-2.5">
                <NotebookPen className="w-4 h-4" />
                <span>每日日记</span>
              </span>
              <span
                className={`text-xs tabular-nums ${
                  currentView === 'diary'
                    ? 'text-zinc-300 dark:text-zinc-600'
                    : 'text-zinc-400 dark:text-zinc-500'
                }`}
              >
                {diaryCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleNav('admin')}
              className={navItemClass(currentView === 'admin')}
            >
              <span className="flex items-center gap-2.5">
                <Settings className="w-4 h-4" />
                <span>管理后台</span>
              </span>
            </button>
          </nav>
        )}
      </div>

      {/* Bottom Controls: Theme + Subtle Admin Entry */}
      <div className="glass-card rounded-2xl p-2.5 space-y-1.5">
        <div className="flex items-center justify-between px-2 py-1">
          <div className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-300">
            <BookOpen className="w-3.5 h-3.5 text-indigo-500" />
            <span className="truncate max-w-[120px] font-medium">{settings.blogTitle}</span>
          </div>
          <button
            type="button"
            onClick={onToggleTheme}
            title={theme === 'dark' ? '切换浅色模式' : '切换深色模式'}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 hover:bg-white/70 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-white/10 transition-colors"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>

        {!isAdmin ? (
          <button
            type="button"
            onClick={() => {
              onCloseMobileDrawer?.();
              onOpenLogin();
            }}
            className="w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs text-zinc-500 hover:text-zinc-900 hover:bg-white/60 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-white/10 transition-colors"
          >
            <span className="flex items-center gap-2">
              <LogIn className="w-3.5 h-3.5" />
              <span>管理员登录</span>
            </span>
            <span className="text-[10px] opacity-75">访客模式</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              onLogout();
              onCloseMobileDrawer?.();
            }}
            className="w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs text-zinc-600 hover:text-rose-600 hover:bg-rose-500/10 dark:text-zinc-300 dark:hover:text-rose-400 transition-colors"
          >
            <span className="flex items-center gap-2">
              <LogOut className="w-3.5 h-3.5" />
              <span>退出管理员模式</span>
            </span>
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
              已解锁
            </span>
          </button>
        )}
      </div>
    </div>
  );
};
