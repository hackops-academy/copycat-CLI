#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# CopyCat-CLI v1.0
# Mirror | Recon | Organize
# Author : Hackops-Academy
# File   : copycat-cli.sh
# Usage  : chmod +x copycat-cli.sh && ./copycat-cli.sh
# Note   : Use only on targets you are authorized to test.
# -----------------------------------------------------------------------------

set -euo pipefail
IFS=$'\n\t'

###########################
#  User Configurable Vars #
###########################
# Default wordlist (adjust to your environment)
DEFAULT_WORDLIST="/usr/share/wordlists/dirb/common.txt"
# Default polite settings for wget
WGET_WAIT="1"
WGET_RETRIES="3"
WGET_USERAGENT="CopyCat-CLI/1.0 (+https://example.com)"
# Where to store global config
CONFIG_FILE="$HOME/.copycatrc"

###########################
# Banner (user-chosen)
###########################
print_banner() {
cat <<'BANNER'

 ██████╗ ██████╗ ██████╗ ██╗   ██╗ ██████╗ █████╗ ████████╗    ██████╗██╗     ██╗
██╔════╝██╔═══██╗██╔══██╗╚██╗ ██╔╝██╔════╝██╔══██╗╚══██╔══╝   ██╔════╝██║     ██║
██║     ██║   ██║██████╔╝ ╚████╔╝ ██║     ███████║   ██║█████╗██║     ██║     ██║
██║     ██║   ██║██╔═══╝   ╚██╔╝  ██║     ██╔══██║   ██║╚════╝██║     ██║     ██║
╚██████╗╚██████╔╝██║        ██║   ╚██████╗██║  ██║   ██║      ╚██████╗███████╗██║
 ╚═════╝ ╚═════╝ ╚═╝        ╚═╝    ╚═════╝╚═╝  ╚═╝   ╚═╝       ╚═════╝╚══════╝╚═╝
                                                                                 

   /\_/\    [ CopyCat-CLI ]
  ( o.o )   Mirror | Recon | Organize
   > ^ <
  --------------------------------------
  Capture sites, extract JS, take notes
  --------------------------------------
  Made By Hackops-Academy
BANNER
}

###########################
# Helper functions
###########################
log()  { printf "[%s] %s\n" "$(date '+%F %T')" "$*"; }
err()  { printf "[%s] ERROR: %s\n" "$(date '+%F %T')" "$*" >&2; exit 1; }
pause(){ read -rp "Press ENTER to continue..."; }

detect_pkg_mgr() {
  if command -v apt-get >/dev/null 2>&1; then echo "apt-get"
  elif command -v apt >/dev/null 2>&1; then echo "apt"
  elif command -v pkg >/dev/null 2>&1; then echo "pkg"
  elif command -v pacman >/dev/null 2>&1; then echo "pacman"
  else echo "unknown"
  fi
}

ensure_dirs() {
  mkdir -p "$WORKDIR"/{mirror,assets,scans,logs,metadata,reports,plugins}
}

# safe normalize: accept domain or full url
normalize_target() {
  local t="$1"
  # if missing scheme, add http://
  if [[ ! "$t" =~ ^https?:// ]]; then
    t="http://$t"
  fi
  # strip trailing slash
  t="${t%/}"
  echo "$t"
}

sanitize_name() {
  local t="$1"
  # extract host
  local host
  host=$(echo "$t" | awk -F/ '{print $3?$3:$1}')
  # replace colon (ports) and other unsafe chars
  echo "$host" | sed 's/[:]/-/g'
}

# check and (optionally) install system packages
check_and_offer_install() {
  local -a needed=("$@")
  local -a missing=()
  for p in "${needed[@]}"; do
    if ! command -v "$p" >/dev/null 2>&1; then
      missing+=("$p")
    fi
  done
  if [ ${#missing[@]} -gt 0 ]; then
    log "Missing tools: ${missing[*]}"
    read -rp "Attempt automatic install of missing packages? [y/N]: " ans
    if [[ "$ans" =~ ^[Yy]$ ]]; then
      pm=$(detect_pkg_mgr)
      log "Using package manager: $pm"
      if [[ "$pm" == "apt" || "$pm" == "apt-get" ]]; then
        sudo "$pm" update && sudo "$pm" install -y "${missing[@]}"
      elif [[ "$pm" == "pkg" ]]; then
        pkg install -y "${missing[@]}"
      elif [[ "$pm" == "pacman" ]]; then
        sudo pacman -S --noconfirm "${missing[@]}"
      else
        err "Automatic install not supported for this OS. Please install: ${missing[*]}"
      fi
    else
      echo "Skipping automatic install. Missing: ${missing[*]}"
    fi
  else
    log "All system tools present."
  fi
}

# install go-based tools (if go present)
install_go_tool() {
  local pkg=$1
  if ! command -v go >/dev/null 2>&1; then
    log "Go not found; skipping go install for $pkg"
    return
  fi
  log "Installing go tool: $pkg"
  # allow specifying version suffix in pkg string
  if go install "$pkg" 2>/dev/null; then
    log "Installed $pkg into $(go env GOPATH 2>/dev/null)/bin (ensure \$GOPATH/bin in PATH)"
  else
    log "go install failed for $pkg (you may need to run manually)"
  fi
}

# write metadata JSON
write_metadata() {
  local mdfile="$WORKDIR/metadata/metadata.json"
  cat > "$mdfile" <<EOF
{
  "target": "$TARGET",
  "workspace": "$WORKDIR",
  "date": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "tools": {
    "wget_useragent": "$WGET_USERAGENT"
  }
}
EOF
}

###########################
# Core features
###########################
create_workspace() {
  local target="$1"
  local clean
  clean=$(sanitize_name "$target")
  TS=$(date '+%Y%m%d-%H%M%S')
  WORKDIR="${PWD}/${TS}_${clean}"
  ensure_dirs
  log "Created workspace: $WORKDIR"
  write_metadata
}

mirror_with_wget() {
  local url="$1"
  log "Starting wget mirror for $url (polite defaults)"
  local logf="$WORKDIR/logs/wget_$(date '+%Y%m%d%H%M%S').log"
  wget --mirror \
       --convert-links \
       --adjust-extension \
       --page-requisites \
       --no-parent \
       -e robots=off \
       --wait="$WGET_WAIT" \
       -t "$WGET_RETRIES" \
       --user-agent="$WGET_USERAGENT" \
       -P "$WORKDIR/mirror" \
       "$url" 2>&1 | tee "$logf"
  log "wget finished. Mirror saved under $WORKDIR/mirror"
}

mirror_with_httrack() {
  local url="$1"
  if ! command -v httrack >/dev/null 2>&1; then
    log "httrack not found; skip or install it"
    return 1
  fi
  log "Starting httrack mirror for $url"
  httrack "$url" --path "$WORKDIR/mirror" --verbose --continue 2>&1 | tee "$WORKDIR/logs/httrack_$(date '+%Y%m%d%H%M%S').log"
  log "httrack finished. Mirror saved under $WORKDIR/mirror"
}

extract_js_and_assets() {
  log "Extracting JS files and asset list"
  mkdir -p "$WORKDIR/metadata"
  # find JS files in mirror
  find "$WORKDIR/mirror" -type f -iname '*.js' > "$WORKDIR/metadata/js_list.txt" || true
  find "$WORKDIR/mirror" -type f \( -iname '*.png' -o -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.svg' -o -iname '*.css' \) > "$WORKDIR/metadata/assets_list.txt" || true
  # gather external JS links from downloaded HTMLs (grep for .js strings)
  grep -rhoI --exclude-dir=mirror 'src=["'\'']\([^"'\'' ]*\.js[^"'\'' ]*\)' "$WORKDIR/mirror" 2>/dev/null | sed -E "s/src=//'/" | sed -E "s/^['\"]//;s/['\"]$//" | sort -u > "$WORKDIR/metadata/js_refs.txt" || true
  log "JS list, assets list, and js_refs saved in metadata/"
}

run_gobuster_dirs() {
  local target_url="$1"
  local wordlist="${2:-$DEFAULT_WORDLIST}"
  if ! command -v gobuster >/dev/null 2>&1; then
    log "gobuster not found; skipping directory fuzzing"
    return
  fi
  log "Running gobuster dir scan on $target_url (wordlist: $wordlist)"
  gobuster dir -u "$target_url" -w "$wordlist" -o "$WORKDIR/scans/gobuster_dirs.txt" 2>&1 | tee "$WORKDIR/logs/gobuster_dirs.log"
}

run_ffuf_dirs() {
  local url="$1"
  local wordlist="${2:-$DEFAULT_WORDLIST}"
  if ! command -v ffuf >/dev/null 2>&1; then
    log "ffuf not found; skipping"
    return
  fi
  log "Running ffuf dir scan on $url (wordlist: $wordlist)"
  ffuf -u "${url}/FUZZ" -w "$wordlist" -o "$WORKDIR/scans/ffuf_dirs.json" -of json 2>&1 | tee "$WORKDIR/logs/ffuf_dirs.log"
}

run_subfinder_wayback_gau() {
  local host="$1"
  # subfinder
  if command -v subfinder >/dev/null 2>&1; then
    log "Running subfinder for $host"
    subfinder -d "$host" -silent > "$WORKDIR/scans/subdomains.txt" 2>"$WORKDIR/logs/subfinder.log" || true
  else
    log "subfinder missing; skipping subdomain enumeration"
  fi
  # waybackurls & gau
  if command -v waybackurls >/dev/null 2>&1; then
    log "Running waybackurls for $host"
    echo "$host" | waybackurls | sort -u > "$WORKDIR/scans/waybackurls.txt"
  else
    log "waybackurls missing; skipping"
  fi
  if command -v gau >/dev/null 2>&1; then
    log "Running gau for $host"
    gau "$host" | sort -u > "$WORKDIR/scans/gau.txt"
  else
    log "gau missing; skipping"
  fi
}

run_nmap_basic() {
  local host="$1"
  if ! command -v nmap >/dev/null 2>&1; then
    log "nmap not found; skipping nmap"
    return
  fi
  log "Running light nmap scan on $host"
  nmap -Pn -sV -p- --min-rate 1000 -oN "$WORKDIR/scans/nmap_full.txt" "$host" 2>&1 | tee "$WORKDIR/logs/nmap.log"
}

take_screenshots() {
  local url="$1"
  # prefer gowitness or aquatone
  if command -v gowitness >/dev/null 2>&1; then
    log "Taking screenshots with gowitness"
    gowitness single "$url" --destination "$WORKDIR/reports/screenshots" 2>&1 | tee "$WORKDIR/logs/gowitness.log" || true
  elif command -v aquatone >/dev/null 2>&1; then
    log "Taking screenshots with aquatone (via aquatone-discover/gather)"
    # simple use-case: echo url to aquatone
    mkdir -p "$WORKDIR/reports/screenshots"
    echo "$url" | aquatone -out "$WORKDIR/reports/screenshots" 2>&1 | tee "$WORKDIR/logs/aquatone.log" || true
  else
    log "No screenshot tool (gowitness/aquatone) installed; skipping screenshots"
  fi
}

generate_markdown_report() {
  local r="$WORKDIR/reports/report.md"
  cat > "$r" <<EOF
# CopyCat-CLI Report

**Target**: $TARGET  
**Workspace**: $WORKDIR  
**Date (UTC)**: $(date -u +"%Y-%m-%dT%H:%M:%SZ")

## Actions performed
- Mirror: $( [ -d "$WORKDIR/mirror" ] && echo "Yes" || echo "No" )
- JS extraction: $( [ -f "$WORKDIR/metadata/js_list.txt" ] && wc -l < "$WORKDIR/metadata/js_list.txt" || echo "0" ) files
- Subdomains found: $( [ -f "$WORKDIR/scans/subdomains.txt" ] && wc -l < "$WORKDIR/scans/subdomains.txt" || echo "0" )
- Wayback URLs: $( [ -f "$WORKDIR/scans/waybackurls.txt" ] && wc -l < "$WORKDIR/scans/waybackurls.txt" || echo "0" )
- Gau results: $( [ -f "$WORKDIR/scans/gau.txt" ] && wc -l < "$WORKDIR/scans/gau.txt" || echo "0" )
- Gobuster/ffuf results: $( [ -f "$WORKDIR/scans/gobuster_dirs.txt" ] && wc -l < "$WORKDIR/scans/gobuster_dirs.txt" || echo 0 )

## Files / Important artifacts
- Mirror contents: \`$WORKDIR/mirror\`
- JS list: \`$WORKDIR/metadata/js_list.txt\`
- External JS refs: \`$WORKDIR/metadata/js_refs.txt\`
- Assets list: \`$WORKDIR/metadata/assets_list.txt\`
- Subdomains: \`$WORKDIR/scans/subdomains.txt\`
- Waybackurls: \`$WORKDIR/scans/waybackurls.txt\`
- Gau: \`$WORKDIR/scans/gau.txt\`
- Nmap: \`$WORKDIR/scans/nmap_full.txt\`
- Screenshots: \`$WORKDIR/reports/screenshots\`

---

*Generated by CopyCat-CLI*
EOF
  log "Markdown report generated: $r"
  # quick HTML fallback (very minimal)
  local hr="$WORKDIR/reports/report.html"
  cat > "$hr" <<HTML
<!doctype html><html lang="en"><head><meta charset="utf-8"><title>CopyCat-CLI Report</title></head><body>
<h1>CopyCat-CLI Report</h1>
<p><strong>Target:</strong> $TARGET</p>
<p><strong>Workspace:</strong> $WORKDIR</p>
<p><strong>Date (UTC):</strong> $(date -u +"%Y-%m-%dT%H:%M:%SZ")</p>
<ul>
  <li>Mirror: $( [ -d "$WORKDIR/mirror" ] && echo "Yes" || echo "No" )</li>
  <li>JS files: $( [ -f "$WORKDIR/metadata/js_list.txt" ] && wc -l < "$WORKDIR/metadata/js_list.txt" || echo "0" )</li>
</ul>
<p>Artifacts are saved inside the workspace.</p>
</body></html>
HTML
  log "HTML report generated: $hr"
}

# plugin hook runner: any executable script in plugins/ will be run with workspace path as $1
run_plugins() {
  local plgdir="$WORKDIR/plugins"
  [ -d "$plgdir" ] || return
  for f in "$plgdir"/*; do
    if [ -x "$f" ]; then
      log "Running plugin: $f"
      "$f" "$WORKDIR" 2>&1 | tee -a "$WORKDIR/logs/plugins.log"
    fi
  done
}

###########################
# Menu & flow
###########################
main_menu() {
  while true; do
    clear
    print_banner
    echo
    echo "CopyCat-CLI Main Menu"
    echo "1) Quick mirror "
    echo "2) Mirror + Recon "
    echo "3) Mirror with httrack "
    echo "4) Install recommended tools "
    echo "5) Show last workspace path"
    echo "6) Exit"
    echo
    read -rp "Choose an option [1-6]: " choice
    case "$choice" in
      1) action_mirror_only ;;
      2) action_full_recon ;;
      3) action_httrack ;;
      4) action_install_tools ;;
      5) echo "Last workspace: ${WORKDIR:-<none>}"; pause ;;
      6) log "Exiting... "stay anonymous. stay legal"; exit 0 ;;
      *) echo "Invalid choice"; pause ;;
    esac
  done
}

action_mirror_only() {
  read -rp "Enter target (domain or full URL): " raw_target
  if [ -z "$raw_target" ]; then echo "No target"; pause; return; fi
  TARGET=$(normalize_target "$raw_target")
  create_workspace "$TARGET"
  # check basic tools
  check_and_offer_install wget curl
  mirror_with_wget "$TARGET"
  extract_js_and_assets
  generate_markdown_report
  run_plugins
  log "Task complete. Workspace: $WORKDIR"
  pause
}

action_full_recon() {
  read -rp "Enter target (domain or full URL): " raw_target
  if [ -z "$raw_target" ]; then echo "No target"; pause; return; fi
  TARGET=$(normalize_target "$raw_target")
  create_workspace "$TARGET"
  # system checks
  check_and_offer_install wget curl nmap jq
  # recommend go & go tools if missing
  # attempt to install go-based recon tools via go install if go exists
  if ! command -v subfinder >/dev/null 2>&1; then
    read -rp "Install common go-based recon tools (subfinder, waybackurls, gau)? [y/N]: " yn
    if [[ "$yn" =~ ^[Yy]$ ]]; then
      if ! command -v go >/dev/null 2>&1; then
        log "Go not detected. Installing go (if package manager supports it)..."
        pm=$(detect_pkg_mgr)
        if [[ "$pm" == "apt" || "$pm" == "apt-get" ]]; then
          sudo "$pm" update && sudo "$pm" install -y golang-go
        elif [[ "$pm" == "pkg" ]]; then
          pkg install -y golang
        else
          log "Please install Go manually and re-run the tool to auto-install go tools."
        fi
      fi
      # try go install
      install_go_tool "github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest"
      install_go_tool "github.com/tomnomnom/waybackurls@latest"
      install_go_tool "github.com/lc/gau/v2/cmd/gau@latest"
    fi
  fi

  # perform actions
  mirror_with_wget "$TARGET"
  extract_js_and_assets

  # run subfinder/wayback/gau on host (host only)
  host_only=$(echo "$TARGET" | awk -F/ '{print $3}')
  run_subfinder_wayback_gau "$host_only"

  # run directory discovery
  read -rp "Run directory discovery (gobuster/ffuf)? [y/N]: " dirq
  if [[ "$dirq" =~ ^[Yy]$ ]]; then
    read -rp "Enter wordlist path (default: $DEFAULT_WORDLIST): " w
    w="${w:-$DEFAULT_WORDLIST}"
    run_gobuster_dirs "$TARGET" "$w"
    run_ffuf_dirs "$TARGET" "$w"
  fi

  # nmap
  read -rp "Run quick nmap scan against host ($host_only)? [y/N]: " nmapq
  if [[ "$nmapq" =~ ^[Yy]$ ]]; then
    run_nmap_basic "$host_only"
  fi

  # screenshots
  read -rp "Take screenshots of target (requires gowitness/aquatone)? [y/N]: " shotq
  if [[ "$shotq" =~ ^[Yy]$ ]]; then
    take_screenshots "$TARGET"
  fi

  generate_markdown_report
  run_plugins
  log "Full recon complete. Workspace: $WORKDIR"
  pause
}

action_httrack() {
  read -rp "Enter target (full URL): " raw_target
  if [ -z "$raw_target" ]; then echo "No target"; pause; return; fi
  TARGET=$(normalize_target "$raw_target")
  create_workspace "$TARGET"
  check_and_offer_install httrack
  if mirror_with_httrack "$TARGET"; then
    extract_js_and_assets
    generate_markdown_report
    run_plugins
    log "httrack job finished. Workspace: $WORKDIR"
  else
    log "httrack failed or not installed"
  fi
  pause
}

action_install_tools() {
  log "Installing recommended system packages "
  read -rp "Proceed with system install? [y/N]: " ok
  if [[ ! "$ok" =~ ^[Yy]$ ]]; then echo "Skipping"; pause; return; fi
  pm=$(detect_pkg_mgr)
  if [[ "$pm" == "apt" || "$pm" == "apt-get" ]]; then
    sudo "$pm" update
    sudo "$pm" install -y wget httrack git nmap jq gobuster ffuf
  elif [[ "$pm" == "pkg" ]]; then
    pkg update
    pkg install -y wget git nmap jq
    echo "Install extra tools (gobuster/ffuf) manually if needed."
  else
    echo "Unsupported package manager. Install tools manually."
  fi
  # go tools prompt
  read -rp "Install go-based recon tools (subfinder, waybackurls, gau)? [y/N]: " goq
  if [[ "$goq" =~ ^[Yy]$ ]]; then
    install_go_tool "github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest"
    install_go_tool "github.com/tomnomnom/waybackurls@latest"
    install_go_tool "github.com/lc/gau/v2/cmd/gau@latest"
  fi
  log "Tool installation step attempted. Review output above for errors."
  pause
}

###########################
# Startup: load config if present
###########################
if [ -f "$CONFIG_FILE" ]; then
  # source config (careful)
  # shellcheck disable=SC1090
  source "$CONFIG_FILE"
fi

# Show banner then launch menu
clear
print_banner
echo
log "Welcome to CopyCat-CLI. Remember: run only on authorized targets."
main_menu

# EOF
