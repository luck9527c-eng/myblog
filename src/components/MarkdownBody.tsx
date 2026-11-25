import React, { useEffect, useRef } from 'react';

interface MarkdownBodyProps {
  html: string;
  className?: string;
}

/**
 * Renders sanitized Markdown HTML and attaches one-click copy buttons
 * onto every rendered <pre> code block.
 */
export const MarkdownBody: React.FC<MarkdownBodyProps> = ({ html, className = '' }) => {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const cleanups: Array<() => void> = [];
    const preBlocks = root.querySelectorAll('pre');

    preBlocks.forEach((pre) => {
      // Avoid duplicating buttons if re-run on same DOM node
      if (pre.querySelector('.code-copy-btn')) return;

      pre.style.position = 'relative';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'code-copy-btn';
      btn.textContent = '复制';
      btn.setAttribute('aria-label', '复制代码块');

      let resetTimer: number | undefined;
      const onClick = async () => {
        const codeEl = pre.querySelector('code');
        const text = (codeEl ? codeEl.textContent : pre.textContent) || '';
        try {
          if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
          } else {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
          }
          btn.textContent = '已复制 ✓';
          btn.dataset.copied = 'true';
        } catch {
          btn.textContent = '复制失败';
        }
        window.clearTimeout(resetTimer);
        resetTimer = window.setTimeout(() => {
          btn.textContent = '复制';
          delete btn.dataset.copied;
        }, 1800);
      };

      btn.addEventListener('click', onClick);
      pre.appendChild(btn);

      cleanups.push(() => {
        window.clearTimeout(resetTimer);
        btn.removeEventListener('click', onClick);
        btn.remove();
      });
    });

    return () => {
      cleanups.forEach((fn) => fn());
    };
  }, [html]);

  return (
    <div
      ref={rootRef}
      className={`prose-blog ${className}`.trim()}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};
