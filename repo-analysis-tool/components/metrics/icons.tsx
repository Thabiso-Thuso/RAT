import Link from "next/link";

/**
 * Metric-category icons and navigation. Pure presentational (no hooks), so
 * they render inside server components.
 */

interface IconProps {
  className?: string;
}

function Svg({ className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className ?? "h-4 w-4"}
    >
      {children}
    </svg>
  );
}

/** Document with folded corner. */
export function FileIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 17h6" />
    </Svg>
  );
}

/** Folder. */
export function DirectoryIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </Svg>
  );
}

/** Archive box (the repository as a whole). */
export function RepoIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M4 8h16v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
      <path d="M3 4h18v4H3z" />
      <path d="M10 12h4" />
    </Svg>
  );
}

/** Person (author). */
export function AuthorIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </Svg>
  );
}

/** Commit set: three commits on a line. */
export function CommitSetIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="5" cy="12" r="2.2" />
      <circle cx="12" cy="12" r="2.2" />
      <circle cx="19" cy="12" r="2.2" />
      <path d="M7.2 12h2.6M14.2 12h2.6" />
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// Navigation models
// ---------------------------------------------------------------------------

export interface MetricCategory {
  key: "overview" | "files" | "directories" | "authors" | "commit-sets";
  label: string;
  /** Tooltip describing the metric category. */
  title: string;
  Icon: (props: IconProps) => React.ReactNode;
  href: (repoId: string) => string;
}

export const METRIC_CATEGORIES: MetricCategory[] = [
  {
    key: "overview",
    label: "Repo",
    title: "Repository metrics (root directory)",
    Icon: RepoIcon,
    href: (repoId) => `/repos/${repoId}/metrics`,
  },
  {
    key: "files",
    label: "Files",
    title: "File metrics: l+, l-, growth, churn, modifications, ownership",
    Icon: FileIcon,
    href: (repoId) => `/repos/${repoId}/metrics/files`,
  },
  {
    key: "directories",
    label: "Directories",
    title: "Directory metrics: sums over immediate files and subdirectories",
    Icon: DirectoryIcon,
    href: (repoId) => `/repos/${repoId}/metrics/directories`,
  },
  {
    key: "authors",
    label: "Authors",
    title: "Author metrics: commits, churn and ownership per canonical author",
    Icon: AuthorIcon,
    href: (repoId) => `/repos/${repoId}/metrics/authors`,
  },
  {
    key: "commit-sets",
    label: "Commit sets",
    title: "Commit-set metrics: H(t) and H(i,j) with n, eta, rho",
    Icon: CommitSetIcon,
    href: (repoId) => `/repos/${repoId}/metrics/commit-sets`,
  },
];

/** Tab bar for the metrics section layout. */
export function MetricNav({
  repoId,
  active,
}: {
  repoId: string;
  active: MetricCategory["key"];
}) {
  return (
    <nav className="flex flex-wrap gap-1.5">
      {METRIC_CATEGORIES.map(({ key, label, title, Icon, href }) => {
        const isActive = key === active;
        return (
          <Link
            key={key}
            href={href(repoId)}
            title={title}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              isActive
                ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Compact icon-only links for the repositories table row. */
export function MetricsIconLinks({
  repoId,
  analyzed,
}: {
  repoId: string;
  analyzed: boolean;
}) {
  if (!analyzed) {
    return (
      <span
        className="inline-flex items-center gap-1 text-zinc-300 dark:text-zinc-700"
        title="Metrics become available once history analysis completes"
      >
        {METRIC_CATEGORIES.map(({ key, Icon }) => (
          <Icon key={key} className="h-4 w-4" />
        ))}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      {METRIC_CATEGORIES.map(({ key, title, Icon, href }) => (
        <Link
          key={key}
          href={href(repoId)}
          title={`${title}`}
          className="rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
        >
          <Icon className="h-4 w-4" />
        </Link>
      ))}
    </span>
  );
}
