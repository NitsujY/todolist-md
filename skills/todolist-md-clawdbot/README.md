# todolist-md-clawdbot (Skill Folder Guide)

This guide explains how to run the skill scripts **from this folder only**.

## 1) Prerequisites

- Node.js 18+ (Node 20+ recommended)
- npm
- Google OAuth desktop credentials (you already placed them in `.env`)

## 2) Install dependencies

From this folder:

```bash
cd skills/todolist-md-clawdbot
npm install
```

## 3) Local auth setup

This folder uses `.env` as a local JSON file (not committed to git):

```json
{"installed":{"client_id":"...","client_secret":"...","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token","auth_provider_x509_cert_url":"https://www.googleapis.com/oauth2/v1/certs","redirect_uris":["http://localhost"]}}
```

How auth works on first run:

1. Script reads `installed.client_id` and `installed.client_secret` from `.env`.
2. Script opens browser for Google consent.
3. Script receives callback at local URL `http://127.0.0.1:53682/oauth2callback`.
4. Script saves token to `.gdrive-md-token.json`.

Next runs reuse `.gdrive-md-token.json` automatically.

## 4) Download Markdown files from Google Drive

Set a default folder name variable once:

```bash
FOLDER_NAME="todolist-md"
```

### Option A: Find folder by folder name

```bash
npm run drive:md:download -- --folderName "$FOLDER_NAME" --outDir ./outputs/drive-md
```

### Option B: Use exact folder ID

```bash
npm run drive:md:download -- --folderId "YOUR_FOLDER_ID" --outDir ./outputs/drive-md
```

Result:

- Markdown files are downloaded into `./outputs/drive-md`
- Mapping file is generated at `./outputs/drive-md/.drive-md-map.json`

## 5) Edit locally

Edit markdown files under `./outputs/drive-md`.

## 6) Upload updates back to Google Drive

Use manifest mode (recommended, updates by Drive `fileId`):

```bash
npm run drive:md:upload -- --manifest ./outputs/drive-md/.drive-md-map.json
```

If a remote file is missing and you want to recreate it:

```bash
npm run drive:md:upload -- --manifest ./outputs/drive-md/.drive-md-map.json --createMissing
```

## 7) Safe testing mode

Preview upload actions without writing:

```bash
npm run drive:md:upload -- --manifest ./outputs/drive-md/.drive-md-map.json --dryRun
```

## 8) Useful optional flags

- Custom token location:

```bash
npm run drive:md:download -- --folderName "$FOLDER_NAME" --tokenPath ./tmp/token.json
```

- Custom local env JSON path:

```bash
npm run drive:md:download -- --folderName "$FOLDER_NAME" --envPath ./my-local-env.json
```

- Restrict same-name folder search by parent folder:

```bash
npm run drive:md:download -- --folderName "$FOLDER_NAME" --parentId "PARENT_FOLDER_ID"
```

## 9) Troubleshooting

- `Missing OAuth client id/secret`
  - Check `.env` exists in this folder and is valid JSON with `installed.client_id` and `installed.client_secret`.

- `Multiple folders found for name`
  - Use `--folderId` directly, or add `--parentId`.

- `OAuth timeout after 5 minutes`
  - Re-run command and complete browser consent quickly.

- `404` during upload
  - Add `--createMissing` to create a new file when old fileId no longer exists.

## 10) Minimal end-to-end test (copy/paste)

```bash
cd skills/todolist-md-clawdbot
npm install
FOLDER_NAME="todolist-md"
npm run drive:md:download -- --folderName "$FOLDER_NAME" --outDir ./outputs/drive-md
# edit files inside ./outputs/drive-md
npm run drive:md:upload -- --manifest ./outputs/drive-md/.drive-md-map.json --dryRun
npm run drive:md:upload -- --manifest ./outputs/drive-md/.drive-md-map.json
```
