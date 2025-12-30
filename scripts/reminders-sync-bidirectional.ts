#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import os from 'node:os';

import { parseTasks, type Task } from '../src/lib/MarkdownParser';

type CliArgs = {
  dir?: string;
  file?: string;
  list?: string;
  config?: string;
  dryRun: boolean;
  verbose: boolean;
  watch: boolean;
  interval: number;
  forcePush: boolean; // Force MD -> Reminders (overwrite Reminders titles)
  forcePull: boolean; // Force Reminders -> MD (overwrite MD titles - risky!)
  importUnmapped: boolean; // Import reminders created manually into Markdown (requires scanning entire list)
  reindex: boolean; // Rebuild local index by matching titles (scans list)
  includeCompleted: boolean; // Include completed reminders when scanning/matching (can be slow)
};

type Config = {
  plugins?: {
    reminders?: {
      mappings?: Array<{
        markdownFile?: string;
        remindersList?: string;
        // Legacy aliases (supported for compatibility)
        file?: string;
        list?: string;
      }>;
      ignore?: string[];
      forcePush?: boolean;
      forcePull?: boolean;
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

type SyncTask = {
  id: string; // The stable hash
  title: string;
  completed: boolean;
  notes?: string;
  line: number; // 1-based line number in markdown file
};

type Reminder = {
  uuid: string;
  title: string;
  completed: boolean;
  notes: string;
  legacySyncId: string | null; // The legacy todolist-md:id stored in body (migration only)
};

type ReminderHeader = {
  uuid: string;
  title: string;
};

type TitleMatch = {
  uuid: string;
  title: string;
  completed: boolean;
};

type RemindersIndex = {
  version: 1;
  // listName -> syncId -> uuid OR { uuid, lastBodyHash }
  // Backward compatible: older index files used only the uuid string.
  lists: Record<string, Record<string, string | { uuid: string; lastBodyHash?: string }>>;
};

const usage = () => {
  console.log(`todolist-md Bi-directional Reminders Sync

Usage:
  tsx scripts/reminders-sync-bidirectional.ts --config <path>
  tsx scripts/reminders-sync-bidirectional.ts --dir <folder>
  tsx scripts/reminders-sync-bidirectional.ts --file <path> --list <Reminders List Name>

Options:
  --config <path>    JSON config file defining mappings
  --dir <folder>     Sync all .md files in folder (each file -> a Reminders list)
  --file <path>      Sync a single markdown file
  --list <name>      Reminders list name (required with --file)
  --dry-run          Print what would sync; no changes
  --verbose          Print detailed logs
  --watch            Run in a loop (default 60s interval)
  --interval <sec>   Set watch interval in seconds
  --force-push       Force update Reminders titles from Markdown (overwrites edits on phone)
  --force-pull       Force update Markdown titles from Reminders (RISKY: loses formatting)
  --import-unmapped  Import reminders created manually into Markdown (default: enabled)
  --skip-import-unmapped  Disable importing unmapped reminders
  --reindex          Rebuild local index by matching Markdown titles to Reminders titles (scans list)
  --include-completed Include completed reminders when scanning/matching (slower on big lists)
  --help             Show this help
`);
};

const parseArgs = (argv: string[]): CliArgs => {
  const args: CliArgs = { 
    dryRun: false, 
    verbose: false, 
    watch: false, 
    interval: 60,
    forcePush: false,
    forcePull: false,
    importUnmapped: true,
    reindex: false,
    includeCompleted: false,
  };

  const takeValue = (flag: string): string | undefined => {
    const index = argv.indexOf(flag);
    if (index === -1) return undefined;
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) return undefined;
    return value;
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
  args.forcePush = argv.includes('--force-push');
  args.forcePull = argv.includes('--force-pull');
  // Default: import unmapped reminders (incomplete only unless --include-completed)
  // Allow overriding for speed.
  args.importUnmapped = argv.includes('--skip-import-unmapped') ? false : true;
  if (argv.includes('--import-unmapped')) args.importUnmapped = true;
  args.reindex = argv.includes('--reindex');
  args.includeCompleted = argv.includes('--include-completed');
  
  const intervalVal = takeValue('--interval');
  if (intervalVal) {
      args.interval = parseInt(intervalVal, 10);
  }

  if (!args.dir && !args.file && !args.config) {
    // Try to load default config silently, if fails then show usage
    // But wait, runSync handles default config loading now.
    // So we can allow empty args if we want default behavior.
  }

  if ((args.dir && args.file) || (args.config && args.dir) || (args.config && args.file)) {
    console.error('Provide only one of --config, --dir, or --file');
    process.exit(1);
  }

  if (args.file && !args.list) {
    console.error('--list is required when using --file');
    process.exit(1);
  }

  return args;
};

const toPlainTitle = (markdownText: string) => {
  return markdownText
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
};

const stableIdForTask = (listName: string, task: Task) => {
  const title = toPlainTitle(task.text);
  const description = task.description ?? '';
  const input = `${listName}\n${title}\n${description}`;
  return crypto.createHash('sha1').update(input, 'utf8').digest('hex');
};

const expandTilde = (p: string) => {
  if (p === '~') return os.homedir();
  if (p.startsWith('~/') || p.startsWith('~\\')) {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
};

const resolveFromConfigDir = (configDir: string, maybePath: string) => {
  const expanded = expandTilde(maybePath);
  if (path.isAbsolute(expanded)) return expanded;
  return path.resolve(configDir, expanded);
};

const toJxaStringLiteral = (value: string) => {
  return JSON.stringify(value);
};

const INDEX_FILENAME = '.todolist-md.reminders-index.json';

const loadRemindersIndex = async (baseDir: string): Promise<{ path: string; index: RemindersIndex }> => {
  const indexPath = path.resolve(baseDir, INDEX_FILENAME);
  try {
    const raw = await fs.readFile(indexPath, 'utf8');
    const parsed = JSON.parse(raw) as RemindersIndex;
    if (!parsed || parsed.version !== 1 || typeof parsed.lists !== 'object') {
      throw new Error('Invalid index shape');
    }
    return { path: indexPath, index: parsed };
  } catch {
    const fresh: RemindersIndex = { version: 1, lists: {} };
    return { path: indexPath, index: fresh };
  }
};

const saveRemindersIndex = async (indexPath: string, index: RemindersIndex) => {
  await fs.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf8');
};

const getListIndex = (index: RemindersIndex, listName: string) => {
  if (!index.lists[listName]) index.lists[listName] = {};
  return index.lists[listName];
};

const getUuidFromIndexEntry = (entry: string | { uuid: string } | undefined) => {
  if (!entry) return undefined;
  if (typeof entry === 'string') return entry;
  return entry.uuid;
};

const setIndexEntry = (
  listIndex: Record<string, string | { uuid: string; lastBodyHash?: string }>,
  syncId: string,
  uuid: string,
  lastBodyHash?: string,
) => {
  const existing = listIndex[syncId];
  if (typeof existing === 'object' && existing && typeof existing.uuid === 'string') {
    existing.uuid = uuid;
    if (lastBodyHash !== undefined) existing.lastBodyHash = lastBodyHash;
    return;
  }
  listIndex[syncId] = lastBodyHash ? { uuid, lastBodyHash } : uuid;
};

const getLastBodyHashFromIndexEntry = (entry: string | { uuid: string; lastBodyHash?: string } | undefined) => {
  if (!entry || typeof entry === 'string') return undefined;
  return entry.lastBodyHash;
};

const runJxa = (script: string) => {
  try {
    const timeoutMs = Number.parseInt(process.env.TODOLIST_MD_JXA_TIMEOUT_MS ?? '', 10);
    const out = execFileSync('osascript', ['-l', 'JavaScript', '-e', script], {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 10,
      timeout: Number.isFinite(timeoutMs) ? timeoutMs : 15000,
    });
    return out.trim();
  } catch (e: unknown) {
    const err = e as { stderr?: string; message?: string };
    console.error('JXA Execution Failed:', err.stderr || err.message || String(e));
    throw e;
  }
};

const fetchLegacyMarkedReminders = (listName: string): Reminder[] => {
  const jxa = `
ObjC.import('Foundation');

function getAllReminders(listName) {
    const remindersApp = Application('Reminders');
    const lists = remindersApp.lists.whose({ name: listName })();
    if (lists.length === 0) return JSON.stringify([]);
    const list = lists[0];

    // Fetch only reminders that contain our legacy marker.
    const reminders = list.reminders.whose({ body: { _contains: "todolist-md:id=" } })();
    const results = [];
    
    for (let i = 0; i < reminders.length; i++) {
        const rem = reminders[i];
        const body = rem.body() || "";
        const m = String(body).match(/todolist-md:id=([a-f0-9]{40})/);
        const legacySyncId = m ? m[1] : null;

        results.push({
            uuid: rem.id(),
            title: rem.name(),
            completed: rem.completed(),
            notes: body,
            legacySyncId: legacySyncId
        });
    }
    return JSON.stringify(results);
}
getAllReminders(${toJxaStringLiteral(listName)});
`;
  const output = runJxa(jxa);
  try {
    return JSON.parse(output);
  } catch (e) {
    console.error(`Failed to parse JXA output for list "${listName}":`, output);
    throw e;
  }
};

const fetchRemindersByUuids = (listName: string, uuids: string[]): Reminder[] => {
  if (uuids.length === 0) return [];
  const normalized = uuids.map(u => String(u).trim());
  const uuidsJson = JSON.stringify(normalized);
  const jxa = `
ObjC.import('Foundation');

function getRemindersByUuids(listName, uuids) {
  const remindersApp = Application('Reminders');
  const lists = remindersApp.lists.whose({ name: listName })();
  if (lists.length === 0) return JSON.stringify([]);
  const list = lists[0];

  const results = [];
  for (let i = 0; i < uuids.length; i++) {
    const id = uuids[i];
    // Query within the list to avoid a slow global search
    const matches = list.reminders.whose({ id: id })();
    const rem = matches[0];
    if (!rem) continue;
    results.push({
      uuid: rem.id(),
      title: rem.name(),
      completed: rem.completed(),
      // Avoid reading rem.body() here: on some iCloud-backed lists it can be extremely slow or hang.
      notes: "",
      legacySyncId: null,
    });
  }
  return JSON.stringify(results);
}

getRemindersByUuids(${toJxaStringLiteral(listName)}, ${uuidsJson});
`;

  // NOTE: We pass UUIDs as JSON text then parse in JXA to avoid template injection.
  const output = runJxa(jxa);
  try {
    return JSON.parse(output);
  } catch (e) {
    console.error(`Failed to parse JXA output for uuid fetch in list "${listName}":`, output);
    throw e;
  }
};

const fetchAllRemindersInList = (listName: string, includeCompleted: boolean): Reminder[] => {
  const jxa = `
ObjC.import('Foundation');

function getAllRemindersInList(listName) {
  const remindersApp = Application('Reminders');
  const lists = remindersApp.lists.whose({ name: listName })();
  if (lists.length === 0) return JSON.stringify([]);
  const list = lists[0];
  const reminders = ${includeCompleted ? 'list.reminders()' : 'list.reminders.whose({ completed: false })()'};
  const results = [];
  for (let i = 0; i < reminders.length; i++) {
    const rem = reminders[i];
    results.push({
      uuid: rem.id(),
      title: rem.name(),
      completed: rem.completed(),
      notes: "",
      legacySyncId: null
    });
  }
  return JSON.stringify(results);
}

getAllRemindersInList(${toJxaStringLiteral(listName)});
`;
  const output = runJxa(jxa);
  try {
    return JSON.parse(output);
  } catch (e) {
    console.error(`Failed to parse JXA output for full list fetch "${listName}":`, output);
    throw e;
  }
};

const fetchReminderHeadersInList = (listName: string, includeCompleted: boolean): ReminderHeader[] => {
  const jxa = `
ObjC.import('Foundation');

function getReminderHeadersInList(listName) {
  const remindersApp = Application('Reminders');
  const lists = remindersApp.lists.whose({ name: listName })();
  if (lists.length === 0) return JSON.stringify([]);
  const list = lists[0];

  const reminders = ${includeCompleted ? 'list.reminders()' : 'list.reminders.whose({ completed: false })()'};
  const results = [];
  for (let i = 0; i < reminders.length; i++) {
    const rem = reminders[i];
    // Header-only scan: avoid body()/completed() which can be slow on large iCloud lists
    results.push({
      uuid: rem.id(),
      title: rem.name(),
    });
  }
  return JSON.stringify(results);
}

getReminderHeadersInList(${toJxaStringLiteral(listName)});
`;
  const output = runJxa(jxa);
  try {
    return JSON.parse(output);
  } catch (e) {
    console.error(`Failed to parse JXA output for header list fetch "${listName}":`, output);
    throw e;
  }
};

const fetchRemindersByExactTitles = (listName: string, titles: string[], includeCompleted: boolean): TitleMatch[] => {
  if (titles.length === 0) return [];
  const titlesJson = JSON.stringify(titles);
  const jxa = `
ObjC.import('Foundation');

function findByTitles(listName, titles) {
  const remindersApp = Application('Reminders');
  const lists = remindersApp.lists.whose({ name: listName })();
  if (lists.length === 0) return JSON.stringify([]);
  const list = lists[0];

  const results = [];
  for (let i = 0; i < titles.length; i++) {
    const t = titles[i];
    let rem = (list.reminders.whose({ name: t, completed: false })())[0];
    if (!rem && ${includeCompleted ? 'true' : 'false'}) {
      rem = (list.reminders.whose({ name: t })())[0];
    }
    if (!rem) continue;
    results.push({
      uuid: rem.id(),
      title: rem.name(),
      completed: rem.completed(),
    });
  }
  return JSON.stringify(results);
}

findByTitles(${toJxaStringLiteral(listName)}, ${titlesJson});
`;
  const output = runJxa(jxa);
  try {
    return JSON.parse(output);
  } catch (e) {
    console.error(`Failed to parse JXA output for title match fetch "${listName}":`, output);
    throw e;
  }
};

const createReminder = (listName: string, task: SyncTask): string => {
  // Option A: do NOT embed sync id in the reminder body.
  // Keep body for human notes only.
  const body = task.notes ? String(task.notes).trim() : '';
  const jxa = `
    const app = Application('Reminders');
  let list = (app.lists.whose({ name: ${toJxaStringLiteral(listName)} })())[0];
    if (!list) {
    list = app.List({ name: ${toJxaStringLiteral(listName)} });
        app.lists.push(list);
    list = (app.lists.whose({ name: ${toJxaStringLiteral(listName)} })())[0];
    }
    
    if (list) {
        const rem = app.Reminder({ 
      name: ${toJxaStringLiteral(task.title)}, 
      body: ${toJxaStringLiteral(body)}, 
            completed: ${task.completed} 
        });
        list.reminders.push(rem);
        rem.id();
    }
  `;
  return runJxa(jxa);
};

const updateReminderInList = (listName: string, uuid: string, updates: Partial<Reminder>) => {
  let updateScript = '';
  if (updates.completed !== undefined) updateScript += `rem.completed = ${updates.completed};\n`;
  if (updates.title !== undefined) updateScript += `rem.name = ${toJxaStringLiteral(updates.title)};\n`;
  if (updates.notes !== undefined) updateScript += `rem.body = ${toJxaStringLiteral(String(updates.notes))};\n`;

  const jxa = `
    const app = Application('Reminders');
    const list = (app.lists.whose({ name: ${toJxaStringLiteral(listName)} })())[0];
    if (list) {
      const rem = (list.reminders.whose({ id: ${toJxaStringLiteral(uuid)} })())[0];
      if (rem) {
          ${updateScript}
      }
    }
  `;
  runJxa(jxa);
};

const deleteReminderInList = (listName: string, uuid: string) => {
    const jxa = `
      const app = Application('Reminders');
      const list = (app.lists.whose({ name: ${toJxaStringLiteral(listName)} })())[0];
      if (list) {
        const rem = (list.reminders.whose({ id: ${toJxaStringLiteral(uuid)} })())[0];
        if (rem) {
            rem.delete();
        }
      }
    `;
    runJxa(jxa);
};

const syncList = async (
  filePath: string,
  listName: string,
  dryRun: boolean,
  verbose: boolean,
  forcePush: boolean,
  forcePull: boolean,
  importUnmapped: boolean,
  reindex: boolean,
  includeCompleted: boolean,
) => {
  console.log(`Syncing ${path.basename(filePath)} <-> Reminders List: "${listName}"`);
  
  const markdown = await fs.readFile(filePath, 'utf8');
  const fileLines = markdown.split('\n');
  const tasks = parseTasks(markdown).filter(t => t.type === 'task');
  
  const mdTasks: SyncTask[] = tasks.map(t => ({
    id: stableIdForTask(listName, t),
    title: toPlainTitle(t.text),
    completed: !!t.completed,
    notes: t.description,
    line: parseInt(t.id.split('-')[0], 10)
  }));

  const { path: indexPath, index } = await loadRemindersIndex(process.cwd());
  const listIndex = getListIndex(index, listName);

  // Migration: read only legacy-marked reminders (fast) and populate the local index.
  const legacyReminders = fetchLegacyMarkedReminders(listName);
  let migrated = 0;
  for (const rem of legacyReminders) {
    if (rem.legacySyncId && !listIndex[rem.legacySyncId]) {
      setIndexEntry(listIndex, rem.legacySyncId, rem.uuid);
      migrated++;
    }
  }
  if (migrated > 0 && !dryRun) {
    await saveRemindersIndex(indexPath, index);
    if (verbose) console.log(`  Migrated ${migrated} reminders into local index.`);
  }

  if (reindex) {
    // Rebuild index by matching exact titles (header-only scan).
    const all = fetchReminderHeadersInList(listName, includeCompleted);
    const buckets = new Map<string, string[]>();
    for (const rem of all) {
      const key = String(rem.title || '').trim();
      if (!key) continue;
      const arr = buckets.get(key) ?? [];
      arr.push(rem.uuid);
      buckets.set(key, arr);
    }

    let added = 0;
    for (const mdTask of mdTasks) {
      if (listIndex[mdTask.id]) continue;
      const candidates = buckets.get(mdTask.title);
      if (!candidates || candidates.length === 0) continue;
      // Pop one to avoid mapping multiple tasks to the same reminder
      const uuid = candidates.shift()!;
      listIndex[mdTask.id] = uuid;
      added++;
    }

    if (verbose) {
      console.log(`  Reindex: matched ${added} Markdown tasks by title.`);
    }
    if (added > 0 && !dryRun) {
      await saveRemindersIndex(indexPath, index);
    }
  }

  // Fetch only reminders referenced by our local index (avoid scanning huge lists by default)
  const neededUuids = Array.from(
    new Set(
      Object.values(listIndex)
        .map(v => getUuidFromIndexEntry(v))
        .filter((v): v is string => !!v),
    ),
  );
  const mappedReminders = fetchRemindersByUuids(listName, neededUuids);
  const remindersByUuid = new Map(mappedReminders.map(r => [r.uuid, r]));

  const normalizeTitleForMatch = (value: string) => {
    return String(value ?? '')
      .trim()
      .replace(/\s+/g, ' ');
  };

  const commonPrefixLen = (a: string, b: string) => {
    const max = Math.min(a.length, b.length);
    let i = 0;
    for (; i < max; i++) {
      if (a[i] !== b[i]) break;
    }
    return i;
  };

  // Opportunistic linking: if a Markdown task has no mapping yet, try to find an existing reminder
  // with the same title in the target list. This avoids scanning the entire list and helps
  // completion syncing work even when the index is missing/stale.
  const missingTitleSet = new Set<string>();
  for (const mdTask of mdTasks) {
    if (getUuidFromIndexEntry(listIndex[mdTask.id])) continue;
    if (mdTask.title) missingTitleSet.add(mdTask.title);
  }
  const missingTitles = Array.from(missingTitleSet);
  // This is a potentially expensive call if the index is empty and the Markdown file is large.
  // Gate it to keep runs snappy.
  const titleMatches = missingTitles.length > 0 && missingTitles.length <= 50
    ? fetchRemindersByExactTitles(listName, missingTitles, includeCompleted)
    : [];
  const titleToMatch = new Map(titleMatches.map(m => [m.title, m]));

  const changes = {
    createdInReminders: 0,
    updatedInReminders: 0,
    deletedInReminders: 0,
    importedToMarkdown: 0,
    updatedInMarkdown: 0,
  };

  // When a Markdown task title changes, its stable hash changes too.
  // To avoid treating renames as delete+create, we defer creating new reminders
  // and first try to relink orphan mapped reminders to newly-unmapped Markdown tasks.
  const pendingCreates: SyncTask[] = [];

  // 1. Iterate Markdown Tasks -> Sync to Reminders
  for (const mdTask of mdTasks) {
    const uuid = getUuidFromIndexEntry(listIndex[mdTask.id]);
    const reminder = uuid ? remindersByUuid.get(uuid) : undefined;

    if (!reminder) {
      const match = titleToMatch.get(mdTask.title);
      if (match) {
        if (verbose) console.log(`  [Link] Matched existing reminder by title: "${mdTask.title}"`);
        setIndexEntry(listIndex, mdTask.id, match.uuid);
        // Inject a minimal reminder record so completion sync can run this cycle
        remindersByUuid.set(match.uuid, {
          uuid: match.uuid,
          title: match.title,
          completed: match.completed,
          notes: '',
          legacySyncId: null,
        });
      }
    }

    const finalUuid = getUuidFromIndexEntry(listIndex[mdTask.id]);
    const finalReminder = finalUuid ? remindersByUuid.get(finalUuid) : undefined;
    
    if (finalReminder) {
      // Exists in both. Check for updates.
      // Priority: We'll assume Reminders completion status is "fresher" if they differ, 
      // or we could just say "Markdown is source of truth for structure, Reminders for status".
      // Let's do: If status differs, update Markdown to match Reminder (common use case: check off on phone).
      
      if (finalReminder.completed !== mdTask.completed) {
        if (verbose) console.log(`  [Update MD] Task "${mdTask.title}" completed status: ${mdTask.completed} -> ${finalReminder.completed}`);
        // Update Markdown Line
        const lineIdx = mdTask.line - 1;
        const line = fileLines[lineIdx];
        // Replace [ ] with [x] or vice versa
        const newLine = line.replace(/^(\s*[-*]\s*)\[([ xX]?)\]/, (match, prefix) => {
            return `${prefix}[${finalReminder.completed ? 'x' : ' '}]`;
        });
        fileLines[lineIdx] = newLine;
        changes.updatedInMarkdown++;
      }
      
      // If titles differ, it's tricky because ID depends on title. 
      // If title changed in Reminders, the ID in body is OLD. 
      // So we found it by OLD ID. 
      // But mdTask has OLD ID (calculated from MD).
      // So titles must match roughly.
      
      if (finalReminder.title !== mdTask.title) {
          if (dryRun && verbose) {
           console.log(`  [Diff] "${mdTask.title}" (MD) vs "${finalReminder.title}" (Rem)`);
          }

           if (forcePull) {
             if (verbose) console.log(`  [Force Pull] Updating MD title: "${mdTask.title}" -> "${finalReminder.title}"`);
             const lineIdx = mdTask.line - 1;
             const line = fileLines[lineIdx];
             const newLine = line.replace(mdTask.title, finalReminder.title);
             fileLines[lineIdx] = newLine;
             changes.updatedInMarkdown++;
          } else {
             if (verbose) console.log(`  [Push Rem] Updating Rem title: "${finalReminder.title}" -> "${mdTask.title}"`);
             if (!dryRun) {
                 updateReminderInList(listName, finalReminder.uuid, { title: mdTask.title });
             }
             changes.updatedInReminders++;
          }
      }

      // Always sync Markdown description -> Reminders body (unless forcePull is chosen as the direction).
      // In this script, description is stored in Markdown as the task's "description" and is treated as
      // the Reminders reminder body.
      if (!forcePull) {
        const desiredBody = mdTask.notes ? String(mdTask.notes).trim() : '';
        const desiredHash = crypto.createHash('sha1').update(desiredBody, 'utf8').digest('hex');
        const cachedHash = getLastBodyHashFromIndexEntry(listIndex[mdTask.id]);
        if (cachedHash !== desiredHash) {
          if (verbose) console.log(`  [Push Rem] Updating Rem body for: "${mdTask.title}"`);
          if (!dryRun) {
            updateReminderInList(listName, finalReminder.uuid, { notes: desiredBody });
          }
          setIndexEntry(listIndex, mdTask.id, finalReminder.uuid, desiredHash);
          changes.updatedInReminders++;
        }
      }

      // Mark as processed by removing it from the uuid map
      if (finalUuid) remindersByUuid.delete(finalUuid);
    } else {
      // Exists in Markdown, not in Reminders (with this ID).
      // It could be a new task, OR a renamed task (new ID).
      // Defer creating until after orphan-relink passes.
      pendingCreates.push(mdTask);
    }
  }

  // 2. Handle "orphan" reminders
  // With Option A we cannot reliably know if a reminder was deleted from Markdown unless it exists in the local index.
  // So we:
  // - delete only reminders that are mapped in the index but missing in Markdown
  // - optionally import unmapped reminders from Reminders into Markdown (same behavior as before)

  const mdIdSet = new Set(mdTasks.map(t => t.id));
  const entries = Object.entries(listIndex);
  for (const [syncId, uuid] of entries) {
    if (mdIdSet.has(syncId)) continue;
    const remUuid = getUuidFromIndexEntry(uuid);
    if (!remUuid) {
      delete listIndex[syncId];
      continue;
    }
    const rem = remindersByUuid.get(remUuid);
    if (!rem) {
      // Stale mapping
      delete listIndex[syncId];
      continue;
    }

    // Rename/relink heuristic: if a mapped reminder no longer exists in Markdown by its old ID,
    // but there is a Markdown task waiting to be created whose title looks like a rename of this
    // reminder (prefix expansion is common: "交電費" -> "交電費 haha"), then transfer mapping.
    // Only run when Markdown is the preferred direction for content.
    if (!forcePull && pendingCreates.length > 0) {
      const remTitle = normalizeTitleForMatch(rem.title);
      if (remTitle) {
        let best: { task: SyncTask; score: number } | null = null;
        let tie = false;

        for (const candidate of pendingCreates) {
          if (listIndex[candidate.id]) continue;
          const candTitle = normalizeTitleForMatch(candidate.title);
          if (!candTitle) continue;
          // Only consider prefix-based renames to avoid risky fuzzy matches.
          if (!(candTitle.startsWith(remTitle) || remTitle.startsWith(candTitle))) continue;
          const score = commonPrefixLen(candTitle, remTitle);
          if (!best || score > best.score) {
            best = { task: candidate, score };
            tie = false;
          } else if (best && score === best.score) {
            tie = true;
          }
        }

        // Require a non-trivial match and avoid ambiguous matches.
        if (best && !tie && best.score >= 2) {
          const target = best.task;
          if (verbose) {
            console.log(
              `  [Relink] Treating as rename: rem="${rem.title}" -> md="${target.title}" (transfer mapping)`,
            );
          }

          // Transfer mapping oldId -> newId
          delete listIndex[syncId];
          setIndexEntry(listIndex, target.id, remUuid);

          // Push title/body now so rename "just works" in the same run.
          const desiredBody = target.notes ? String(target.notes).trim() : '';
          const updates: Partial<Reminder> = {};
          if (rem.title !== target.title) updates.title = target.title;
          // We don't read reminder body here; just push and cache.
          const desiredHash = crypto.createHash('sha1').update(desiredBody, 'utf8').digest('hex');
          updates.notes = desiredBody;
          if (Object.keys(updates).length > 0) {
            if (!dryRun) {
              updateReminderInList(listName, remUuid, updates);
            }
            setIndexEntry(listIndex, target.id, remUuid, desiredHash);
            changes.updatedInReminders++;
          }

          // Mark as processed so we don't delete it.
          remindersByUuid.delete(remUuid);
          continue;
        }
      }
    }

    if (!dryRun) {
      if (verbose) console.log(`  [Delete Rem] "${rem.title}" (Not found in MD)`);
      deleteReminderInList(listName, rem.uuid);
      delete listIndex[syncId];
    }
    changes.deletedInReminders++;
    remindersByUuid.delete(remUuid);
  }

  // Create any remaining new tasks that weren't relinked.
  for (const mdTask of pendingCreates) {
    if (getUuidFromIndexEntry(listIndex[mdTask.id])) continue;
    if (!dryRun) {
      if (verbose) console.log(`  [Create Rem] "${mdTask.title}"`);
      const newUuid = createReminder(listName, mdTask);
      const desiredBody = mdTask.notes ? String(mdTask.notes).trim() : '';
      const desiredHash = crypto.createHash('sha1').update(desiredBody, 'utf8').digest('hex');
      setIndexEntry(listIndex, mdTask.id, newUuid, desiredHash);
    }
    changes.createdInReminders++;
  }

  if (importUnmapped) {
    if (verbose) {
      console.log(
        `  [Scan Rem] Checking for unmapped reminders (${includeCompleted ? 'including completed' : 'incomplete only'})...`,
      );
    }
    const all = fetchAllRemindersInList(listName, includeCompleted);
    const mappedUuidsSet = new Set(Object.values(listIndex));
    for (const rem of all) {
      const isMapped = mappedUuidsSet.has(rem.uuid);
      if (verbose) {
        const decision = isMapped
          ? 'SKIP (already mapped)'
          : dryRun
            ? 'IMPORT (dry-run: would import)'
            : 'IMPORT';
        const safeTitle = JSON.stringify(rem.title ?? '');
        console.log(
          `  [Scan Rem] ${decision} | completed=${rem.completed ? 'true' : 'false'} | uuid=${rem.uuid} | title=${safeTitle}`,
        );
      }

      if (isMapped) continue;
      // Unmapped reminder: treat as user-created; import into Markdown.
      if (!dryRun) {
        if (verbose) console.log(`  [Import MD] "${rem.title}"`);
        const newLine = `- [${rem.completed ? 'x' : ' '}] ${rem.title}`;
        fileLines.push(newLine);

        // Create a stable ID for this imported task and persist mapping.
        // We intentionally do NOT embed metadata into Reminders; we track it locally.
        const importedId = crypto
          .createHash('sha1')
          .update(`${listName}\n${toPlainTitle(rem.title)}\n`, 'utf8')
          .digest('hex');
        setIndexEntry(listIndex, importedId, rem.uuid);
        mappedUuidsSet.add(rem.uuid);
      }
      changes.importedToMarkdown++;
    }
  }

  // Save index updates (stale cleanup)
  if (!dryRun) {
    await saveRemindersIndex(indexPath, index);
  }

  if (changes.updatedInMarkdown > 0 || changes.importedToMarkdown > 0) {
    if (!dryRun) {
      await fs.writeFile(filePath, fileLines.join('\n'), 'utf8');
      console.log(`  Saved updates to ${path.basename(filePath)}`);
    }
  }

  console.log('  Sync Summary:', changes);
};

const loadConfig = async (configPath?: string): Promise<{ config: Config, path: string } | null> => {
  // 1. Try explicit path
  if (configPath) {
    try {
      const content = await fs.readFile(configPath, 'utf8');
      return { config: JSON.parse(content), path: path.resolve(configPath) };
    } catch (e) {
      console.error(`Failed to load config from ${configPath}`);
      throw e;
    }
  }

  // 2. Try .todolist-md.config.json (Hidden) or todolist.config.json (Legacy)
  const hiddenConfigPath = path.resolve(process.cwd(), '.todolist-md.config.json');
  const legacyConfigPath = path.resolve(process.cwd(), 'todolist.config.json');

  let hiddenError: unknown = null;
  let legacyError: unknown = null;
  try {
    const content = await fs.readFile(hiddenConfigPath, 'utf8');
    return { config: JSON.parse(content), path: hiddenConfigPath };
  } catch (e) {
    hiddenError = e;
  }

  try {
    const content = await fs.readFile(legacyConfigPath, 'utf8');
    return { config: JSON.parse(content), path: legacyConfigPath };
  } catch (e) {
    legacyError = e;
  }

  // 3. If neither loaded: create default only if BOTH config files are missing.
  const defaultConfig: Config = {
    plugins: {
      reminders: {
        mappings: [
          { markdownFile: "texture/project-alpha.md", remindersList: "Project Alpha" }
        ],
        ignore: ["archive/**"]
      }
    }
  };
  const targetPath = hiddenConfigPath;
  let hiddenExists = false;
  let legacyExists = false;
  try {
    await fs.access(hiddenConfigPath);
    hiddenExists = true;
  } catch {
    // ignore
  }
  try {
    await fs.access(legacyConfigPath);
    legacyExists = true;
  } catch {
    // ignore
  }
  if (!hiddenExists && !legacyExists) {
    console.log(`Creating default config at ${targetPath}`);
    await fs.writeFile(targetPath, JSON.stringify(defaultConfig, null, 2), 'utf8');
    return { config: defaultConfig, path: targetPath };
  }

  // A config file exists, but we failed to read/parse it above.
  const which = hiddenExists ? hiddenConfigPath : legacyConfigPath;
  const err = hiddenExists ? hiddenError : legacyError;
  const details = err instanceof Error ? err.message : String(err);
  throw new Error(`Config file exists but could not be read/parsed: ${which}\n${details}`);
};

const runSync = async (args: CliArgs) => {
  // If no specific file/dir args, try to load config
  if (!args.file && !args.dir) {
    const loaded = await loadConfig(args.config);
    if (loaded) {
      const { config, path: configPath } = loaded;
      const configDir = path.dirname(configPath);
      
      // Handle new structure
      const remindersConfig = config.plugins?.reminders;
      const mappings = remindersConfig?.mappings || config.mappings; // Fallback to legacy root mappings

      if (mappings) {
        console.log(`Using config from: ${configPath}`);
        for (const mapping of mappings) {
          // Support both new and old keys
          const file = mapping.markdownFile || mapping.file;
          const list = mapping.remindersList || mapping.list;

          if (!file || !list) {
            console.warn('Skipping invalid mapping:', mapping);
            continue;
          }

          const filePath = resolveFromConfigDir(configDir, file);

          // Check if file exists before syncing to avoid errors
          try {
            await fs.access(filePath);
          } catch {
            console.warn(`Skipping missing file: ${file}`);
            continue;
          }

          try {
            await syncList(
              filePath,
              list,
              args.dryRun,
              args.verbose,
              args.forcePush,
              args.forcePull,
              args.importUnmapped,
              args.reindex,
              args.includeCompleted,
            );
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.error(`Failed syncing ${file} <-> Reminders List: "${list}": ${msg}`);
          }
        }
        return;
      }
    }
  }

  if (args.file) {
    await syncList(
      args.file,
      args.list!,
      args.dryRun,
      args.verbose,
      args.forcePush,
      args.forcePull,
      args.importUnmapped,
      args.reindex,
      args.includeCompleted,
    );
    return;
  }

  if (args.dir) {
    const dir = args.dir!;
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files = entries
      .filter(e => e.isFile() && /\.(md|markdown)$/i.test(e.name))
      .map(e => path.join(dir, e.name));

    for (const filePath of files) {
      const listName = path.basename(filePath).replace(/\.(md|markdown)$/i, '');
      await syncList(
        filePath,
        listName,
        args.dryRun,
        args.verbose,
        args.forcePush,
        args.forcePull,
        args.importUnmapped,
        args.reindex,
        args.includeCompleted,
      );
    }
  }
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));

  if (args.watch) {
    console.log(`Starting Watch Mode (Interval: ${args.interval}s)...`);
    const loop = async () => {
      try {
        await runSync(args);
      } catch (e) {
        console.error('Sync Error:', e);
      }
      setTimeout(loop, args.interval * 1000);
    };
    await loop();
  } else {
    await runSync(args);
  }
};

main().catch(console.error);
