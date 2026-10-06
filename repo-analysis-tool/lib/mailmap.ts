import { promises as fs } from "node:fs";
import path from "node:path";

import type { CanonicalAuthor } from "./types";

/**
 * Git mailmap support (gitmailmap(5)): merge raw commit author identities
 * onto a single canonical author. Per the metrics spec, ingestion keeps raw
 * identities; merging is applied at query time, so an edited .mailmap takes
 * effect without re-running analysis.
 *
 * Semantics verified against git 2.43 (`git check-mailmap`):
 *   - Line forms: `Proper <proper@x>`, `<proper@x> <commit@x>`,
 *     `Proper <proper@x> <commit@x>`, `Proper <proper@x> Commit <commit@x>`.
 *   - "#" at column 0 comments out a line; blank lines and lines without a
 *     `<...>` pair are ignored.
 *   - Emails and names match case-insensitively. A replaced field uses the
 *     mailmap's casing; an unreplaced field keeps the commit's.
 *   - Each old (commit) email holds a "simple" replacement for any name plus
 *     optional name-constrained replacements; a matching name wins, else the
 *     simple one applies. Later lines override earlier ones for the same key.
 *
 * Only the standard <repoPath>/.mailmap location is honored — the
 * mailmap.file / mailmap.blob config options are out of scope.
 */

const MAILMAP_FILE = ".mailmap";

/** Replacement identity; null keeps the commit's own value for that field. */
interface MailmapInfo {
  name: string | null;
  email: string | null;
}

/** All mappings registered for one old (commit) email. */
interface MailmapEntry {
  /** Replacement for any commit with this email, regardless of name. */
  simple: MailmapInfo;
  /** Replacements for commits with this email and a matching name. */
  byName: Map<string, MailmapInfo>;
}

export interface Mailmap {
  /** Resolve a raw (commit) identity to its canonical form. */
  resolve(name: string, email: string): CanonicalAuthor;
}

interface NameEmailPair {
  name: string | null;
  email: string;
  /** Text after the closing ">"; may hold the second (old) pair. */
  rest: string;
}

/** Parse the first `Name <email>` pair in `text`; null when there is none. */
function parseNameAndEmail(text: string): NameEmailPair | null {
  const lt = text.indexOf("<");
  if (lt === -1) return null;
  const gt = text.indexOf(">", lt + 1);
  if (gt === -1) return null;
  const name = text.slice(0, lt).trim();
  return {
    name: name.length > 0 ? name : null,
    email: text.slice(lt + 1, gt),
    rest: text.slice(gt + 1),
  };
}

/**
 * Parse .mailmap content into a resolver. Invalid lines are ignored, matching
 * git's lenient reader.
 */
export function parseMailmap(content: string): Mailmap {
  // Old emails (lowercased) -> their mappings.
  const byEmail = new Map<string, MailmapEntry>();

  const entryFor = (email: string): MailmapEntry => {
    let entry = byEmail.get(email);
    if (!entry) {
      entry = { simple: { name: null, email: null }, byName: new Map() };
      byEmail.set(email, entry);
    }
    return entry;
  };

  // Mirrors git's add_mapping(): a line with no second email maps the only
  // email given, replacing just the name (form 1).
  const addMapping = (
    newName: string | null,
    newEmail: string | null,
    oldName: string | null,
    oldEmail: string | null,
  ): void => {
    let email = oldEmail;
    let replacementEmail = newEmail;
    if (email === null) {
      email = newEmail;
      replacementEmail = null;
    }
    if (email === null) return;

    const entry = entryFor(email.toLowerCase());
    const info = { name: newName, email: replacementEmail };
    if (oldName === null) entry.simple = info;
    else entry.byName.set(oldName.toLowerCase(), info);
  };

  for (const rawLine of content.split("\n")) {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    if (line.length === 0 || line.startsWith("#")) continue;

    const proper = parseNameAndEmail(line);
    if (!proper) continue;
    const old = parseNameAndEmail(proper.rest);

    if (old) {
      addMapping(proper.name, proper.email, old.name, old.email);
    } else {
      addMapping(proper.name, proper.email, null, null);
    }
  }

  return {
    resolve(name: string, email: string): CanonicalAuthor {
      const entry = byEmail.get(email.toLowerCase());
      if (!entry) return { name, email };
      const info = entry.byName.get(name.toLowerCase()) ?? entry.simple;
      return { name: info.name ?? name, email: info.email ?? email };
    },
  };
}

/**
 * Load the mailmap of a checked-out repository. A missing or unreadable
 * .mailmap yields an empty map (every identity resolves to itself).
 */
export async function readMailmap(repoPath: string): Promise<Mailmap> {
  try {
    const content = await fs.readFile(path.join(repoPath, MAILMAP_FILE), "utf8");
    return parseMailmap(content);
  } catch {
    return parseMailmap("");
  }
}

// ---------------------------------------------------------------------------
// Editable rules (author-merge management UI)
// ---------------------------------------------------------------------------

/**
 * One parsed .mailmap mapping. The four fields mirror git's add_mapping
 * inputs; `line` keeps the original text so rewriting the file preserves
 * everything the tool did not touch.
 */
export interface MailmapRule {
  /** Replacement name; null keeps the commit's own name. */
  canonicalName: string | null;
  /** Replacement email; null keeps the commit's own email. */
  canonicalEmail: string | null;
  /** Old (commit) name constraint; null = any name with rawEmail. */
  rawName: string | null;
  /** Old (commit) email the rule keys on (always set — form-1 lines key on
   *  the only email they carry). */
  rawEmail: string;
  /** Source line, written back verbatim on save. */
  line: string;
}

/** A comment or blank line, preserved verbatim across edits. */
export interface MailmapComment {
  line: string;
}

export type MailmapLine = MailmapRule | MailmapComment;

export function isMailmapRule(line: MailmapLine): line is MailmapRule {
  return "rawEmail" in line;
}

/**
 * Parse .mailmap content into editable lines. Unparseable content is kept as
 * a comment line so a rewrite never destroys data.
 */
export function parseMailmapLines(content: string): MailmapLine[] {
  const lines: MailmapLine[] = [];
  for (const rawLine of content.split("\n")) {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    if (line.length === 0 || line.startsWith("#")) {
      lines.push({ line });
      continue;
    }
    const proper = parseNameAndEmail(line);
    if (!proper) {
      lines.push({ line });
      continue;
    }
    const old = parseNameAndEmail(proper.rest);
    if (old) {
      lines.push({
        canonicalName: proper.name,
        canonicalEmail: proper.email,
        rawName: old.name,
        rawEmail: old.email,
        line,
      });
    } else {
      // Form 1: `Name <email>` keys on the email and replaces only the name.
      lines.push({
        canonicalName: proper.name,
        canonicalEmail: null,
        rawName: null,
        rawEmail: proper.email,
        line,
      });
    }
  }
  // A file ending in "\n" parses to a trailing empty line; dropping it here
  // keeps appended rules adjacent to the content and line counts stable
  // across edit cycles. Interior blank lines are preserved.
  while (
    lines.length > 0 &&
    !isMailmapRule(lines[lines.length - 1]) &&
    lines[lines.length - 1].line.trim() === ""
  ) {
    lines.pop();
  }
  return lines;
}

/**
 * Render a rule as canonical mailmap syntax, choosing among git's line
 * forms: full replacement with a name constraint (form 4), re-email (form 2),
 * name replacement via the proper pair (form 3), and rename-only (form 1,
 * when the canonical email is absent or equals the raw one).
 */
export function serializeMailmapRule(
  rule: Omit<MailmapRule, "line">,
): string | null {
  let proper: string;
  if (rule.canonicalEmail !== null) {
    proper =
      rule.canonicalName !== null
        ? `${rule.canonicalName} <${rule.canonicalEmail}>`
        : `<${rule.canonicalEmail}>`;
  } else if (rule.canonicalName !== null) {
    // Form 1: only the name is replaced, so the keyed email stands in.
    proper = `${rule.canonicalName} <${rule.rawEmail}>`;
  } else {
    return null; // nothing to replace with — invalid rule
  }
  if (rule.rawName !== null) {
    return `${proper} ${rule.rawName} <${rule.rawEmail}>`;
  }
  if (
    rule.canonicalEmail !== null &&
    rule.canonicalEmail.toLowerCase() !== rule.rawEmail.toLowerCase()
  ) {
    return `${proper} <${rule.rawEmail}>`;
  }
  return proper;
}

const FORBIDDEN = /[<>\n\r]/;

function cleanField(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export interface MailmapRuleInput {
  canonicalName?: unknown;
  canonicalEmail?: unknown;
  rawName?: unknown;
  rawEmail?: unknown;
}

/**
 * Validate API input into a serializable rule. Returns `{ rule }` or
 * `{ error }`. When no raw email is given, a canonical name + email form a
 * rename-only rule keyed on the canonical email (mailmap form 1).
 */
export function normalizeMailmapRule(
  input: MailmapRuleInput,
): { rule: Omit<MailmapRule, "line"> } | { error: string } {
  const canonicalName = cleanField(input.canonicalName);
  let canonicalEmail = cleanField(input.canonicalEmail);
  const rawName = cleanField(input.rawName);
  let rawEmail = cleanField(input.rawEmail);
  if (
    FORBIDDEN.test(canonicalName ?? "") ||
    FORBIDDEN.test(canonicalEmail ?? "") ||
    FORBIDDEN.test(rawName ?? "") ||
    FORBIDDEN.test(rawEmail ?? "")
  ) {
    return { error: "Names and emails must not contain <, > or newlines." };
  }
  if (!rawEmail) {
    if (!canonicalEmail || !canonicalName) {
      return {
        error:
          "Give the identity to merge (raw email) and a canonical name and/or email.",
      };
    }
    rawEmail = canonicalEmail;
    canonicalEmail = null; // rename-only rule
  }
  if (!canonicalName && !canonicalEmail) {
    return {
      error: "Give a canonical name and/or email for the merged identity.",
    };
  }
  return { rule: { canonicalName, canonicalEmail, rawName, rawEmail } };
}

/** Editable lines of a repo's .mailmap; empty when the file is absent. */
export async function readMailmapLines(
  repoPath: string,
): Promise<MailmapLine[]> {
  try {
    const content = await fs.readFile(
      path.join(repoPath, MAILMAP_FILE),
      "utf8",
    );
    return parseMailmapLines(content);
  } catch {
    return [];
  }
}

/** Write a repo's .mailmap from editable lines (rules keep their line text). */
export async function writeMailmapLines(
  repoPath: string,
  lines: MailmapLine[],
): Promise<void> {
  // A file ending in "\n" parses to a trailing empty line; without stripping
  // it here, every read-modify-write cycle would add one more blank line.
  const trimmed = [...lines];
  while (
    trimmed.length > 0 &&
    !isMailmapRule(trimmed[trimmed.length - 1]) &&
    trimmed[trimmed.length - 1].line.trim() === ""
  ) {
    trimmed.pop();
  }
  const content = trimmed.map((line) => line.line).join("\n");
  await fs.writeFile(
    path.join(repoPath, MAILMAP_FILE),
    content.length > 0 ? `${content}\n` : "",
    "utf8",
  );
}
