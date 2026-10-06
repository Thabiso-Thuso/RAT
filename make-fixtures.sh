#!/usr/bin/env bash
# Build fixtures for Feature 1 testing (not part of the app).
set -euo pipefail

FIXTURES=/home/vmuser/RAT/.fixtures
rm -rf "$FIXTURES"
mkdir -p "$FIXTURES"

export GIT_CONFIG_GLOBAL=/dev/null   # deterministic author config

# 1. sample-repo: 3 commits by 2 authors (default branch "main")
git init -q -b main "$FIXTURES/sample-repo"
cd "$FIXTURES/sample-repo"
echo "one" > a.txt
git add a.txt
GIT_AUTHOR_NAME="Alice" GIT_AUTHOR_EMAIL="alice@example.com" \
GIT_COMMITTER_NAME="Alice" GIT_COMMITTER_EMAIL="alice@example.com" \
  git commit -qm "commit 1 by Alice"
echo "two" > b.txt
git add b.txt
GIT_AUTHOR_NAME="Bob" GIT_AUTHOR_EMAIL="bob@example.com" \
GIT_COMMITTER_NAME="Bob" GIT_COMMITTER_EMAIL="bob@example.com" \
  git commit -qm "commit 2 by Bob"
echo "three" > c.txt
git add c.txt
GIT_AUTHOR_NAME="Alice" GIT_AUTHOR_EMAIL="alice@example.com" \
GIT_COMMITTER_NAME="Alice" GIT_COMMITTER_EMAIL="alice@example.com" \
  git commit -qm "commit 3 by Alice"
cd "$FIXTURES"
zip -qr sample-repo.zip sample-repo
echo "sample-repo commits: $(git -C sample-repo rev-list --count HEAD)"

# 2. worktree-pointer (POSITIVE variant): .git is a pointer file whose target
#    is a self-contained git dir nested inside the same single top folder.
git init -q -b main "$FIXTURES/ptr-main"
cd "$FIXTURES/ptr-main"
echo "one" > one.txt
git add one.txt
GIT_AUTHOR_NAME="Carol" GIT_AUTHOR_EMAIL="carol@example.com" \
GIT_COMMITTER_NAME="Carol" GIT_COMMITTER_EMAIL="carol@example.com" \
  git commit -qm "ptr commit 1"
echo "two" > two.txt
git add two.txt
GIT_AUTHOR_NAME="Dave" GIT_AUTHOR_EMAIL="dave@example.com" \
GIT_COMMITTER_NAME="Dave" GIT_COMMITTER_EMAIL="dave@example.com" \
  git commit -qm "ptr commit 2"
mkdir "$FIXTURES/ptr-bundle/checkout" 2>/dev/null || mkdir -p "$FIXTURES/ptr-bundle/checkout"
cp -r .git "$FIXTURES/ptr-bundle/checkout/.repo-data"
git archive main | tar -x -C "$FIXTURES/ptr-bundle/checkout"
cd "$FIXTURES/ptr-bundle/checkout"
printf 'gitdir: .repo-data\n' > .git
cd "$FIXTURES"
zip -qr worktree-rel.zip ptr-bundle
echo "worktree-rel pointer: $(cat ptr-bundle/checkout/.git)"
echo "worktree-rel commits: $(git -C "$FIXTURES/ptr-main" rev-list --count HEAD)"

# 3. real `git worktree` zip (NEGATIVE variant): pointer is absolute and its
#    git dir (objects shared with main repo) is not in the zip.
git init -q -b main "$FIXTURES/worktree-main"
cd "$FIXTURES/worktree-main"
echo "base" > base.txt
git add base.txt
GIT_AUTHOR_NAME="Carol" GIT_AUTHOR_EMAIL="carol@example.com" \
GIT_COMMITTER_NAME="Carol" GIT_COMMITTER_EMAIL="carol@example.com" \
  git commit -qm "initial"
git worktree add -q "$FIXTURES/wt-checkout" -b feature-branch
cd "$FIXTURES"
zip -qr worktree-abs.zip wt-checkout
echo "worktree-abs pointer: $(cat wt-checkout/.git)"

# 4. non-git folder zip
mkdir -p "$FIXTURES/plain-folder"
echo "just text" > "$FIXTURES/plain-folder/notes.txt"
cd "$FIXTURES"
zip -qr plain.zip plain-folder

# 5. truly empty zip (zero entries)
python3 -c "import zipfile; zipfile.ZipFile('$FIXTURES/empty.zip', 'w').close()"

# 6. mailmap-repo: 5 commits by 5 raw identities that merge onto 3 canonical
#    authors (form 1 name fixes, form 3 email remap, form 4 name+email, unmapped)
git init -q -b main "$FIXTURES/mailmap-repo"
cd "$FIXTURES/mailmap-repo"
cat > .mailmap <<'EOF'
Jane Doe <jane@example.com>
Jane Doe <jane@example.com> <jane@laptop.example>
Jane Doe <jane@example.com> Jane D. <jane@desktop.example>
Joe R. Developer <joe@example.com>
EOF
git add .mailmap
mm_commit() {  # name email message file
  echo "$4 content" > "$4"
  git add "$4"
  GIT_AUTHOR_NAME="$1" GIT_AUTHOR_EMAIL="$2" \
  GIT_COMMITTER_NAME="$1" GIT_COMMITTER_EMAIL="$2" \
    git commit -qm "$3"
}
mm_commit "Jane Doe" "jane@laptop.example" "commit 1 by laptop jane" one.txt
mm_commit "Jane D." "jane@desktop.example" "commit 2 by Jane D." two.txt
mm_commit "jane" "jane@example.com" "commit 3 by lowercase jane" three.txt
mm_commit "Joe Developer" "joe@example.com" "commit 4 by Joe" four.txt
mm_commit "Unmapped User" "unmapped@example.com" "commit 5 unmapped" five.txt
cd "$FIXTURES"
zip -qr mailmap-repo.zip mailmap-repo
echo "mailmap-repo canonical authors:"
git -C mailmap-repo log --format='%aN <%aE>' | sort | uniq -c

echo "---- fixtures ready ----"
ls -la "$FIXTURES"/*.zip
