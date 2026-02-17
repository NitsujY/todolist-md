#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
	const out = { _: [] };
	for (let i = 2; i < argv.length; i++) {
		const arg = argv[i];
		if (arg.startsWith('--')) {
			const [k, v] = arg.slice(2).split('=');
			out[k] = v !== undefined ? v : argv[++i];
		} else {
			out._.push(arg);
		}
	}
	return out;
}

function must(value, name) {
	if (!value) throw new Error(`Missing required argument: ${name}`);
	return value;
}

function readJson(filePath, fallback = null) {
	try {
		return JSON.parse(fs.readFileSync(filePath, 'utf8'));
	} catch {
		return fallback;
	}
}

function writeJson(filePath, data) {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function isMarkdown(file) {
	return file?.mimeType === 'text/markdown' || String(file?.name || '').endsWith('.md');
}

function extractOpenTasks(markdown, maxLines = 120) {
	const lines = String(markdown || '').split(/\r?\n/);
	const open = [];
	for (const line of lines) {
		if (line.startsWith('- [ ]')) open.push(line);
		if (open.length >= maxLines) break;
	}
	return open.join('\n');
}

function normalize(text) {
	return String(text || '')
		.toLowerCase()
		.replace(/[^a-z0-9 ]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function tokenOverlapScore(a, b) {
	const aa = normalize(a).split(' ').filter(Boolean);
	const bb = normalize(b).split(' ').filter(Boolean);
	if (!aa.length || !bb.length) return 0;
	const setA = new Set(aa);
	let common = 0;
	for (const token of bb) {
		if (setA.has(token)) common += 1;
	}
	return common / Math.max(aa.length, bb.length);
}

function extractSuggestionLines(suggestedMarkdown) {
	const lines = String(suggestedMarkdown || '').split(/\r?\n/);
	const out = [];
	for (const line of lines) {
		if (line.startsWith('- [ ]') || line.startsWith('- [x]') || line.startsWith('- ')) {
			const content = line.replace(/^\-\s*(\[[ xX]\])?\s*/, '').trim();
			if (content) out.push(`  > <!-- bot: suggested --> ${content}`);
			continue;
		}
		if (line.startsWith('> ') || line.startsWith('  >')) {
			out.push(line.startsWith('  >') ? line : `  ${line}`);
		}
	}
	return out;
}

function findAnchorTaskIndex(lines, targetTask, suggestedMarkdown) {
	const taskIndices = [];
	for (let i = 0; i < lines.length; i++) {
		if (lines[i].startsWith('- [ ]') || lines[i].startsWith('- [x]')) {
			taskIndices.push(i);
		}
	}
	if (!taskIndices.length) return -1;

	const firstSuggestedChecklist = String(suggestedMarkdown || '').split(/\r?\n/).find(line => line.startsWith('- ')) || '';
	const suggestedText = firstSuggestedChecklist.replace(/^\-\s*(\[[ xX]\])?\s*/, '').trim();
	const query = String(targetTask || suggestedText || '').trim();
	if (!query) return taskIndices[0];

	let bestIndex = taskIndices[0];
	let bestScore = -1;
	for (const idx of taskIndices) {
		const score = tokenOverlapScore(query, lines[idx]);
		if (score > bestScore) {
			bestScore = score;
			bestIndex = idx;
		}
	}
	return bestIndex;
}

function applyInlineSuggestions(markdown, suggestedMarkdown, targetTask) {
	const text = String(markdown || '');
	const inlineLines = extractSuggestionLines(suggestedMarkdown);
	if (!inlineLines.length) return text;

	const lines = text.split(/\r?\n/);
	const anchorIndex = findAnchorTaskIndex(lines, targetTask, suggestedMarkdown);
	if (anchorIndex < 0) return text;

	let insertAt = anchorIndex + 1;
	while (insertAt < lines.length && /^\s*>\s/.test(lines[insertAt])) {
		insertAt += 1;
	}

	const windowStart = Math.max(0, anchorIndex);
	const windowEnd = Math.min(lines.length, insertAt + 8);
	const existingWindow = lines.slice(windowStart, windowEnd).join('\n');
	const toInsert = inlineLines.filter(line => !existingWindow.includes(line));
	if (!toInsert.length) return text;

	lines.splice(insertAt, 0, ...toInsert);
	return `${lines.join('\n')}\n`;
}

function loadFixtureFiles(fixtureDir) {
	const listingPath = path.join(fixtureDir, 'drive_list.json');
	const listing = must(readJson(listingPath, null), `fixture listing ${listingPath}`);
	const files = listing.files || listing.items || [];
	return files;
}

function loadFixtureMarkdown(fixtureDir, fileId) {
	const filePath = path.join(fixtureDir, 'files', `${fileId}.md`);
	if (!fs.existsSync(filePath)) throw new Error(`Fixture markdown not found: ${filePath}`);
	return fs.readFileSync(filePath, 'utf8');
}

function writeFixtureMarkdown(outDir, fileId, markdown) {
	const filePath = path.join(outDir, `${fileId}.md`);
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, markdown, 'utf8');
	return filePath;
}

function loadDriveManifest(manifestPath) {
	const manifest = must(readJson(manifestPath, null), `drive manifest ${manifestPath}`);
	if (!Array.isArray(manifest.files)) {
		throw new Error(`Invalid drive manifest: missing files[] in ${manifestPath}`);
	}
	return manifest;
}

function loadDriveMarkdown(localPath) {
	if (!localPath || !fs.existsSync(localPath)) {
		throw new Error(`Drive markdown not found: ${localPath}`);
	}
	return fs.readFileSync(localPath, 'utf8');
}

function runPlan(args) {
	const source = must(args.source, '--source fixture|drive');
	const statePath = must(args.state, '--state');
	const requestOut = must(args.requestOut, '--requestOut');
	let folderId = args.folderId || source;
	let files = [];
	let markdownLoader = null;

	if (source === 'fixture') {
		const fixtureDir = must(args.fixture, '--fixture');
		files = loadFixtureFiles(fixtureDir).filter(isMarkdown);
		markdownLoader = (file) => loadFixtureMarkdown(fixtureDir, file.id);
		folderId = args.folderId || 'fixture';
	} else if (source === 'drive') {
		const manifestPath = must(args.manifest, '--manifest');
		const manifest = loadDriveManifest(manifestPath);
		files = (manifest.files || []).map((file) => ({
			id: file.fileId,
			name: file.fileName,
			mimeType: 'text/markdown',
			modifiedTime: file.modifiedTime || null,
			size: file.size || null,
			localPath: file.localPath,
		})).filter((file) => file.id && isMarkdown(file));
		markdownLoader = (file) => loadDriveMarkdown(file.localPath);
		folderId = args.folderId || manifest.folderId || 'drive';
	} else {
		throw new Error('Unsupported --source. Use fixture or drive.');
	}

	const state = readJson(statePath, { files: {}, lastRunAtUtc: null }) || { files: {}, lastRunAtUtc: null };
	const previous = state.files || {};

	const changed = [];
	for (const file of files) {
		const prev = previous[file.id] || {};
		if (prev.modifiedTime !== file.modifiedTime || String(prev.size) !== String(file.size)) {
			changed.push(file);
		}
	}

	const items = [];
	for (const file of changed) {
		const markdown = markdownLoader(file);
		items.push({
			fileId: file.id,
			name: file.name,
			openTasks: extractOpenTasks(markdown),
			hint: {
				modifiedTime: file.modifiedTime,
				size: file.size,
			},
		});
	}

	const request = {
		schema: 'todolist-md.llm_request.v1',
		stage: 'plan',
		runId: new Date().toISOString(),
		folderId,
		instructions: {
			model: args.model || 'gpt-5-mini',
			outputFormat: 'markdown_list_only',
			rules: [
				'Return only markdown checklist lines and optional blockquotes.',
				'Do not mark tasks complete.',
			],
		},
		items,
	};

	for (const file of files) {
		previous[file.id] = {
			modifiedTime: file.modifiedTime,
			size: file.size,
		};
	}

	state.files = previous;
	state.lastRunAtUtc = new Date().toISOString();

	writeJson(requestOut, request);
	writeJson(statePath, state);

	const result = {
		ok: true,
		stage: 'plan',
		source,
		totalMarkdown: files.length,
		changedCount: changed.length,
		requestOut,
		summary: changed.length ? `planned ${changed.length} changed file(s)` : 'no changes',
	};
	console.log(JSON.stringify(result, null, 2));
}

function runWrite(args) {
	const source = must(args.source, '--source fixture|drive');
	const suggestionsIn = must(args.suggestionsIn, '--suggestionsIn');
	const outDir = args.outDir;
	const dryRun = Boolean(args.dryRun);
	let manifest = null;
	let manifestPath = null;

	if (source === 'drive') {
		manifestPath = must(args.manifest, '--manifest');
		manifest = loadDriveManifest(manifestPath);
	}

	const suggestions = must(readJson(suggestionsIn, null), `suggestions JSON ${suggestionsIn}`);
	if (suggestions.schema !== 'todolist-md.llm_suggestions.v1') {
		throw new Error('Invalid suggestions schema. Expected todolist-md.llm_suggestions.v1');
	}

	const results = [];

	for (const item of suggestions.items || []) {
		const fileId = item.fileId;
		const suggested = String(item.suggested_markdown || '');
		if (!fileId || !suggested) {
			results.push({ fileId: fileId || null, action: 'skip_missing_data' });
			continue;
		}

		let original;
		let outputPath;
		if (source === 'fixture') {
			const fixtureDir = must(args.fixture, '--fixture');
			original = loadFixtureMarkdown(fixtureDir, fileId);
		} else if (source === 'drive') {
			const mapped = (manifest.files || []).find((file) => file.fileId === fileId);
			if (!mapped?.localPath) {
				results.push({ fileId, name: item.name || null, action: 'skip_missing_manifest_mapping' });
				continue;
			}
			outputPath = path.resolve(mapped.localPath);
			original = loadDriveMarkdown(outputPath);
		} else {
			throw new Error('Unsupported --source. Use fixture or drive.');
		}

		const updated = applyInlineSuggestions(original, suggested, item.target_task || '');
		const changed = original !== updated;

		if (!changed) {
			results.push({ fileId, name: item.name || null, action: 'no_change' });
			continue;
		}

		if (dryRun) {
			results.push({ fileId, name: item.name || null, action: 'dry_run_would_update' });
			continue;
		}

		if (source === 'fixture') {
			const fixtureOut = must(outDir, '--outDir');
			outputPath = writeFixtureMarkdown(fixtureOut, fileId, updated);
		} else {
			fs.mkdirSync(path.dirname(outputPath), { recursive: true });
			fs.writeFileSync(outputPath, updated, 'utf8');
		}
		results.push({ fileId, name: item.name || null, action: 'updated', outputPath });
	}

	const result = {
		ok: true,
		stage: 'write',
		source,
		suggestionsIn,
		outDir: outDir || null,
		updatedCount: results.filter(r => r.action === 'updated').length,
		skippedCount: results.filter(r => r.action !== 'updated').length,
		results,
	};

	if (source === 'drive' && manifestPath && !dryRun) {
		manifest.updatedAt = new Date().toISOString();
		writeJson(manifestPath, manifest);
	}

	console.log(JSON.stringify(result, null, 2));
}

function main() {
	const args = parseArgs(process.argv);
	const stage = args._[0];

	if (!stage || !['plan', 'write'].includes(stage)) {
		console.error('Usage: node scripts/todolist_skill_runner.mjs <plan|write> [options]');
		process.exit(1);
	}

	if (stage === 'plan') runPlan(args);
	else runWrite(args);
}

try {
	main();
} catch (error) {
	console.error(error?.stack || String(error));
	process.exit(1);
}
