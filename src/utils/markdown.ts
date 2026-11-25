import DOMPurify from 'dompurify';
import { Marked } from 'marked';

export interface TocHeading {
  id: string;
  text: string;
  level: 1 | 2 | 3;
}

function slugifyHeading(text: string, index: number): string {
  const cleaned = text
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .trim()
    .replace(/[^\w\u4e00-\u9fa5\s-]/g, '')
    .replace(/\s+/g, '-');
  return cleaned ? `h-${cleaned}-${index}` : `h-section-${index}`;
}

export function extractHeadings(markdown: string): TocHeading[] {
  const lines = markdown.split(/\r?\n/);
  const headings: TocHeading[] = [];
  let inCodeBlock = false;
  let index = 0;

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const match = /^(#{1,3})\s+(.+)$/.exec(line.trim());
    if (match) {
      const level = match[1].length as 1 | 2 | 3;
      const rawText = match[2].replace(/[*_`~[\]]/g, '').trim();
      headings.push({
        id: slugifyHeading(rawText, index++),
        text: rawText,
        level,
      });
    }
  }
  return headings;
}

export function renderMarkdown(markdown: string): string {
  let headingIndex = 0;
  const instance = new Marked({
    gfm: true,
    breaks: true,
  });

  instance.use({
    renderer: {
      heading({ tokens, depth }) {
        const textHtml = this.parser.parseInline(tokens);
        const plainText = textHtml.replace(/<[^>]+>/g, '').trim();
        if (depth <= 3) {
          const id = slugifyHeading(plainText, headingIndex++);
          return `<h${depth} id="${id}">${textHtml}</h${depth}>\n`;
        }
        return `<h${depth}>${textHtml}</h${depth}>\n`;
      },
    },
  });

  const html = instance.parse(markdown) as string;
  // XSS 清洗：所有 Markdown 输出（文章正文、简历、日记、实时预览）统一过 DOMPurify
  return DOMPurify.sanitize(html);
}

export interface ReadingStats {
  wordCount: number;
  minutes: number;
}

export function estimateReadingStats(markdown: string): ReadingStats {
  const plain = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_~\-|]/g, ' ')
    .trim();

  const cjkMatches = plain.match(/[\u4e00-\u9fa5]/g);
  const cjkCount = cjkMatches ? cjkMatches.length : 0;
  const nonCjkText = plain.replace(/[\u4e00-\u9fa5]/g, ' ').trim();
  const latinWords = nonCjkText ? nonCjkText.split(/\s+/).filter(Boolean).length : 0;
  const wordCount = cjkCount + latinWords;
  const minutes = Math.max(1, Math.ceil(wordCount / 350));
  return { wordCount, minutes };
}

export const DAILY_REPORT_TEMPLATE = `### 今日完成
- 

### 遇到问题与思考
- 

### 明日计划
- [ ] `;
