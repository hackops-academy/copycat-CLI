#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# CopyCat-CLI v2.0
# Mirror | Recon | Organize
# Author : Hackops-Academy
# File   : copycat-cli.sh
# Note   : Use only on targets you are authorized to test.
# -----------------------------------------------------------------------------

set -euo pipefail

# ----------------- COLORS & THEME -----------------
NC='\033[0m'
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'

# ----------------- ENV DETECTION -----------------
IS_TERMUX=false
[[ "$PREFIX" == *"/com.termux"* ]] && IS_TERMUX=true

# ----------------- CONFIG -----------------
WGET_USERAGENT="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"
DEFAULT_WL="/usr/share/wordlists/dirb/common.txt"
[ "$IS_TERMUX" = true ] && DEFAULT_WL="$HOME/common.txt"

# ----------------- UI COMPONENTS -----------------
print_banner() {
    clear
    echo -e "${CYAN}"
    cat << 'BANNER'
 ██████╗ ██████╗ ██████╗ ██╗   ██╗ ██████╗ █████╗ ████████╗   
██╔════╝██╔═══██╗██╔══██╗╚██╗ ██╔╝██╔════╝██╔══██╗╚══██╔══╝   
██║     ██║   ██║██████╔╝ ╚████╔╝ ██║     ███████║   ██║      
██║     ██║   ██║██╔═══╝   ╚██╔╝  ██║     ██╔══██║   ██║      
╚██████╗╚██████╔╝██║        ██║   ╚██████╗██║  ██║   ██║      
 ╚═════╝ ╚═════╝ ╚═╝        ╚═╝    ╚═════╝╚═╝  ╚═╝   ╚═╝      
                                 [ CLI-MIRROR v2.0 ]

     Made by Hackops Academy | _hack_ops_
BANNER
    echo -e "${BLUE}  >> OS:${WHITE} $([ "$IS_TERMUX" = true ] && echo "Termux" || echo "Kali/Linux")"
    echo -e "${BLUE}  >> Mode:${WHITE} Human-Readable Mirroring Enabled${NC}"
    echo -e "${CYAN}---------------------------------------------------------------${NC}"
}

log() { echo -e "${BLUE}[${WHITE}*${BLUE}]${NC} $*"; }
info() { echo -e "${GREEN}[+]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
err() { echo -e "${RED}[X]${NC} $*"; exit 1; }

# ----------------- SYSTEM CHECK -----------------
init_system() {
    local pkgs=(wget curl git nmap jq)
    if [ "$IS_TERMUX" = true ]; then
        pkg install -y "${pkgs[@]}" python nodejs
    else
        sudo apt update && sudo apt install -y "${pkgs[@]}"
    fi
    
    # Auto-download wordlist for Termux if missing
    if [ "$IS_TERMUX" = true ] && [ ! -f "$DEFAULT_WL" ]; then
        log "Downloading common wordlist for Termux..."
        curl -s https://raw.githubusercontent.com/v0re/dirb/master/wordlists/common.txt -o "$DEFAULT_WL"
    fi
}

# ----------------- HUMAN READABLE FORMATTER -----------------
make_human_readable() {
    local dir="$1"
    info "Organizing mirror into human-readable format..."
    
    cd "$dir" || return
    mkdir -p assets/{css,js,images,fonts}

    # 1. Clean up extensions (remove ?v=1.2 etc)
    find . -type f -name "*?*" | while read -r file; do
        mv "$file" "${file%%\?*}" 2>/dev/null || true
    done

    # 2. Move assets to organized folders
    find . -maxdepth 4 -name "*.js" -exec mv {} assets/js/ \; 2>/dev/null || true
    find . -maxdepth 4 -name "*.css" -exec mv {} assets/css/ \; 2>/dev/null || true
    find . -maxdepth 4 \( -name "*.png" -o -name "*.jpg" -o -name "*.svg" -o -name "*.gif" \) -exec mv {} assets/images/ \; 2>/dev/null || true
    
    # 3. Rename extension-less files to .html (often index pages)
    find . -type f ! -name "*.*" -exec mv {} {}.html \; 2>/dev/null || true
    
    info "Mirror organized. Clean structure at: ${WHITE}$dir/assets/${NC}"
}

# ----------------- CORE LOGIC -----------------
create_workspace() {
    TARGET=$1
    DOMAIN=$(echo "$TARGET" | sed -e 's|^[^/]*//||' -e 's|/.*$||')
    WORKDIR="copycat_$(date +%Y%m%d_%H%M)_$DOMAIN"
    mkdir -p "$WORKDIR"/{mirror,scans,metadata}
    echo "$WORKDIR"
}

run_mirror() {
    read -p "Enter Target URL (e.g., https://example.com): " url
    [ -z "$url" ] && return
    
    WDIR=$(create_workspace "$url")
    log "Starting Mirror for $url..."
    
    wget --mirror \
         --convert-links \
         --adjust-extension \
         --page-requisites \
         --no-parent \
         --user-agent="$WGET_USERAGENT" \
         -P "$WDIR/mirror" \
         "$url" || true

    make_human_readable "$WDIR/mirror"
    
    # Extract Secrets/JS
    info "Extracting JS endpoints..."
    grep -rE "https?://[a-zA-Z0-9./?=_-]+" "$WDIR/mirror" > "$WDIR/metadata/endpoints.txt" || true
    
    echo -e "${GREEN}✔ Mirror complete: $WDIR${NC}"
    read -p "Press Enter..."
}

full_recon() {
    read -p "Enter Domain for Recon: " dom
    [ -z "$dom" ] && return
    
    WDIR=$(create_workspace "$dom")
    log "Starting Passive Recon on $dom..."
    
    # Subdomains (using curl to avoid tool bloat)
    curl -s "https://crt.sh/?q=%25.$dom&output=json" | jq -r '.[].name_value' | sed 's/\*\.//g' | sort -u > "$WDIR/scans/subdomains.txt"
    info "Subdomains found: $(wc -l < "$WDIR/scans/subdomains.txt")"
    
    # Port Scan
    info "Running Nmap Fast Scan..."
    nmap -F "$dom" -oN "$WDIR/scans/nmap.txt"
    
    echo -e "${GREEN}✔ Recon complete: $WDIR${NC}"
    read -p "Press Enter..."
}

# ----------------- MENU -----------------
main_menu() {
    while true; do
        print_banner
        echo -e "  ${WHITE}[1]${NC} Quick Site Mirror (Human-Readable)"
        echo -e "  ${WHITE}[2]${NC} Full Recon (Subdomains + Ports)"
        echo -e "  ${WHITE}[3]${NC} JavaScript & Endpoint Extractor"
        echo -e "  ${CYAN}[I]${NC} Install/Fix Dependencies"
        echo -e "  ${RED}[0]${NC} Exit"
        echo -e "${CYAN}---------------------------------------------------------------${NC}"
        read -p "Choice > " choice

        case "$choice" in
            1) run_mirror ;;
            2) full_recon ;;
            3) warn "Choose Option 1 first to mirror a site." ;;
            i|I) init_system ;;
            0) exit 0 ;;
            *) echo "Invalid choice." ; sleep 1 ;;
        esac
    done
}

# START
init_system
main_menu
