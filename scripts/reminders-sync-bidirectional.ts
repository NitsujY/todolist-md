#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

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
};

type Config = {
  plugins?: {
    reminders?: {
      mappings?: Array<{ 
        markdownFile: string; 
        remindersList: string;
      }>;
      ignore?: string[];
      forcePush?: boolean;
      forcePull?: boolean;
    };
  };
  // Legacy support
  mappings?: Array<{ 
    markdownFile: string; 
    remindersList: string;
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
  syncId: string | null; // The todolist-md:id stored in body
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
    forcePull: false
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

const runJxa = (script: string) => {
  try {
    const out = execFileSync('osascript', ['-l', 'JavaScript', '-e', script], {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 10,
    });
    return out.trim();
  } catch (e: any) {
    console.error('JXA Execution Failed:', e.stderr || e.message);
    throw e;
  }
};

const fetchReminders = (listName: string): Reminder[] => {
  const jxa = `
ObjC.import('Foundation');

function getAllReminders(listName) {
    const remindersApp = Application('Reminders');
    const lists = remindersApp.lists.whose({ name: listName });
    if (lists.length === 0) return JSON.stringify([]);
    const list = lists[0];
    
    const reminders = list.reminders();
    const results = [];
    
    for (let i = 0; i < reminders.length; i++) {
        const rem = reminders[i];
        const body = rem.body() || "";
        const m = String(body).match(/todolist-md:id=([a-f0-9]{40})/);
        const syncId = m ? m[1] : null;

        results.push({
            uuid: rem.id(),
            title: rem.name(),
            completed: rem.completed(),
            notes: body,
            syncId: syncId
        });
    }
    return JSON.stringify(results);
}
getAllReminders("${listName}");
`;
  const output = runJxa(jxa);
  try {
    return JSON.parse(output);
  } catch (e) {
    console.error(`Failed to parse JXA output for list "${listName}":`, output);
    throw e;
  }
};

const createReminder = (listName: string, task: SyncTask) => {
  const syncLine = 'todolist-md:id=' + task.id;
  const body = (task.notes ? (String(task.notes).trim() + '\n\n') : '') + syncLine;
  const jxa = `
    const app = Application('Reminders');
    let list = app.lists.whose({ name: "${listName}" })[0];
    if (!list) {
        list = app.List({ name: "${listName}" });
        app.lists.push(list);
        list = app.lists.whose({ name: "${listName}" })[0];
    }
    
    if (list) {
        const rem = app.Reminder({ 
            name: "${task.title.replace(/"/g, '\\"')}", 
            body: \`${body.replace(/`/g, '\\`')}\`, 
            completed: ${task.completed} 
        });
        list.reminders.push(rem);
    }
  `;
  runJxa(jxa);
};

const updateReminder = (uuid: string, updates: Partial<Reminder>) => {
  let updateScript = '';
  if (updates.completed !== undefined) updateScript += `rem.completed = ${updates.completed};\n`;
  if (updates.title !== undefined) updateScript += `rem.name = "${updates.title.replace(/"/g, '\\"')}";\n`;
  // Note: Updating body is tricky if we want to preserve other notes, but here we assume we own the body or at least the sync ID part.
  // For simplicity, we skip updating body/notes from Markdown -> Reminders in this direction for now, unless necessary.

  const jxa = `
    const app = Application('Reminders');
    const rem = app.reminders.whose({ id: "${uuid}" })[0];
    if (rem) {
        ${updateScript}
    }
  `;
  runJxa(jxa);
};

const deleteReminder = (uuid: string) => {
    const jxa = `
      const app = Application('Reminders');
      const rem = app.reminders.whose({ id: "${uuid}" })[0];
      if (rem) {
          rem.delete();
      }
    `;
    runJxa(jxa);
};

const syncList = async (filePath: string, listName: string, dryRun: boolean, verbose: boolean) => {
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

  const reminders = fetchReminders(listName);
  const remindersMap = new Map(reminders.map(r => [r.syncId, r])); // Map by Sync ID

  const changes = {
    createdInReminders: 0,
    updatedInReminders: 0,
    deletedInReminders: 0,
    importedToMarkdown: 0,
    updatedInMarkdown: 0,
  };

  // 1. Iterate Markdown Tasks -> Sync to Reminders
  for (const mdTask of mdTasks) {
    const reminder = remindersMap.get(mdTask.id);
    
    if (reminder) {
      // Exists in both. Check for updates.
      // Priority: We'll assume Reminders completion status is "fresher" if they differ, 
      // or we could just say "Markdown is source of truth for structure, Reminders for status".
      // Let's do: If status differs, update Markdown to match Reminder (common use case: check off on phone).
      
      if (reminder.completed !== mdTask.completed) {
        if (verbose) console.log(`  [Update MD] Task "${mdTask.title}" completed status: ${mdTask.completed} -> ${reminder.completed}`);
        // Update Markdown Line
        const lineIdx = mdTask.line - 1;
        const line = fileLines[lineIdx];
        // Replace [ ] with [x] or vice versa
        const newLine = line.replace(/^(\s*[-*]\s*)\[([ xX]?)\]/, (match, prefix) => {
            return `${prefix}[${reminder.completed ? 'x' : ' '}]`;
        });
        fileLines[lineIdx] = newLine;
        changes.updatedInMarkdown++;
      }
      
      // If titles differ, it's tricky because ID depends on title. 
      // If title changed in Reminders, the ID in body is OLD. 
      // So we found it by OLD ID. 
      // But mdTask has OLD ID (calculated from MD).
      // So titles must match roughly.
      
      // SAFE SYNC STRATEGY:
      // We do NOT sync title changes from Reminders -> Markdown by default.
      // Why? Markdown often has formatting (links, bold) that is stripped in Reminders.
      // Syncing back the plain text title would destroy the Markdown formatting.
      // We treat Markdown as the "Source of Truth" for content, and Reminders for Status.
      
      if (reminder.title !== mdTask.title) {
          if (dryRun && verbose) {
             console.log(`  [Diff] "${mdTask.title}" (MD) vs "${reminder.title}" (Rem)`);
          }

          if (args.forcePull) {
             if (verbose) console.log(`  [Force Pull] Updating MD title: "${mdTask.title}" -> "${reminder.title}"`);
             const lineIdx = mdTask.line - 1;
             const line = fileLines[lineIdx];
             const newLine = line.replace(mdTask.title, reminder.title);
             fileLines[lineIdx] = newLine;
             changes.updatedInMarkdown++;
          } else if (args.forcePush) {
             if (verbose) console.log(`  [Force Push] Updating Rem title: "${reminder.title}" -> "${mdTask.title}"`);
             if (!dryRun) {
                 updateReminder(reminder.uuid, { title: mdTask.title });
             }
             changes.updatedInReminders++;
          } else {
             if (verbose) console.log(`  [Skip MD Update] Title mismatch: "${mdTask.title}" (MD) vs "${reminder.title}" (Rem). Keeping MD version to preserve formatting.`);
          }
      }

      remindersMap.delete(mdTask.id); // Mark as processed
    } else {
      // Exists in Markdown, not in Reminders (with this ID).
      // It could be a new task, OR a renamed task (new ID).
      // We create it in Reminders.
      if (!dryRun) {
        if (verbose) console.log(`  [Create Rem] "${mdTask.title}"`);
        createReminder(listName, mdTask);
      }
      changes.createdInReminders++;
    }
  }

  // 2. Iterate Remaining Reminders
  for (const [syncId, reminder] of remindersMap) {
    if (syncId) {
      // It has a Sync ID, but was not found in Markdown.
      // This means it was DELETED (or renamed) in Markdown.
      // We should delete it from Reminders to stay in sync.
      if (!dryRun) {
        if (verbose) console.log(`  [Delete Rem] "${reminder.title}" (Not found in MD)`);
        deleteReminder(reminder.uuid);
      }
      changes.deletedInReminders++;
    } else {
      // No Sync ID. It was created in Reminders manually.
      // Import to Markdown.
      if (!dryRun) {
        if (verbose) console.log(`  [Import MD] "${reminder.title}"`);
        const newLine = `- [${reminder.completed ? 'x' : ' '}] ${reminder.title}`;
        fileLines.push(newLine);
        // We should also update the reminder to have the ID, but we need to save the file first to know its "stable" state?
        // Actually, we can calculate the ID now.
        // But let's just let the NEXT sync handle adding the ID to the reminder.
      }
      changes.importedToMarkdown++;
    }
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
  
  try {
    // Try hidden first
    const content = await fs.readFile(hiddenConfigPath, 'utf8');
    return { config: JSON.parse(content), path: hiddenConfigPath };
  } catch {
    try {
      // Try legacy
      const content = await fs.readFile(legacyConfigPath, 'utf8');
      return { config: JSON.parse(content), path: legacyConfigPath };
    } catch {
      // Neither found
    }
  }

  // 3. Create default if not found (prefer hidden)
  // Only create if we are NOT in a dry run and user didn't specify explicit args that would bypass config
  // Actually, if we are here, we are looking for config.
  
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
  
  // Don't create file if it's just a check or if we shouldn't
  // But the user expects it to be created if missing for the script to work.
  // However, if the web app creates it, we should respect that.
  
  console.log(`Creating default config at ${targetPath}`);
  await fs.writeFile(targetPath, JSON.stringify(defaultConfig, null, 2), 'utf8');
  return { config: defaultConfig, path: targetPath };
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

          const filePath = path.resolve(configDir, file);
          
          // Check if file exists before syncing to avoid errors
          try {
            await fs.access(filePath);
            await syncList(filePath, list, args.dryRun, args.verbose);
          } catch {
            console.warn(`Skipping missing file: ${file}`);
          }
        }
        return;
      }
    }
  }

  if (args.file) {
    await syncList(args.file, args.list!, args.dryRun, args.verbose);
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
      await syncList(filePath, listName, args.dryRun, args.verbose);
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
