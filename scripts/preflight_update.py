"""Report whether clicking Update in Pinokio is safe, without changing anything.

This checkout carries local commits on top of upstream Blizaine/Maestro -- the
conda runtime pin in launcher_profile.js, the NVFP4 compile-graph fix, Director
clip checkpointing -- so `git pull` is a real merge that can conflict rather
than a guaranteed fast-forward. This script answers "will it merge cleanly?"
before anyone finds out the slow way.

Read-only. The single mutating call is `git fetch`, which updates
remote-tracking refs only (refs/remotes/origin/*); the working tree, the index,
and local branches are never touched. The merge is simulated with
`git merge-tree --write-tree`, which resolves entirely in the object database.

Usage:
    python scripts/preflight_update.py
    python scripts/preflight_update.py --against <ref>   # simulate against any ref

Exit codes:
    0  safe -- a normal Update will merge cleanly (or there is nothing new)
    1  needs a hand-merge -- conflicts, or uncommitted work in the way
    2  could not determine (network, git error)
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
DEFAULT_REMOTE_BRANCH = "origin/main"

# Launcher files this install deliberately diverges from upstream on. A conflict
# in one of these is expected-and-routine rather than a sign something is wrong,
# so call it out separately from a conflict in application code.
PINNED_LAUNCHERS = {
    "install.js",
    "launcher_profile.js",
    "pinokio.js",
    "reset.js",
    "sam_install.js",
    "sol_install.js",
    "start.js",
    "start_classic.js",
    "start_sol.js",
    "torch.js",
    "update.js",
}


def git(*args: str, check: bool = True) -> str:
    result = subprocess.run(
        ["git", *args],
        cwd=REPO,
        capture_output=True,
        text=True,
    )
    if check and result.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)} failed:\n{result.stderr.strip()}")
    return result.stdout.strip()


def rule(title: str) -> None:
    print(f"\n{title}\n{'-' * len(title)}")


def main(argv: list[str]) -> int:
    remote_branch = DEFAULT_REMOTE_BRANCH
    if "--against" in argv:
        index = argv.index("--against")
        if index + 1 >= len(argv):
            print("error: --against needs a ref")
            return 2
        remote_branch = argv[index + 1]

    try:
        git("rev-parse", "--git-dir")
    except RuntimeError as exc:
        print(f"Not a git repository: {exc}")
        return 2

    print(f"Repository: {REPO}")
    if remote_branch != DEFAULT_REMOTE_BRANCH:
        print(f"Comparing against: {remote_branch} (not the usual upstream)")

    # --- local state -----------------------------------------------------
    rule("Local state")
    branch = git("rev-parse", "--abbrev-ref", "HEAD")
    version_file = REPO / "VERSION"
    version = version_file.read_text().strip() if version_file.exists() else "(none)"
    print(f"branch:  {branch}")
    print(f"VERSION: {version}")

    dirty = git("status", "--porcelain")
    tracked_dirty = [
        line for line in dirty.splitlines() if not line.startswith("??")
    ]
    untracked = [line for line in dirty.splitlines() if line.startswith("??")]
    if tracked_dirty:
        print(f"uncommitted changes to {len(tracked_dirty)} tracked file(s):")
        for line in tracked_dirty[:10]:
            print(f"    {line}")
        if len(tracked_dirty) > 10:
            print(f"    ... and {len(tracked_dirty) - 10} more")
    else:
        print("working tree: clean (no uncommitted tracked changes)")
    if untracked:
        print(f"untracked files: {len(untracked)} (ignored by the merge)")

    # --- upstream --------------------------------------------------------
    rule("Upstream")
    # Only refresh remote-tracking refs when the comparison actually targets a
    # remote; --against a local branch needs no network round-trip.
    if remote_branch.startswith("origin/"):
        try:
            git("fetch", "origin")
        except RuntimeError as exc:
            print(f"Could not reach the remote: {exc}")
            return 2

    behind = git("rev-list", "--count", f"HEAD..{remote_branch}")
    ahead = git("rev-list", "--count", f"{remote_branch}..HEAD")
    print(f"local commits not upstream: {ahead}")
    print(f"new upstream commits:       {behind}")

    if behind == "0":
        print("\nRESULT: nothing new upstream. Update is safe; it will no-op.")
        return 0

    print("\nwhat's new:")
    for line in git("log", "--oneline", f"HEAD..{remote_branch}").splitlines()[:20]:
        print(f"    {line}")

    # --- simulated merge -------------------------------------------------
    rule("Simulated merge (nothing is written to the working tree)")
    result = subprocess.run(
        ["git", "merge-tree", "--write-tree", "--name-only", "HEAD", remote_branch],
        cwd=REPO,
        capture_output=True,
        text=True,
    )
    # merge-tree exits 0 on a clean merge and 1 when there are conflicts;
    # anything else is a real error.
    if result.returncode not in (0, 1):
        print(f"merge-tree failed:\n{result.stderr.strip()}")
        return 2

    conflicts: list[str] = []
    if result.returncode == 1:
        # Output is: <tree-oid>\n<conflicted paths...>\n\n<informational messages>
        body = result.stdout.split("\n\n", 1)[0].splitlines()
        conflicts = [line.strip() for line in body[1:] if line.strip()]

    # A file that is both locally modified and changed upstream aborts the pull
    # before the merge even starts, which is a different failure than a conflict.
    blocked: list[str] = []
    if tracked_dirty:
        changed_upstream = set(
            git("diff", "--name-only", "HEAD", remote_branch).splitlines()
        )
        for line in tracked_dirty:
            path = line[3:].strip()
            if path in changed_upstream:
                blocked.append(path)

    if blocked:
        print("uncommitted files that upstream also changed:")
        for path in blocked:
            print(f"    {path}")
        print("  -> git pull will abort before merging. Commit or stash these first.")
    if conflicts:
        launcher_hits = sorted(c for c in conflicts if c in PINNED_LAUNCHERS)
        other_hits = sorted(c for c in conflicts if c not in PINNED_LAUNCHERS)
        print(f"{len(conflicts)} file(s) would conflict:")
        for path in launcher_hits:
            print(f"    {path}  (pinned launcher -- expected, routine hand-merge)")
        for path in other_hits:
            print(f"    {path}  (application code -- review this one carefully)")
    if not conflicts and not blocked:
        print("no conflicts: the merge resolves cleanly.")

    # --- runtime ---------------------------------------------------------
    rule("Runtime markers")
    for name in (".maestro_torch_rtx50_v2.installed", ".maestro_flash_2_8_3_v1.installed"):
        marker = REPO / "app" / "env" / name
        print(f"{'present' if marker.exists() else 'MISSING'}  app/env/{name}")
    print("(both must exist or Update will reinstall the CUDA 13 runtime)")

    # --- verdict ---------------------------------------------------------
    rule("Verdict")
    if blocked or conflicts:
        print("NOT SAFE to click Update unattended.")
        print("update.js will stop at the failed pull rather than build over it,")
        print("so nothing breaks -- but the merge needs doing by hand first.")
        return 1

    print("SAFE: click Update. The pull merges cleanly, then dependencies")
    print("install and the UI rebuilds as normal.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv[1:]))
    except RuntimeError as exc:
        print(f"error: {exc}")
        sys.exit(2)
