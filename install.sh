#!/usr/bin/env bash
# claude-free installer for macOS / Linux / WSL / Git Bash.
# Run:  curl -fsSL https://raw.githubusercontent.com/haonguyenstech/claude-free/main/install.sh | bash
set -e

BASE="${CLAUDE_FREE_BASE:-https://raw.githubusercontent.com/haonguyenstech/claude-free/main}"
DIR="$HOME/.claude-free"
BIN="$HOME/.local/bin"
mkdir -p "$DIR" "$BIN"
echo "Installing claude-free to $DIR"

# 1) Node.js required
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required. Install it from https://nodejs.org and re-run." >&2
  exit 1
fi

# 2) program files (use local copies if present next to this script, else download)
SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || true)"
for f in claude-proxy.js claude-free.js; do
  if [ -n "$SELF_DIR" ] && [ -f "$SELF_DIR/$f" ]; then cp "$SELF_DIR/$f" "$DIR/$f"
  else echo "  downloading $f"; curl -fsSL "$BASE/$f" -o "$DIR/$f"; fi
done

# 3) launcher shim
printf '#!/usr/bin/env bash\nexec node "%s/claude-free.js" "$@"\n' "$DIR" > "$BIN/claude-free"
chmod +x "$BIN/claude-free"

# 4) Claude Code CLI
if ! command -v claude >/dev/null 2>&1; then
  echo "Claude Code CLI not found - installing globally via npm..."
  npm install -g @anthropic-ai/claude-code || echo "(could not auto-install; run: npm install -g @anthropic-ai/claude-code)"
fi

# 5) PATH hint
case ":$PATH:" in
  *":$BIN:"*) ;;
  *) echo "Add this to your shell rc:  export PATH=\"$BIN:\$PATH\"";;
esac

echo ""
echo "Done. Run:  claude-free"
