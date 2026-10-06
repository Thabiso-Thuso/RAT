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
