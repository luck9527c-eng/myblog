import React from 'react';
import {
  Archive,
  BookOpen,
  CloudRain,
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
import { AuthorAvatar } from './AuthorAvatar';

interface LeftSidebarProps {
  settings: SiteSettings;
  currentView: AppView;
  onNavigate: (view: AppView) => void;
  isAdmin: boolean;
  onOpenLogin: () => void;
  onLogout: () => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
  rainEnabled: boolean;
  onToggleRain: () => void;
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
  rainEnabled,
  onToggleRain,
  publishedCount,
  diaryCount,
  onCloseMobileDrawer,
}) => {
  const handleNav = (view: AppView) => {
    onNavigate(view);
    onCloseMobileDrawer?.();
  };

  const navItemClass = (active: boolean) =>
    `w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-[15px] font-medium transition-all ${
      active
        ? 'bg-zinc-900/90 text-white dark:bg-white/90 dark:text-zinc-900 shadow-sm backdrop-blur-md'
        : 'text-zinc-600 hover:text-zinc-950 hover:bg-white/55 dark:text-zinc-300 dark:hover:text-white dark:hover:bg-white/10'
    }`;

  return (
    <div className="flex flex-col h-full gap-4">
      <div className="min-h-0 space-y-4 overflow-y-auto pr-0.5">
        {/* Blogger Profile Card */}
        <div className="glass-card rounded-2xl p-4.5" data-rain-ledge>
          <div className="flex items-center gap-3.5">
            <AuthorAvatar
              avatarUrl={settings.authorAvatar}
              authorName={settings.authorName}
              className="h-12 w-12 rounded-xl font-semibold text-lg"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                  {settings.authorName}
                </h2>
                {isAdmin && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-emerald-500/15 text-emerald-700 border border-emerald-500/25 dark:text-emerald-300">
                    管理员
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 truncate mt-0.5">
                {settings.authorHandle}
              </p>
            </div>
          </div>

          <p className="mt-3.5 text-sm leading-relaxed text-zinc-700 dark:text-zinc-100/85">
            {settings.authorBio}
          </p>

          <div className="mt-3.5 pt-3.5 border-t border-zinc-200/60 dark:border-white/15 space-y-2 text-xs text-zinc-600 dark:text-zinc-200/80">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 shrink-0 text-zinc-500 dark:text-zinc-300" />
              <span className="truncate">{settings.authorLocation}</span>
            </div>
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 shrink-0 text-zinc-500 dark:text-zinc-300" />
              <span className="truncate">{settings.authorEmail}</span>
            </div>
          </div>
        </div>

        {/* Public Navigation */}
        <nav className="glass-card rounded-2xl p-3 space-y-1" aria-label="主导航">
          <p className="px-3 pt-1 pb-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
            导航
          </p>
          <button
            type="button"
            onClick={() => handleNav('home')}
            className={navItemClass(currentView === 'home' || currentView === 'article')}
          >
            <span className="flex items-center gap-2.5">
              <FileText className="w-[18px] h-[18px]" />
              <span>首页文章</span>
            </span>
            <span
              className={`text-xs tabular-nums ${
                currentView === 'home' || currentView === 'article'
                  ? 'text-zinc-300 dark:text-zinc-600'
                  : 'text-zinc-500 dark:text-zinc-400'
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
              <Archive className="w-[18px] h-[18px]" />
              <span>时间归档</span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleNav('about')}
            className={navItemClass(currentView === 'about')}
          >
            <span className="flex items-center gap-2.5">
              <User className="w-[18px] h-[18px]" />
              <span>关于自己</span>
            </span>
          </button>
        </nav>

        {/* Admin-Only Navigation (Completely hidden from guests) */}
        {isAdmin && (
          <nav className="glass-card rounded-2xl p-3 space-y-1" aria-label="管理员专属">
            <div className="px-3 pt-1 pb-1.5 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5" />
                仅管理员可见
              </span>
            </div>

            <button
              type="button"
              onClick={() => handleNav('diary')}
              className={navItemClass(currentView === 'diary')}
            >
              <span className="flex items-center gap-2.5">
                <NotebookPen className="w-[18px] h-[18px]" />
                <span>每日日记</span>
              </span>
              <span
                className={`text-xs tabular-nums ${
                  currentView === 'diary'
                    ? 'text-zinc-300 dark:text-zinc-600'
                    : 'text-zinc-500 dark:text-zinc-400'
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
                <Settings className="w-[18px] h-[18px]" />
                <span>管理后台</span>
              </span>
            </button>
          </nav>
        )}
      </div>

      {/* Bottom Controls: Theme + Subtle Admin Entry */}
      <div className="glass-card rounded-2xl p-3 space-y-1.5 shrink-0">
        <div className="flex items-center justify-between px-2 py-1">
          <div className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200 min-w-0">
            <BookOpen className="w-4 h-4 text-indigo-500 shrink-0" />
            <span className="truncate font-medium">{settings.blogTitle}</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={onToggleRain}
              title={rainEnabled ? '关闭 3D 雨景氛围' : '开启 3D 雨景氛围'}
              aria-pressed={rainEnabled}
              className={`p-2 rounded-lg transition-colors ${
                rainEnabled
                  ? 'text-indigo-600 bg-indigo-500/15 dark:text-sky-400 dark:bg-sky-400/15'
                  : 'text-zinc-600 hover:text-zinc-900 hover:bg-white/70 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-white/10'
              }`}
            >
              <CloudRain className="w-[18px] h-[18px]" />
            </button>
            <button
              type="button"
              onClick={onToggleTheme}
              title={theme === 'dark' ? '切换浅色模式' : '切换深色模式'}
              className="p-2 rounded-lg text-zinc-500 hover:text-zinc-900 hover:bg-white/70 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-white/10 transition-colors"
            >
              {theme === 'dark' ? <Sun className="w-[18px] h-[18px]" /> : <Moon className="w-[18px] h-[18px]" />}
            </button>
          </div>
        </div>

        {!isAdmin ? (
          <button
            type="button"
            onClick={() => {
              onCloseMobileDrawer?.();
              onOpenLogin();
            }}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm text-zinc-600 hover:text-zinc-900 hover:bg-white/60 dark:text-zinc-200/85 dark:hover:text-white dark:hover:bg-white/15 transition-colors"
          >
            <span className="flex items-center gap-2">
              <LogIn className="w-4 h-4" />
              <span>管理员登录</span>
            </span>
            <span className="text-xs opacity-80">访客模式</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              onLogout();
              onCloseMobileDrawer?.();
            }}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm text-zinc-600 hover:text-rose-600 hover:bg-rose-500/10 dark:text-zinc-300 dark:hover:text-rose-400 transition-colors"
          >
            <span className="flex items-center gap-2">
              <LogOut className="w-4 h-4" />
              <span>退出管理员模式</span>
            </span>
            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
              已解锁
            </span>
          </button>
        )}
      </div>
    </div>
  );
};
