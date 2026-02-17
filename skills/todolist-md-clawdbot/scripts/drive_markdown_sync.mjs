#!/usr/bin/env node

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { google } from 'googleapis';

const DEFAULT_SCOPE = 'https://www.googleapis.com/auth/drive';
const DEFAULT_TOKEN_PATH = '.gdrive-md-token.json';
const DEFAULT_MANIFEST_NAME = '.drive-md-map.json';

function printHelp() {
  console.log(`
Google Drive Markdown Sync (download/upload by fileId)

Usage:
  node scripts/drive_markdown_sync.mjs <command> [options]

Commands:
  download   Download all markdown files from a Drive folder and save fileId manifest
  upload     Upload local markdown back to Drive using fileId manifest (or filename fallback)

Common auth options:
  --clientId <id>          OAuth client id (or env GOOGLE_CLIENT_ID)
  --clientSecret <secret>  OAuth client secret (or env GOOGLE_CLIENT_SECRET)
  --envPath <path>         Local env JSON path (default: .env)
  --redirectPort <port>    OAuth local callback port (default: 53682)
  --tokenPath <path>       Token file path (default: .gdrive-md-token.json)
  --scope <scope>          OAuth scope (default: https://www.googleapis.com/auth/drive)

Folder options:
  --folderId <id>          Drive folder ID
  --folderName <name>      Drive folder name (if folderId not provided)
  --parentId <id>          Optional parent folder ID when searching by folderName

Download options:
  --outDir <path>          Output directory (default: outputs/drive-md-download)
  --manifest <path>        Manifest output path (default: <outDir>/.drive-md-map.json)

Upload options:
  --manifest <path>        Manifest path (default: <dir>/.drive-md-map.json)
  --dir <path>             Local markdown directory for filename fallback mode
  --createMissing          Create new file when fileId is missing/not found
  --dryRun                 Print actions only, do not write to Drive

Examples:
  node scripts/drive_markdown_sync.mjs download --folderName todolists --outDir ./outputs/drive-md
  node scripts/drive_markdown_sync.mjs upload --manifest ./outputs/drive-md/.drive-md-map.json
`);
}

function parseArgs(argv) {
  const [, , command, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = rest[index + 1];
    if (!next || next.startsWith('--')) {
      options[key] = true;
    } else {
      options[key] = next;
      index += 1;
    }
  }
  return { command, options };
}

function must(value, message) {
  if (!value) {
    throw new Error(message);
  }
  return value;
}

function escapeDriveQueryValue(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function isMarkdownFileName(name) {
  const lower = name.toLowerCase();
  return lower.endsWith('.md') || lower.endsWith('.markdown');
}

function isMarkdownDriveFile(file) {
  return file.mimeType === 'text/markdown' || isMarkdownFileName(file.name || '');
}

async function fileExists(filePath) {
  try {
    await fsp.access(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function openBrowser(url) {
  const platform = process.platform;
  if (platform === 'darwin') {
    spawn('open', [url], { stdio: 'ignore', detached: true }).unref();
    return;
  }
  if (platform === 'win32') {
    spawn('cmd', ['/c', 'start', '', url], { stdio: 'ignore', detached: true }).unref();
    return;
  }
  spawn('xdg-open', [url], { stdio: 'ignore', detached: true }).unref();
}

function tryReadClientFromEnvJson(options) {
  const envPath = path.resolve(options.envPath || '.env');
  if (!fs.existsSync(envPath)) {
    return { clientId: null, clientSecret: null };
  }

  try {
    const raw = fs.readFileSync(envPath, 'utf-8').trim();
    if (!raw) {
      return { clientId: null, clientSecret: null };
    }

    const parsed = JSON.parse(raw);
    const installed = parsed?.installed || {};
    return {
      clientId: installed.client_id || null,
      clientSecret: installed.client_secret || null,
    };
  } catch {
    return { clientId: null, clientSecret: null };
  }
}

function createOAuthClient(options) {
  const fromEnvJson = tryReadClientFromEnvJson(options);
  const clientId = options.clientId || process.env.GOOGLE_CLIENT_ID || fromEnvJson.clientId;
  const clientSecret = options.clientSecret || process.env.GOOGLE_CLIENT_SECRET || fromEnvJson.clientSecret;
  const redirectPort = Number(options.redirectPort || 53682);
  const redirectUri = `http://127.0.0.1:${redirectPort}/oauth2callback`;

  must(clientId, 'Missing OAuth client id. Use --clientId, GOOGLE_CLIENT_ID, or local .env JSON (installed.client_id).');
  must(clientSecret, 'Missing OAuth client secret. Use --clientSecret, GOOGLE_CLIENT_SECRET, or local .env JSON (installed.client_secret).');

  const auth = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  return { auth, redirectPort };
}

async function waitForOAuthCode({ auth, redirectPort }) {
  return new Promise((resolve, reject) => {
    const state = crypto.randomBytes(16).toString('hex');
    const server = createServer((req, res) => {
      const url = new URL(req.url || '/', `http://127.0.0.1:${redirectPort}`);
      if (url.pathname !== '/oauth2callback') {
        res.statusCode = 404;
        res.end('Not found');
        return;
      }

      const code = url.searchParams.get('code');
      const incomingState = url.searchParams.get('state');
      if (!code || incomingState !== state) {
        res.statusCode = 400;
        res.end('Invalid OAuth callback. You can close this tab.');
        return;
      }

      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end('<h2>Authentication successful. You can close this tab and return to terminal.</h2>');
      server.close(() => resolve(code));
    });

    server.listen(redirectPort, '127.0.0.1', () => {
      const authUrl = auth.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: [DEFAULT_SCOPE],
        state,
      });
      console.log(`\nOpen this URL to authorize:\n${authUrl}\n`);
      try {
        openBrowser(authUrl);
      } catch {
        // Ignore browser open failures; URL is printed above.
      }
    });

    setTimeout(() => {
      server.close(() => reject(new Error('OAuth timeout after 5 minutes. Try again.')));
    }, 5 * 60 * 1000);
  });
}

async function ensureAuth(options) {
  const tokenPath = path.resolve(options.tokenPath || DEFAULT_TOKEN_PATH);
  const { auth, redirectPort } = createOAuthClient(options);

  if (await fileExists(tokenPath)) {
    const saved = JSON.parse(await fsp.readFile(tokenPath, 'utf-8'));
    auth.setCredentials(saved);
    return auth;
  }

  const code = await waitForOAuthCode({ auth, redirectPort });
  const tokenResp = await auth.getToken(code);
  auth.setCredentials(tokenResp.tokens);

  await fsp.mkdir(path.dirname(tokenPath), { recursive: true });
  await fsp.writeFile(tokenPath, JSON.stringify(tokenResp.tokens, null, 2) + '\n', 'utf-8');
  console.log(`Saved OAuth token to ${tokenPath}`);
  return auth;
}

async function resolveFolderId(drive, options) {
  if (options.folderId) {
    return options.folderId;
  }

  const folderName = options.folderName;
  must(folderName, 'Missing folder target. Use --folderId or --folderName.');

  const queryParts = [
    "mimeType='application/vnd.google-apps.folder'",
    'trashed=false',
    `name='${escapeDriveQueryValue(folderName)}'`,
  ];

  if (options.parentId) {
    queryParts.push(`'${escapeDriveQueryValue(options.parentId)}' in parents`);
  }

  const response = await drive.files.list({
    q: queryParts.join(' and '),
    fields: 'files(id,name,parents)',
    pageSize: 20,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  const folders = response.data.files || [];
  if (folders.length === 0) {
    throw new Error(`Folder not found by name: ${folderName}`);
  }

  if (folders.length > 1) {
    const candidates = folders.map((folder) => `${folder.name} (${folder.id})`).join(', ');
    throw new Error(`Multiple folders found for name "${folderName}". Use --folderId. Candidates: ${candidates}`);
  }

  return folders[0].id;
}

async function listAllFolderFiles(drive, folderId) {
  const files = [];
  let pageToken;
  do {
    const response = await drive.files.list({
      q: `'${escapeDriveQueryValue(folderId)}' in parents and trashed=false`,
      fields: 'nextPageToken, files(id,name,mimeType,modifiedTime,parents)',
      pageSize: 1000,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    files.push(...(response.data.files || []));
    pageToken = response.data.nextPageToken || undefined;
  } while (pageToken);

  return files;
}

async function downloadDriveFile(drive, fileId, outputPath) {
  const response = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'stream' }
  );

  await fsp.mkdir(path.dirname(outputPath), { recursive: true });

  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(outputPath);
    response.data.pipe(out);
    response.data.on('error', reject);
    out.on('finish', resolve);
    out.on('error', reject);
  });
}

function dedupePath(basePath, usedPaths, fileId) {
  if (!usedPaths.has(basePath)) {
    usedPaths.add(basePath);
    return basePath;
  }

  const parsed = path.parse(basePath);
  const deduped = path.join(parsed.dir, `${parsed.name}--${fileId}${parsed.ext || '.md'}`);
  usedPaths.add(deduped);
  return deduped;
}

async function handleDownload(drive, options) {
  const outDir = path.resolve(options.outDir || 'outputs/drive-md-download');
  const manifestPath = path.resolve(options.manifest || path.join(outDir, DEFAULT_MANIFEST_NAME));
  const folderId = await resolveFolderId(drive, options);
  const allFiles = await listAllFolderFiles(drive, folderId);
  const markdownFiles = allFiles.filter(isMarkdownDriveFile).sort((left, right) => (left.name || '').localeCompare(right.name || ''));

  await fsp.mkdir(outDir, { recursive: true });

  const usedPaths = new Set();
  const manifestFiles = [];

  for (const file of markdownFiles) {
    const safeName = file.name || `${file.id}.md`;
    const target = dedupePath(path.join(outDir, safeName), usedPaths, file.id);
    await downloadDriveFile(drive, file.id, target);
    manifestFiles.push({
      fileId: file.id,
      fileName: file.name,
      localPath: target,
      modifiedTime: file.modifiedTime || null,
    });
    console.log(`Downloaded: ${file.name} (${file.id}) -> ${target}`);
  }

  const manifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    folderId,
    folderName: options.folderName || null,
    files: manifestFiles,
  };

  await fsp.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
  console.log(`\nSaved manifest: ${manifestPath}`);
  console.log(`Total markdown files downloaded: ${manifestFiles.length}`);
}

async function collectLocalMarkdownFiles(dirPath) {
  const entries = await fsp.readdir(dirPath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && isMarkdownFileName(entry.name))
    .map((entry) => path.join(dirPath, entry.name));
}

async function uploadOne(drive, { fileId, localPath, fileName, dryRun }) {
  const uploadName = fileName || path.basename(localPath);
  if (dryRun) {
    console.log(`[dryRun] update ${uploadName} (${fileId}) from ${localPath}`);
    return { updated: true, created: false, newFileId: fileId };
  }

  await drive.files.update({
    fileId,
    supportsAllDrives: true,
    requestBody: {
      name: uploadName,
      mimeType: 'text/markdown',
    },
    media: {
      mimeType: 'text/markdown',
      body: fs.createReadStream(localPath),
    },
  });

  console.log(`Updated: ${uploadName} (${fileId})`);
  return { updated: true, created: false, newFileId: fileId };
}

async function createMissingFile(drive, { localPath, fileName, folderId, dryRun }) {
  const uploadName = fileName || path.basename(localPath);
  if (dryRun) {
    console.log(`[dryRun] create ${uploadName} in folder ${folderId}`);
    return { created: true, newFileId: `dryrun-${uploadName}` };
  }

  const created = await drive.files.create({
    supportsAllDrives: true,
    requestBody: {
      name: uploadName,
      mimeType: 'text/markdown',
      parents: folderId ? [folderId] : undefined,
    },
    media: {
      mimeType: 'text/markdown',
      body: fs.createReadStream(localPath),
    },
    fields: 'id,name',
  });

  const newFileId = created.data.id;
  console.log(`Created: ${uploadName} (${newFileId})`);
  return { created: true, newFileId };
}

async function handleUpload(drive, options) {
  const dryRun = Boolean(options.dryRun);
  const createMissing = Boolean(options.createMissing);

  const dirArg = options.dir ? path.resolve(options.dir) : null;
  const manifestPath = path.resolve(options.manifest || path.join(dirArg || '.', DEFAULT_MANIFEST_NAME));

  let manifest = null;
  const hasManifest = await fileExists(manifestPath);
  if (hasManifest) {
    manifest = JSON.parse(await fsp.readFile(manifestPath, 'utf-8'));
  }

  let folderId = options.folderId || manifest?.folderId;
  if (!folderId && options.folderName) {
    folderId = await resolveFolderId(drive, options);
  }

  let uploadEntries = [];

  if (manifest?.files?.length) {
    uploadEntries = manifest.files.map((file) => ({
      fileId: file.fileId,
      fileName: file.fileName,
      localPath: path.resolve(file.localPath),
    }));
  } else {
    const fallbackDir = must(dirArg, 'No manifest found. Use --dir for filename fallback upload.');
    const localFiles = await collectLocalMarkdownFiles(fallbackDir);
    const resolvedFolderId = must(folderId, 'Filename fallback upload requires --folderId or --folderName.');
    const remoteMarkdown = (await listAllFolderFiles(drive, resolvedFolderId)).filter(isMarkdownDriveFile);
    const byName = new Map(remoteMarkdown.map((file) => [file.name, file]));

    uploadEntries = localFiles.map((localPath) => {
      const fileName = path.basename(localPath);
      const match = byName.get(fileName);
      return {
        fileId: match?.id || null,
        fileName,
        localPath,
      };
    });

    manifest = {
      version: 1,
      generatedAt: new Date().toISOString(),
      folderId: resolvedFolderId,
      folderName: options.folderName || null,
      files: uploadEntries.map((entry) => ({
        fileId: entry.fileId,
        fileName: entry.fileName,
        localPath: entry.localPath,
        modifiedTime: null,
      })),
    };
  }

  if (!folderId && createMissing) {
    throw new Error('--createMissing requires --folderId or --folderName (or folderId in manifest).');
  }

  let updatedCount = 0;
  let createdCount = 0;
  const failed = [];

  for (const entry of uploadEntries) {
    const exists = await fileExists(entry.localPath);
    if (!exists) {
      failed.push(`${entry.fileName}: local file not found (${entry.localPath})`);
      continue;
    }

    if (!entry.fileId) {
      if (!createMissing) {
        failed.push(`${entry.fileName}: missing fileId (use --createMissing)`);
        continue;
      }

      const created = await createMissingFile(drive, {
        localPath: entry.localPath,
        fileName: entry.fileName,
        folderId,
        dryRun,
      });

      createdCount += 1;
      entry.fileId = created.newFileId;
      continue;
    }

    try {
      await uploadOne(drive, {
        fileId: entry.fileId,
        localPath: entry.localPath,
        fileName: entry.fileName,
        dryRun,
      });
      updatedCount += 1;
    } catch (error) {
      const status = error?.code || error?.status;
      if (createMissing && status === 404) {
        const created = await createMissingFile(drive, {
          localPath: entry.localPath,
          fileName: entry.fileName,
          folderId,
          dryRun,
        });
        createdCount += 1;
        entry.fileId = created.newFileId;
      } else {
        failed.push(`${entry.fileName}: ${error.message}`);
      }
    }
  }

  if (manifest?.files?.length && !dryRun) {
    const byLocalPath = new Map(uploadEntries.map((entry) => [path.resolve(entry.localPath), entry.fileId]));
    manifest.files = manifest.files.map((file) => ({
      ...file,
      fileId: byLocalPath.get(path.resolve(file.localPath)) || file.fileId,
    }));
    manifest.updatedAt = new Date().toISOString();
    await fsp.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
  }

  console.log(`\nUpload summary: updated=${updatedCount}, created=${createdCount}, failed=${failed.length}`);
  if (failed.length > 0) {
    console.log('Failures:');
    for (const line of failed) {
      console.log(`- ${line}`);
    }
  }
}

async function main() {
  const { command, options } = parseArgs(process.argv);

  if (!command || command === '--help' || command === 'help') {
    printHelp();
    return;
  }

  if (!['download', 'upload'].includes(command)) {
    throw new Error(`Unknown command: ${command}`);
  }

  const auth = await ensureAuth(options);
  const drive = google.drive({ version: 'v3', auth });

  if (command === 'download') {
    await handleDownload(drive, options);
    return;
  }

  await handleUpload(drive, options);
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
