#!/usr/bin/env node

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import {
  parseTasks,
  getRemindersListNameFromFileMarker,
} from '../src/lib/MarkdownParser';

type CliArgs = {
  dir?: string;
  file?: string;
  list?: string;
  config?: string;
  dryRun: boolean;
  verbose: boolean;
  watch: boolean;
  interval: number;
};

type Config = {
  plugins?: {
    reminders?: {
      mappings?: Array<{
        markdownFile?: string;
        remindersList?: string;
        // Legacy aliases
        file?: string;
        list?: string;
      }>;
      ignore?: string[];
    };
  };
  // Legacy support
  mappings?: Array<{
    markdownFile?: string;
    remindersList?: string;
    file?: string;
    list?: string;
  }>;
};

type LinkedTask = {
  taskId: string; // `${line}-${textPrefix}`
  line: number; // 1-based
  title: string;
  body: string;
  mdCompleted: boolean;
  uuid?: string;
};

type SyncResultItem = {
  key: string; // taskId
  uuid: string;
  completed: boolean;
};

const usage = () => {
  console.log(`todolist-md Reminders Sync (Linked Tasks Only)

This mode syncs ONLY tasks that have a hidden reminders marker:
  <!--todolistmd-reminders:{...}-->

Usage:
  tsx scripts/reminders-sync-linked.ts --dir <folder>
  tsx scripts/reminders-sync-linked.ts --file <path> [--list <Reminders List Name>]
  tsx scripts/reminders-sync-linked.ts --config <path>

Options:
  --config <path>    JSON config file defining mappings
  --dir <folder>     Sync all .md files in folder (one file -> one Reminders list)
  --file <path>      Sync a single markdown file
  --list <name>      Reminders list name (optional if file has a file-level marker)
  --dry-run          Print what would sync; no changes
  --verbose          Print detailed logs
  --watch            Run in a loop (default 60s interval)
  --interval <sec>   Set watch interval in seconds
  --help             Show this help

Env:
  TODOLIST_MD_JXA_TIMEOUT_MS=15000  Override osascript timeout (ms)
`);
};

const parseArgs = (argv: string[]): CliArgs => {
  const args: CliArgs = {
    dryRun: false,
    verbose: false,
    watch: false,
    interval: 60,
  };

  const takeValue = (flag: string): string | undefined => {
    const idx = argv.indexOf(flag);
    if (idx === -1) return undefined;
    const next = argv[idx + 1];
    if (!next || next.startsWith('-')) return undefined;
    return next;
  };

  if (argv.includes('--help') || argv.includes('-h')) {
    usage();
    process.exit(0);
  }

  args.config = takeValue('--config');
  args.dir = takeValue('--dir');
  args.file = takeValue('--file');
  args.list = takeValue('--list');
  args.dryRun = argv.includes('--dry-run');
  args.verbose = argv.includes('--verbose');
  args.watch = argv.includes('--watch');

  const intervalVal = takeValue('--interval');
  if (intervalVal) {
    const n = Number.parseInt(intervalVal, 10);
    if (!Number.isFinite(n) || n <= 0) {
      console.error(`Invalid --interval: ${intervalVal}`);
      process.exit(1);
    }
    args.interval = n;
  }

  if (!args.dir && !args.file && !args.config) {
    console.error('You must pass one of: --dir, --file, --config');
    usage();
    process.exit(1);
  }

  if ((args.dir && args.file) || (args.config && args.dir) || (args.config && args.file)) {
    console.error('Choose only one of: --dir, --file, --config');
    usage();
    process.exit(1);
  }

  return args;
};

const toPlainTitle = (markdownText: string) => {
  return String(markdownText ?? '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
};

const runJxa = (script: string) => {
  const configuredTimeout = Number.parseInt(process.env.TODOLIST_MD_JXA_TIMEOUT_MS ?? '', 10);
  const baseTimeoutMs = Number.isFinite(configuredTimeout) ? configuredTimeout : 15000;

  const tryRun = (timeoutMs: number) => {
    const out = execFileSync('osascript', ['-l', 'JavaScript', '-e', script], {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 10,
      timeout: timeoutMs,
    });
    return out.trim();
  };

  try {
    return tryRun(baseTimeoutMs);
  } catch (e: unknown) {
    const err = e as { stderr?: string; message?: string; code?: string };

    // Reminders + iCloud can intermittently hang. One retry with a larger timeout
    // usually resolves temporary sync stalls without making the default slow.
    const isTimeout =
      err?.code === 'ETIMEDOUT' ||
      String(err?.message || '').includes('ETIMEDOUT');

    if (isTimeout) {
      const retryTimeoutMs = Math.max(baseTimeoutMs, 60000);
      console.warn(`JXA timed out after ${baseTimeoutMs}ms; retrying once with ${retryTimeoutMs}ms...`);
      try {
        return tryRun(retryTimeoutMs);
      } catch (e2: unknown) {
        const err2 = e2 as { stderr?: string; message?: string };
        const msg = String(err2.stderr || err2.message || String(e2));
        console.error('JXA Execution Failed:', msg.length > 1200 ? `${msg.slice(0, 1200)}…` : msg);
        throw e2;
      }
    }

    const msg = String(err.stderr || err.message || String(e));
    console.error('JXA Execution Failed:', msg.length > 1200 ? `${msg.slice(0, 1200)}…` : msg);
    throw e;
  }
};

const toJxaLiteral = (value: unknown) => {
  return JSON.stringify(value);
};

const syncLinkedTasksInList = (listName: string, tasks: LinkedTask[]): SyncResultItem[] => {
  const items = tasks.map((t) => ({
    key: t.taskId,
    uuid: t.uuid ? String(t.uuid).trim() : '',
    title: toPlainTitle(t.title),
    body: String(t.body ?? ''),
    mdCompleted: !!t.mdCompleted,
  }));

  const jxa = `
ObjC.import('Foundation');

function ensureList(app, listName) {
  let list = (app.lists.whose({ name: listName })())[0];
  if (!list) {
    list = app.List({ name: listName });
    app.lists.push(list);
    list = (app.lists.whose({ name: listName })())[0];
  }
  return list;
}

function syncItems(listName, items) {
  const app = Application('Reminders');
  // Always resolve the list to scope our lookups.
  const list = ensureList(app, listName);
  if (!list) return JSON.stringify([]);

  // Optimization: Fetch ALL IDs from the list in one batch.
  // This avoids N separate Apple Events for `byId` or `whose`, which can hang.
  // It also avoids scanning properties of all items.
  const allIds = list.reminders.id();
  const uuidToIndex = {};
  for (let i = 0; i < allIds.length; i++) {
    uuidToIndex[allIds[i]] = i;
  }

  const results = [];

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const desiredTitle = String(it.title || '');
    const desiredBody = String(it.body || '');
    const mdCompleted = !!it.mdCompleted;

    let rem = null;
    if (it.uuid && Object.prototype.hasOwnProperty.call(uuidToIndex, it.uuid)) {
      // Access by index is fast and reliable if we have the map.
      const idx = uuidToIndex[it.uuid];
      rem = list.reminders[idx];
    }

    if (!rem) {
      // Create missing reminder.
      const newRem = app.Reminder({
        name: desiredTitle,
        body: desiredBody,
        completed: mdCompleted,
      });
      list.reminders.push(newRem);
      results.push({ key: it.key, uuid: newRem.id(), completed: newRem.completed() });
      continue;
    }

    // Read completion state (cheap).
    const remCompleted = !!rem.completed();

    // Sticky completion: if either side is completed, we complete both.
    if (mdCompleted && !remCompleted) {
      rem.completed = true;
    }

    // Only update content if still incomplete (avoid churn / unexpected edits on completed items).
    const afterCompleted = !!rem.completed();
    if (!afterCompleted && !mdCompleted) {
      const currentTitle = String(rem.name() || '');
      if (currentTitle !== desiredTitle) {
        rem.name = desiredTitle;
      }

      // Do not read rem.body() (can hang on iCloud lists). Just set.
      rem.body = desiredBody;
    }

    results.push({ key: it.key, uuid: rem.id(), completed: !!rem.completed() });
  }

  return JSON.stringify(results);
}

syncItems(${toJxaLiteral(listName)}, ${toJxaLiteral(items)});
`;

  const output = runJxa(jxa);
  try {
    return JSON.parse(output) as SyncResultItem[];
  } catch {
    console.error('Failed to parse JXA output:', output);
    throw new Error('Failed to parse JXA output');
  }
};

const updateMarkerOnLine = (line: string, listName: string | undefined, uuid: string) => {
  const markerRe = /<!--\s*todolistmd-reminders:([\s\S]*?)\s*-->/;
  const m = line.match(markerRe);

  const marker = {
    v: 1,
    list: listName,
    uuid,
  };

  const markerText = `<!--todolistmd-reminders:${JSON.stringify(marker)}-->`;

  if (m) {
    return line.replace(markerRe, markerText);
  }

  return `${line} ${markerText}`;
};

const setCompletedOnLine = (line: string, completed: boolean) => {
  if (!completed) return line;
  return line.replace(/^(\s*[-*]\s*)\[([ xX]?)\]/, (_match, prefix) => `${prefix}[x]`);
};

const readConfig = async (configPath: string): Promise<{ config: Config; configDir: string }> => {
  const abs = path.resolve(process.cwd(), configPath);
  const raw = await fs.readFile(abs, 'utf8');
  const parsed = JSON.parse(raw) as Config;
  return { config: parsed, configDir: path.dirname(abs) };
};

const listMarkdownFiles = async (dirPath: string): Promise<string[]> => {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && /\.(md|markdown)$/i.test(e.name))
    .map((e) => path.join(dirPath, e.name));
};

const resolveFromConfigDir = (configDir: string, maybePath: string) => {
  const raw = String(maybePath ?? '').trim();
  if (!raw) return raw;

  // Expand "~/..." (Node does not do this automatically).
  const p = raw === '~'
    ? os.homedir()
    : raw.startsWith('~/')
      ? path.join(os.homedir(), raw.slice(2))
      : raw;

  if (path.isAbsolute(p)) return p;
  return path.resolve(configDir, p);
};

const inferListNameForFile = (filePath: string, markdown: string, explicitList?: string) => {
  if (explicitList && explicitList.trim()) return explicitList.trim();
  const fromMarker = getRemindersListNameFromFileMarker(markdown);
  if (fromMarker && fromMarker.trim()) return fromMarker.trim();
  return path.basename(filePath).replace(/\.(md|markdown)$/i, '');
};

const syncFile = async (filePath: string, explicitList: string | undefined, dryRun: boolean, verbose: boolean) => {
  const markdown = await fs.readFile(filePath, 'utf8');
  const listName = inferListNameForFile(filePath, markdown, explicitList);

  const tasks = parseTasks(markdown)
    .filter((t) => t.type === 'task' && t.reminders)
    .map((t) => {
      const line = Number.parseInt(String(t.id).split('-')[0] ?? '', 10);
      return {
        taskId: t.id,
        line,
        title: t.text,
        body: t.description ?? '',
        mdCompleted: !!t.completed,
        uuid: t.reminders?.uuid,
      } satisfies LinkedTask;
    })
    .filter((t) => Number.isFinite(t.line) && t.line > 0);

  if (tasks.length === 0) {
    if (verbose) {
      console.log(`Skipping (no linked tasks): ${path.basename(filePath)} -> "${listName}"`);
    }
    return;
  }

  if (verbose) {
    console.log(`Syncing linked tasks: ${path.basename(filePath)} <-> Reminders List: "${listName}"`);
    console.log(`  Linked tasks: ${tasks.length}`);
  } else {
    console.log(`Syncing: ${path.basename(filePath)} <-> "${listName}" (${tasks.length} linked)`);
  }

  const result = syncLinkedTasksInList(listName, tasks);
  const resultByKey = new Map(result.map((r) => [r.key, r]));

  const lines = markdown.split(/\r?\n/);
  let changed = false;
  let completedFromReminders = 0;
  let createdOrRelinked = 0;

  for (const t of tasks) {
    const r = resultByKey.get(t.taskId);
    if (!r) continue;

    // If Reminders says completed and MD not, mark MD completed.
    if (r.completed && !t.mdCompleted) {
      const idx = t.line - 1;
      if (idx >= 0 && idx < lines.length) {
        const next = setCompletedOnLine(lines[idx], true);
        if (next !== lines[idx]) {
          lines[idx] = next;
          changed = true;
          completedFromReminders++;
        }
      }
    }

    // Fill UUID marker if missing/empty or changed.
    const needUuid = !t.uuid || !String(t.uuid).trim();
    if (needUuid || String(t.uuid).trim() !== r.uuid) {
      const idx = t.line - 1;
      if (idx >= 0 && idx < lines.length) {
        const next = updateMarkerOnLine(lines[idx], listName, r.uuid);
        if (next !== lines[idx]) {
          lines[idx] = next;
          changed = true;
          createdOrRelinked++;
        }
      }
    }
  }

  if (!changed) {
    if (verbose) console.log('  No Markdown changes needed.');
    return;
  }

  if (dryRun) {
    console.log(`  [Dry Run] Would update Markdown: +${createdOrRelinked} UUID markers, +${completedFromReminders} completions`);
    return;
  }

  await fs.writeFile(filePath, lines.join('\n'), 'utf8');
  console.log(`  Updated Markdown: +${createdOrRelinked} UUID markers, +${completedFromReminders} completions`);
};

const collectTargets = async (args: CliArgs): Promise<Array<{ filePath: string; list?: string }>> => {
  if (args.file) {
    // Also support "~/..." for direct --file usage.
    return [{ filePath: resolveFromConfigDir(process.cwd(), args.file), list: args.list }];
  }

  if (args.dir) {
    const dirPath = path.resolve(process.cwd(), args.dir);
    const files = await listMarkdownFiles(dirPath);
    return files.map((f) => ({ filePath: f }));
  }

  if (args.config) {
    const { config, configDir } = await readConfig(args.config);
    const mappings =
      config.plugins?.reminders?.mappings ??
      config.mappings ??
      [];

    return mappings
      .map((m) => {
        const file = m.markdownFile ?? m.file;
        const list = m.remindersList ?? m.list;
        if (!file || !list) return null;
        return {
          filePath: resolveFromConfigDir(configDir, file),
          list,
        };
      })
      .filter((x): x is { filePath: string; list?: string } => !!x);
  }

  return [];
};

const runOnce = async (args: CliArgs) => {
  const targets = await collectTargets(args);
  if (targets.length === 0) {
    console.error('No targets found.');
    process.exit(1);
  }

  for (const t of targets) {
    try {
      await fs.access(t.filePath);
    } catch {
      console.warn(`Skipping missing file: ${t.filePath}`);
      continue;
    }

    try {
      await syncFile(t.filePath, t.list, args.dryRun, args.verbose);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`Failed syncing ${t.filePath}: ${msg}`);
    }
  }
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));

  if (!args.watch) {
    await runOnce(args);
    return;
  }

  if (args.verbose) {
    console.log(`Watch mode enabled. Interval: ${args.interval}s`);
  }

  // eslint-disable-next-line no-constant-condition
  while (true) {
    await runOnce(args);
    await new Promise((r) => setTimeout(r, args.interval * 1000));
  }
};

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(msg);
  process.exit(1);
});
