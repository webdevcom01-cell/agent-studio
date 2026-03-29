"""
GitHub Bridge MCP Server
=========================
Python FastMCP bridge that exposes GitHub CLI (gh) as structured MCP tools.
Part of the Autonomous DevOps Swarm — Agent Studio.

MCP Spec: 2025-11-25 (Streamable HTTP)
Requires: GITHUB_TOKEN env var, gh CLI installed

Port: 8002
"""

import os
import json
import subprocess
import shutil
import tempfile
import re
from pathlib import Path
from typing import Optional

from mcp.server.fastmcp import FastMCP

# ─── Server Init ─────────────────────────────────────────────────────────────

mcp = FastMCP(
    "gh-bridge",
    description="GitHub CLI bridge for the Autonomous DevOps Swarm. Provides repo cloning, file operations, branch management, and PR creation via the gh CLI. Requires GITHUB_TOKEN.",
    version="1.0.0",
)

# ─── Constants ────────────────────────────────────────────────────────────────

MAX_FILE_SIZE_KB = 50       # Max file read size
MAX_FILES_LIST = 500        # Max files returned from list
MAX_PATCH_FILES = 20        # Max files in a single commit
CLONE_DEPTH = 1             # Shallow clone (faster)
WORK_DIR = Path(os.environ.get("WORK_DIR", "/tmp/devops-swarm"))
MAX_CHARS = 9_000


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _gh(*args: str, check: bool = True, cwd: Optional[str] = None) -> subprocess.CompletedProcess:
    """Run gh CLI command with GITHUB_TOKEN from env."""
    token = os.environ.get("GITHUB_TOKEN", "")
    env = {**os.environ, "GH_TOKEN": token, "GITHUB_TOKEN": token}
    return subprocess.run(
        ["gh", *args],
        capture_output=True, text=True, check=check,
        env=env, cwd=cwd, timeout=120,
    )


def _git(*args: str, cwd: str, check: bool = True) -> subprocess.CompletedProcess:
    """Run git command in a directory."""
    token = os.environ.get("GITHUB_TOKEN", "")
    env = {**os.environ, "GIT_TERMINAL_PROMPT": "0"}
    if token:
        env["GIT_ASKPASS"] = "echo"
    return subprocess.run(
        ["git", *args],
        capture_output=True, text=True, check=check,
        env=env, cwd=cwd, timeout=120,
    )


def _parse_github_url(url: str) -> tuple[str, str]:
    """Extract owner/repo from GitHub URL."""
    url = url.strip().rstrip("/")
    # Handle: https://github.com/owner/repo, github.com/owner/repo, owner/repo
    match = re.search(r"github\.com[:/]([^/]+)/([^/.]+)", url)
    if match:
        return match.group(1), match.group(2).replace(".git", "")
    parts = url.split("/")
    if len(parts) >= 2:
        return parts[-2], parts[-1].replace(".git", "")
    raise ValueError(f"Cannot parse GitHub URL: {url}")


def _repo_dir(owner: str, repo: str) -> Path:
    return WORK_DIR / f"{owner}_{repo}"


def _truncate(s: str) -> str:
    if len(s) > MAX_CHARS:
        return s[:MAX_CHARS] + "\n[TRUNCATED]"
    return s


def _validate_token() -> Optional[str]:
    """Check GITHUB_TOKEN is set."""
    token = os.environ.get("GITHUB_TOKEN", "")
    if not token:
        return "GITHUB_TOKEN environment variable is not set. Set it before calling any tool."
    return None


# ─── Tool: validate_repo ──────────────────────────────────────────────────────

@mcp.tool()
def validate_repo(github_url: str) -> str:
    """
    Validate a GitHub repository URL and return metadata.
    Call this FIRST before any other tool to confirm the repo exists and is accessible.

    Args:
        github_url: Full GitHub URL (e.g. https://github.com/owner/repo)

    Returns:
        JSON with {owner, repo, full_name, description, language, stars, default_branch,
                   size_kb, is_private, topics, last_push}
    """
    err = _validate_token()
    if err:
        return json.dumps({"error": err})

    try:
        owner, repo = _parse_github_url(github_url)
    except ValueError as e:
        return json.dumps({"error": str(e)})

    try:
        result = _gh("api", f"repos/{owner}/{repo}")
        data = json.loads(result.stdout)
        return json.dumps({
            "owner": data["owner"]["login"],
            "repo": data["name"],
            "full_name": data["full_name"],
            "description": data.get("description", ""),
            "language": data.get("language", ""),
            "stars": data.get("stargazers_count", 0),
            "default_branch": data.get("default_branch", "main"),
            "size_kb": data.get("size", 0),
            "is_private": data.get("private", False),
            "topics": data.get("topics", []),
            "last_push": data.get("pushed_at", ""),
            "clone_url": data.get("clone_url", ""),
        }, indent=2)
    except subprocess.CalledProcessError as e:
        return json.dumps({"error": f"GitHub API error: {e.stderr}"})


# ─── Tool: clone_repo ─────────────────────────────────────────────────────────

@mcp.tool()
def clone_repo(github_url: str) -> str:
    """
    Clone a GitHub repository (shallow, depth=1) to the local work directory.
    Returns the local path and a summary of the project structure.
    Must be called before file_read, list_files, or create_branch.

    Args:
        github_url: Full GitHub URL

    Returns:
        JSON with {local_path, owner, repo, default_branch, package_json_exists,
                   tsconfig_exists, file_count, top_level_dirs}
    """
    err = _validate_token()
    if err:
        return json.dumps({"error": err})

    try:
        owner, repo = _parse_github_url(github_url)
    except ValueError as e:
        return json.dumps({"error": str(e)})

    WORK_DIR.mkdir(parents=True, exist_ok=True)
    local_path = _repo_dir(owner, repo)

    # Remove existing clone
    if local_path.exists():
        shutil.rmtree(local_path)

    # Get auth URL
    token = os.environ.get("GITHUB_TOKEN", "")
    clone_url = f"https://{token}@github.com/{owner}/{repo}.git" if token else f"https://github.com/{owner}/{repo}.git"

    try:
        subprocess.run(
            ["git", "clone", f"--depth={CLONE_DEPTH}", clone_url, str(local_path)],
            capture_output=True, text=True, check=True, timeout=300,
        )
    except subprocess.CalledProcessError as e:
        return json.dumps({"error": f"Clone failed: {e.stderr[:500]}"})

    # Analyze structure
    top_dirs = [d.name for d in local_path.iterdir() if d.is_dir() and not d.name.startswith(".")][:20]
    file_count = sum(1 for _ in local_path.rglob("*") if _.is_file() and "node_modules" not in str(_) and ".git" not in str(_))

    result = _git("branch", "--show-current", cwd=str(local_path), check=False)
    branch = result.stdout.strip() or "main"

    return json.dumps({
        "local_path": str(local_path),
        "owner": owner,
        "repo": repo,
        "current_branch": branch,
        "package_json_exists": (local_path / "package.json").exists(),
        "tsconfig_exists": (local_path / "tsconfig.json").exists(),
        "file_count": file_count,
        "top_level_dirs": top_dirs,
        "size_estimate_mb": round(file_count * 0.01, 2),
    }, indent=2)


# ─── Tool: list_files ─────────────────────────────────────────────────────────

@mcp.tool()
def list_files(github_url: str, pattern: str = "**/*.{ts,js,tsx,jsx,py,json}", exclude: str = "node_modules,.git,dist,build,.next") -> str:
    """
    List files in the cloned repository matching a glob pattern.
    Use to understand the project structure before reading specific files.

    Args:
        github_url: GitHub URL (repo must be cloned first via clone_repo)
        pattern: Glob pattern (default: all source files)
        exclude: Comma-separated directory names to exclude

    Returns:
        JSON with {files: string[], count: int, truncated: bool}
    """
    try:
        owner, repo = _parse_github_url(github_url)
    except ValueError as e:
        return json.dumps({"error": str(e)})

    local_path = _repo_dir(owner, repo)
    if not local_path.exists():
        return json.dumps({"error": "Repo not cloned. Call clone_repo first."})

    exclude_dirs = set(exclude.split(","))

    # Expand pattern (handle {ts,js} brace expansion manually)
    extensions = []
    if "{" in pattern:
        inner = re.search(r"\{([^}]+)\}", pattern)
        if inner:
            extensions = inner.group(1).split(",")
    else:
        ext = pattern.split(".")[-1]
        extensions = [ext]

    files = []
    for ext in extensions:
        for f in local_path.rglob(f"*.{ext.strip()}"):
            if any(excl in str(f) for excl in exclude_dirs):
                continue
            files.append(str(f).replace(str(local_path) + "/", ""))

    files = sorted(set(files))[:MAX_FILES_LIST]
    return json.dumps({
        "files": files,
        "count": len(files),
        "truncated": len(files) >= MAX_FILES_LIST,
        "local_path": str(local_path),
    }, indent=2)


# ─── Tool: read_file ──────────────────────────────────────────────────────────

@mcp.tool()
def read_file(github_url: str, file_path: str) -> str:
    """
    Read a file from the cloned repository.
    Use to get the current content of a file before writing a patch.

    Args:
        github_url: GitHub URL (repo must be cloned)
        file_path: Relative path from repo root (e.g. src/lib/auth.ts)

    Returns:
        JSON with {content: str, lines: int, size_kb: float, path: str}
    """
    try:
        owner, repo = _parse_github_url(github_url)
    except ValueError as e:
        return json.dumps({"error": str(e)})

    local_path = _repo_dir(owner, repo)
    full_path = local_path / file_path

    if not full_path.exists():
        return json.dumps({"error": f"File not found: {file_path}"})

    size_kb = full_path.stat().st_size / 1024
    if size_kb > MAX_FILE_SIZE_KB:
        return json.dumps({"error": f"File too large ({size_kb:.1f}KB > {MAX_FILE_SIZE_KB}KB limit). Use list_files to find smaller files."})

    try:
        content = full_path.read_text(encoding="utf-8", errors="replace")
    except Exception as e:
        return json.dumps({"error": f"Cannot read file: {e}"})

    return json.dumps({
        "path": file_path,
        "content": _truncate(content),
        "lines": content.count("\n") + 1,
        "size_kb": round(size_kb, 2),
    }, indent=2)


# ─── Tool: create_branch ──────────────────────────────────────────────────────

@mcp.tool()
def create_branch(github_url: str, branch_name: str) -> str:
    """
    Create a new Git branch in the cloned repository.
    Call this before committing any security fixes.
    Branch naming convention: security/auto-YYYYMMDD or security/fix-{description}

    Args:
        github_url: GitHub URL (repo must be cloned)
        branch_name: New branch name (e.g. security/auto-fixes-2026)

    Returns:
        JSON with {branch, base_branch, sha, created: bool}
    """
    try:
        owner, repo = _parse_github_url(github_url)
    except ValueError as e:
        return json.dumps({"error": str(e)})

    local_path = _repo_dir(owner, repo)
    if not local_path.exists():
        return json.dumps({"error": "Repo not cloned. Call clone_repo first."})

    # Validate branch name
    if not re.match(r"^[a-zA-Z0-9/_.-]+$", branch_name):
        return json.dumps({"error": f"Invalid branch name: {branch_name}. Use alphanumeric + /._- only."})

    try:
        # Get current SHA
        sha_result = _git("rev-parse", "HEAD", cwd=str(local_path))
        sha = sha_result.stdout.strip()

        base_result = _git("branch", "--show-current", cwd=str(local_path))
        base = base_result.stdout.strip()

        # Create and checkout branch
        _git("checkout", "-b", branch_name, cwd=str(local_path))

        return json.dumps({
            "branch": branch_name,
            "base_branch": base,
            "sha": sha,
            "created": True,
        }, indent=2)
    except subprocess.CalledProcessError as e:
        return json.dumps({"error": f"Branch creation failed: {e.stderr}"})


# ─── Tool: commit_patches ─────────────────────────────────────────────────────

@mcp.tool()
def commit_patches(github_url: str, patches: str, commit_message: str) -> str:
    """
    Write patched files to the cloned repo and create a Git commit.
    The patches parameter must be a JSON array of {path, content} objects.

    Args:
        github_url: GitHub URL (repo must be cloned and branch created)
        patches: JSON string array of [{path: str, content: str}] — patched file contents
        commit_message: Descriptive commit message (will be prefixed with 🔒 security:)

    Returns:
        JSON with {sha, files_changed, branch, success: bool}
    """
    try:
        owner, repo = _parse_github_url(github_url)
    except ValueError as e:
        return json.dumps({"error": str(e)})

    local_path = _repo_dir(owner, repo)
    if not local_path.exists():
        return json.dumps({"error": "Repo not cloned. Call clone_repo first."})

    # Parse patches
    try:
        patch_list = json.loads(patches)
        if not isinstance(patch_list, list):
            raise ValueError("patches must be a JSON array")
        if len(patch_list) > MAX_PATCH_FILES:
            return json.dumps({"error": f"Too many patches ({len(patch_list)} > {MAX_PATCH_FILES} max)"})
    except (json.JSONDecodeError, ValueError) as e:
        return json.dumps({"error": f"Invalid patches JSON: {e}"})

    try:
        files_written = []
        for patch in patch_list:
            rel_path = patch.get("path", "").lstrip("/")
            content = patch.get("content", "")
            if not rel_path:
                continue

            full_path = local_path / rel_path
            full_path.parent.mkdir(parents=True, exist_ok=True)
            full_path.write_text(content, encoding="utf-8")
            files_written.append(rel_path)

        if not files_written:
            return json.dumps({"error": "No files written"})

        # Configure git identity
        _git("config", "user.email", "devops-swarm@agent-studio.ai", cwd=str(local_path))
        _git("config", "user.name", "DevOps Swarm Bot", cwd=str(local_path))

        # Stage and commit
        _git("add", *files_written, cwd=str(local_path))
        full_msg = f"🔒 security: {commit_message}\n\nAutomated fix by Agent Studio DevOps Swarm\nFiles changed: {', '.join(files_written)}"
        _git("commit", "-m", full_msg, cwd=str(local_path))

        sha_result = _git("rev-parse", "HEAD", cwd=str(local_path))
        sha = sha_result.stdout.strip()

        branch_result = _git("branch", "--show-current", cwd=str(local_path))
        branch = branch_result.stdout.strip()

        return json.dumps({
            "sha": sha,
            "branch": branch,
            "files_changed": files_written,
            "file_count": len(files_written),
            "success": True,
        }, indent=2)

    except subprocess.CalledProcessError as e:
        return json.dumps({"error": f"Git commit failed: {e.stderr}"})


# ─── Tool: push_branch ────────────────────────────────────────────────────────

@mcp.tool()
def push_branch(github_url: str) -> str:
    """
    Push the current branch to GitHub remote.
    Call this after commit_patches and before create_pr.

    Args:
        github_url: GitHub URL

    Returns:
        JSON with {branch, remote_url, success: bool}
    """
    err = _validate_token()
    if err:
        return json.dumps({"error": err})

    try:
        owner, repo = _parse_github_url(github_url)
    except ValueError as e:
        return json.dumps({"error": str(e)})

    local_path = _repo_dir(owner, repo)
    if not local_path.exists():
        return json.dumps({"error": "Repo not cloned."})

    try:
        branch_result = _git("branch", "--show-current", cwd=str(local_path))
        branch = branch_result.stdout.strip()

        token = os.environ.get("GITHUB_TOKEN", "")
        remote_url = f"https://{token}@github.com/{owner}/{repo}.git"
        _git("remote", "set-url", "origin", remote_url, cwd=str(local_path))
        _git("push", "-u", "origin", branch, cwd=str(local_path))

        return json.dumps({
            "branch": branch,
            "remote_url": f"https://github.com/{owner}/{repo}/tree/{branch}",
            "success": True,
        }, indent=2)
    except subprocess.CalledProcessError as e:
        return json.dumps({"error": f"Push failed: {e.stderr}"})


# ─── Tool: create_pr ──────────────────────────────────────────────────────────

@mcp.tool()
def create_pr(github_url: str, title: str, body: str, draft: bool = False) -> str:
    """
    Create a GitHub Pull Request from the current branch to the default branch.
    Call push_branch BEFORE this tool.

    Args:
        github_url: GitHub URL
        title: PR title (will be prefixed with 🔒 [Security] automatically)
        body: PR description in Markdown — include findings summary, patches, and test results
        draft: Create as draft PR (default: False)

    Returns:
        JSON with {number, url, html_url, state, branch, base}
    """
    err = _validate_token()
    if err:
        return json.dumps({"error": err})

    try:
        owner, repo = _parse_github_url(github_url)
    except ValueError as e:
        return json.dumps({"error": str(e)})

    local_path = _repo_dir(owner, repo)

    try:
        branch_result = _git("branch", "--show-current", cwd=str(local_path))
        branch = branch_result.stdout.strip()

        full_title = f"🔒 [Security] {title}"
        full_body = f"{body}\n\n---\n*This PR was automatically generated by Agent Studio DevOps Swarm. Review all changes carefully before merging.*"

        args = ["pr", "create",
                "--title", full_title,
                "--body", full_body,
                "--head", branch,
                "--repo", f"{owner}/{repo}"]
        if draft:
            args.append("--draft")

        result = _gh(*args, cwd=str(local_path))

        # Extract PR URL from output
        pr_url = result.stdout.strip()

        # Get PR number from URL
        pr_number = pr_url.split("/")[-1] if pr_url else "?"

        return json.dumps({
            "number": pr_number,
            "url": pr_url,
            "html_url": pr_url,
            "state": "draft" if draft else "open",
            "branch": branch,
            "base": "main",
            "success": True,
        }, indent=2)

    except subprocess.CalledProcessError as e:
        return json.dumps({"error": f"PR creation failed: {e.stderr}"})


# ─── Tool: get_package_info ───────────────────────────────────────────────────

@mcp.tool()
def get_package_info(github_url: str) -> str:
    """
    Read and parse package.json from the cloned repo.
    Returns dependencies, devDependencies, scripts, and engines.
    Use to understand project structure before scanning.

    Args:
        github_url: GitHub URL (repo must be cloned)

    Returns:
        JSON with {name, version, dependencies, devDependencies, scripts, engines}
    """
    try:
        owner, repo = _parse_github_url(github_url)
    except ValueError as e:
        return json.dumps({"error": str(e)})

    local_path = _repo_dir(owner, repo)
    pkg_path = local_path / "package.json"

    if not pkg_path.exists():
        return json.dumps({"error": "No package.json found"})

    try:
        pkg = json.loads(pkg_path.read_text())
        return _truncate(json.dumps({
            "name": pkg.get("name"),
            "version": pkg.get("version"),
            "description": pkg.get("description", ""),
            "dependencies": pkg.get("dependencies", {}),
            "devDependencies": pkg.get("devDependencies", {}),
            "scripts": pkg.get("scripts", {}),
            "engines": pkg.get("engines", {}),
            "type": pkg.get("type", "commonjs"),
        }, indent=2))
    except Exception as e:
        return json.dumps({"error": str(e)})


# ─── Tool: health ─────────────────────────────────────────────────────────────

@mcp.tool()
def health() -> str:
    """Returns gh-bridge health status: gh CLI availability, token status, work dir."""
    checks = {}

    # gh CLI
    try:
        gh_ver = subprocess.run(["gh", "--version"], capture_output=True, text=True, timeout=5)
        checks["gh_cli"] = {"available": True, "version": gh_ver.stdout.split("\n")[0]}
    except FileNotFoundError:
        checks["gh_cli"] = {"available": False, "install": "https://cli.github.com"}

    # Token
    token = os.environ.get("GITHUB_TOKEN", "")
    checks["github_token"] = {"configured": bool(token), "length": len(token)}

    # Work dir
    WORK_DIR.mkdir(parents=True, exist_ok=True)
    checks["work_dir"] = {"path": str(WORK_DIR), "exists": True}

    return json.dumps({
        "status": "healthy" if checks["gh_cli"]["available"] and checks["github_token"]["configured"] else "degraded",
        "checks": checks,
        "config": {"max_file_size_kb": MAX_FILE_SIZE_KB, "clone_depth": CLONE_DEPTH, "mcp_spec": "2025-11-25"},
    }, indent=2)


# ─── Entry point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8002"))
    mcp.run(transport="streamable-http", host="0.0.0.0", port=port, path="/mcp")
