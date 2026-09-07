#!/usr/bin/env node
/**
 * Manual drift check between the ported server-side generator
 * (api/_practice-generators.js, lines below the header comment down to
 * "END PORTED SECTION") and its source of truth, scripts/practice-engine.js
 * lines 1-983 in the frontend repo (dailymathforkids).
 *
 * This is NOT run in CI — each repo's CI only checks out its own repo, so
 * there is no automatic way to compare across them. Run this by hand
 * (whenever either file is edited, before assuming they still match):
 *
 *   node tools/verify-generator-sync.js /path/to/dailymathforkids
 *
 * Exits non-zero and prints a diff-friendly message if the ported region no
 * longer matches the frontend source verbatim.
 */
import { readFileSync } from 'fs';
import { createHash } from 'crypto';
import path from 'path';

const PORTED_FILE = path.join(process.cwd(), 'api', '_practice-generators.js');
const PORTED_START_MARKER = '// ── Practice Mode Question Generator';
const PORTED_END_MARKER = '// ── END PORTED SECTION';

function normalizeLineEndings(text) {
  // Compare content, not whether checkout settings produced CRLF or LF.
  return text.replace(/\r\n/g, '\n');
}

function extractPortedRegion(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker);
  const end = text.indexOf(endMarker);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`Could not find markers in this file (start=${start}, end=${end})`);
  }
  return normalizeLineEndings(text.slice(start, end).trimEnd());
}

function hash(text) {
  return createHash('sha256').update(text).digest('hex');
}

const frontendRepoPath = process.argv[2];
if (!frontendRepoPath) {
  console.error('Usage: node tools/verify-generator-sync.js /path/to/dailymathforkids');
  process.exit(2);
}

const portedText = readFileSync(PORTED_FILE, 'utf-8');
const portedRegion = extractPortedRegion(portedText, PORTED_START_MARKER, PORTED_END_MARKER);

// The frontend region is identified by line range (1-983 as of the port),
// not by re-matching an end-of-function string here — reconstructing that
// as a literal is fragile against whitespace/quote-style drift and was the
// wrong tool for this job.
const PORTED_LINE_COUNT = 983;
const sourcePath = path.join(frontendRepoPath, 'scripts', 'practice-engine.js');
const sourceText = readFileSync(sourcePath, 'utf-8');
const sourceLines = normalizeLineEndings(sourceText).split('\n');
if (!sourceLines[0].includes('Practice Mode Question Generator')) {
  console.error(`Expected ${sourcePath} to start with the "Practice Mode Question Generator" ` +
    'header comment on line 1 — has the file been restructured?');
  process.exit(2);
}
const sourceRegion = sourceLines.slice(0, PORTED_LINE_COUNT).join('\n').trimEnd();

const portedHash = hash(portedRegion);
const sourceHash = hash(sourceRegion);

if (portedHash === sourceHash) {
  console.log('OK: api/_practice-generators.js matches scripts/practice-engine.js exactly.');
  process.exit(0);
} else {
  console.error('MISMATCH: the ported generator logic has drifted from the frontend source.');
  console.error(`  api/_practice-generators.js region hash: ${portedHash}`);
  console.error(`  frontend practice-engine.js region hash: ${sourceHash}`);
  console.error('Re-port the region (see the header comment in api/_practice-generators.js) or');
  console.error('confirm the drift is intentional and update both files\' comments accordingly.');
  process.exit(1);
}
