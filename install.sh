#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# CopyCat GUI v3.0 — install.sh
# Sets up Node deps, checks for wget/nmap, and (on Linux) creates a desktop
# launcher so the app shows up like any other installed application.
# HackOps Academy — Use only on targets you are authorized to test.
# -----------------------------------------------------------------------------
set -euo pipefail

NC='\033[0m'
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'

log()  { echo -e "${BLUE}[${WHITE}*${BLUE}]${NC} $*"; }
info() { echo -e "${GREEN}[+]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
err()  { echo -e "${RED}[X]${NC} $*"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo -e "${CYAN}"
cat << 'BANNER'
 ██████╗ ██████╗ ██████╗ ██╗   ██╗ ██████╗ █████╗ ████████╗   ██████╗ ██╗   ██╗██╗
██╔════╝██╔═══██╗██╔══██╗╚██╗ ██╔╝██╔════╝██╔══██╗╚══██╔══╝  ██╔════╝ ██║   ██║██║
██║     ██║   ██║██████╔╝ ╚████╔╝ ██║     ███████║   ██║     ██║  ███╗██║   ██║██║
██║     ██║   ██║██╔═══╝   ╚██╔╝  ██║     ██╔══██║   ██║     ██║   ██║██║   ██║██║
╚██████╗╚██████╔╝██║        ██║   ╚██████╗██║  ██║   ██║     ╚██████╔╝╚██████╔╝██║
 ╚═════╝ ╚═════╝ ╚═╝        ╚═╝    ╚═════╝╚═╝  ╚═╝   ╚═╝      ╚═════╝  ╚═════╝ ╚═╝
                                 [ GUI-SETUP v3.0 ]
      Made by Hackops Academy | _hack_ops_
BANNER
echo -e "${NC}"

OS="unknown"
PKG=""
case "$(uname -s)" in
  Linux)
    OS="linux"
    if command -v apt-get >/dev/null 2>&1; then PKG="apt"
    elif command -v dnf >/dev/null 2>&1; then PKG="dnf"
    elif command -v pacman >/dev/null 2>&1; then PKG="pacman"
    fi
    ;;
  Darwin) OS="mac" ;;
  MINGW*|MSYS*|CYGWIN*) OS="windows" ;;
esac
info "Detected OS: ${WHITE}$OS${NC}${PKG:+ (package manager: $PKG)}"

install_pkgs() {
  # $@ = package names for this OS's manager
  case "$PKG" in
    apt)    sudo apt-get update -qq && sudo apt-get install -y "$@" ;;
    dnf)    sudo dnf install -y "$@" ;;
    pacman) sudo pacman -Sy --noconfirm "$@" ;;
    *)
      if [ "$OS" = "mac" ] && command -v brew >/dev/null 2>&1; then
        brew install "$@"
      else
        warn "No supported package manager found — install manually: $*"
        return 1
      fi
      ;;
  esac
}

# ----------------- Node.js -----------------
if command -v node >/dev/null 2>&1; then
  info "Node.js found: $(node -v)"
else
  warn "Node.js not found."
  read -r -p "Install Node.js now? [Y/n] " ans
  if [[ "${ans:-Y}" =~ ^[Yy]?$ ]]; then
    case "$OS" in
      linux) install_pkgs nodejs npm || err "Could not install Node.js automatically. Get it from https://nodejs.org" ;;
      mac)   install_pkgs node || err "Could not install Node.js automatically. Get it from https://nodejs.org" ;;
      *)     err "Please install Node.js 18+ from https://nodejs.org, then re-run this script." ;;
    esac
  else
    err "Node.js is required. Install it from https://nodejs.org and re-run."
  fi
fi

command -v node >/dev/null 2>&1 || err "Node.js install failed — install it manually from https://nodejs.org"

# ----------------- wget -----------------
if command -v wget >/dev/null 2>&1; then
  info "wget found."
else
  warn "wget not found (required for the Mirror tab)."
  case "$OS" in
    linux) install_pkgs wget || warn "Install wget manually to use the Mirror tab." ;;
    mac)   install_pkgs wget || warn "Install wget manually to use the Mirror tab." ;;
    *)     warn "Install wget manually and add it to PATH to use the Mirror tab." ;;
  esac
fi

# ----------------- nmap (optional) -----------------
if command -v nmap >/dev/null 2>&1; then
  info "nmap found (port-scan option available)."
else
  warn "nmap not found — the optional port-scan checkbox in Recon will be skipped until it's installed."
  read -r -p "Install nmap now? [y/N] " ans
  if [[ "${ans:-N}" =~ ^[Yy]$ ]]; then
    install_pkgs nmap || warn "nmap install failed — you can skip it, port scan just won't be available."
  fi
fi

# ----------------- npm install -----------------
log "Installing app dependencies (electron, vis-network)..."
npm install
info "Dependencies installed."

# ----------------- Linux desktop launcher -----------------
if [ "$OS" = "linux" ] && [ -d "$HOME/.local/share/applications" ]; then
  read -r -p "Add a CopyCat GUI entry to your applications menu? [Y/n] " ans
  if [[ "${ans:-Y}" =~ ^[Yy]?$ ]]; then
    LAUNCHER="$HOME/.local/bin/copycat-gui"
    mkdir -p "$HOME/.local/bin"
    cat > "$LAUNCHER" << EOF
#!/usr/bin/env bash
cd "$SCRIPT_DIR"
exec npm start --silent
EOF
    chmod +x "$LAUNCHER"

    DESKTOP_FILE="$HOME/.local/share/applications/copycat-gui.desktop"
    cat > "$DESKTOP_FILE" << EOF
[Desktop Entry]
Type=Application
Name=CopyCat GUI
Comment=Mirror | Recon | Mindmap — HackOps Academy
Exec=$LAUNCHER
Icon=$SCRIPT_DIR/build/icon.png
Terminal=false
Categories=Utility;Security;
EOF
    info "Launcher created: ${WHITE}$DESKTOP_FILE${NC}"
    info "You may need to log out/in (or run 'update-desktop-database ~/.local/share/applications') for it to appear."
  fi
fi

echo -e "${CYAN}---------------------------------------------------------------${NC}"
info "Setup complete."
echo -e "  Run it with: ${WHITE}npm start${NC}  (or the app launcher, if you added one)"
echo -e "  Build a standalone app: ${WHITE}npm run dist:linux${NC} / ${WHITE}dist:win${NC} / ${WHITE}dist:mac${NC}"
echo -e "${CYAN}---------------------------------------------------------------${NC}"
