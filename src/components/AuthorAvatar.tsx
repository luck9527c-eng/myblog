import React, { useEffect, useState } from 'react';

interface AuthorAvatarProps {
  avatarUrl?: string;
  authorName: string;
  className?: string;
}

/**
 * Renders the blog author's avatar image when configured and reachable,
 * falling back to the gradient initial badge cleanly.
 */
export const AuthorAvatar: React.FC<AuthorAvatarProps> = ({
  avatarUrl,
  authorName,
  className = 'h-12 w-12 rounded-xl font-semibold text-lg',
}) => {
  const [imgError, setImgError] = useState(false);
  const trimmedUrl = (avatarUrl || '').trim();

  useEffect(() => {
    setImgError(false);
  }, [trimmedUrl]);

  if (trimmedUrl && !imgError) {
    return (
      <img
        src={trimmedUrl}
        alt={`${authorName || '博主'}头像`}
        onError={() => setImgError(true)}
        className={`${className} shrink-0 object-cover shadow-sm bg-white/40 dark:bg-white/10 ring-1 ring-white/50 dark:ring-white/15`}
      />
    );
  }

  return (
    <div
      className={`${className} shrink-0 bg-gradient-to-br from-indigo-500 via-blue-500 to-cyan-500 text-white flex items-center justify-center tracking-tight shadow-sm`}
    >
      {(authorName || '博').slice(0, 1)}
    </div>
  );
};
