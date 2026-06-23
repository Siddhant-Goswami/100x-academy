/**
 * sync-lessons.ts — build/deploy step.
 *
 * Content in Git is the source of truth for lessons. This upserts a lightweight
 * registry (modules + lessons) into Supabase so dashboards can join on
 * human-readable titles without the platform drifting from the content.
 *
 * Run with the SERVICE ROLE key (server-only). It bypasses RLS by design, which
 * is why this never runs in the browser.
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run sync-lessons
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const DOCS_DIR = fileURLToPath(new URL('../src/content/docs', import.meta.url));

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before syncing.');
  process.exit(1);
}
const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

interface LessonRow {
  slug: string;
  module_slug: string;
  title: string;
  runtime: string;
  difficulty: number | null;
  est_minutes: number | null;
  needs_llm: boolean;
  order_index: number;
}

// Pull the top-level frontmatter scalars the registry needs. The nested verifier
// block stays in Git; the registry only mirrors what dashboards join on.
function frontmatter(raw: string): Record<string, string> {
  const m = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  const out: Record<string, string> = {};
  for (const line of m[1].split('\n')) {
    // top-level keys only (no leading whitespace), stop capturing nested blocks
    const kv = line.match(/^([a-z_]+):\s*(.*)$/);
    if (kv) out[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

// Recursively collect every .mdx/.md lesson under a module directory.
async function collectLessons(): Promise<{ modules: Set<string>; lessons: LessonRow[] }> {
  const modules = new Set<string>();
  const lessons: LessonRow[] = [];

  const moduleDirs = await readdir(DOCS_DIR, { withFileTypes: true });
  for (const md of moduleDirs) {
    if (!md.isDirectory()) continue; // index.mdx and other top-level pages are not lessons
    const moduleSlug = md.name;
    const files = await readdir(join(DOCS_DIR, moduleSlug));
    for (const file of files) {
      if (!/\.mdx?$/.test(file)) continue;
      const raw = await readFile(join(DOCS_DIR, moduleSlug, file), 'utf8');
      const fm = frontmatter(raw);
      if (!fm.module || !fm.order) continue; // not a lesson (missing required fields)
      modules.add(moduleSlug);
      const slug = `${moduleSlug}/${file.replace(/\.mdx?$/, '')}`;
      lessons.push({
        slug,
        module_slug: moduleSlug,
        title: fm.title ?? slug,
        runtime: fm.runtime ?? 'python',
        difficulty: fm.difficulty ? Number(fm.difficulty) : null,
        est_minutes: fm.est_minutes ? Number(fm.est_minutes) : null,
        needs_llm: fm.needs_llm === 'true',
        order_index: Number(fm.order ?? 0),
      });
    }
  }
  return { modules, lessons };
}

async function main() {
  const { modules, lessons } = await collectLessons();

  // Modules first (lessons FK to module_slug).
  const moduleRows = [...modules].map((slug, i) => ({ slug, title: slug, order_index: i }));
  if (moduleRows.length) {
    const { error } = await supabase.from('modules').upsert(moduleRows, { onConflict: 'slug' });
    if (error) throw error;
  }

  if (lessons.length) {
    const { error } = await supabase.from('lessons').upsert(lessons, { onConflict: 'slug' });
    if (error) throw error;
  }

  console.log(`Synced ${moduleRows.length} module(s) and ${lessons.length} lesson(s).`);
}

main().catch((e) => {
  console.error('sync-lessons failed:', e.message ?? e);
  process.exit(1);
});
