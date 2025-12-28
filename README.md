## CopyCat-CLI v2.0 🐱💻

A high-performance, universal web mirroring and reconnaissance framework designed for **Kali Linux** and **Termux**. CopyCat-CLI doesn't just download websites; it re-organizes them into a human-readable, developer-friendly structure while performing deep security reconnaissance.

---

## 🚀 Features

**•​ Human-Readable Mirroring:** Automatically cleans up wget clutter, organizes assets into css/, js/, and images/, and fixes broken extensions.

**•​ Deep Recon:** Integrated subdomain enumeration via crt.sh and fast port scanning with Nmap.
​Endpoint Extraction: Scrapes mirrored files for URLs, hidden endpoints, and cloud storage links.

**• ​Universal Installer:** One-click dependency setup for both pkg (Termux) and apt (Kali).

**• ​Smart Workspaces:** Organized folder structures named by timestamp and target for easy data management.

---

# 📥 Installation
1. Clone the Repository
   ```bash
   git clone https://github.com/hackops-academy/copycat-CLI.git
   cd copycat-CLI
   ```
2. Set Permissions
   ```bash
   chmod +x copycat-CLI.sh
   ```
3. Run the Tool
   ```bash
   ./copycat-CLI
   ```
---

## 🛠 Usage Guide
Upon launching, select Option [I] to ensure your environment is fully configured.

| Option | Action | Description |
| :--- | :-------: | --------------: |
| [1] | Quick Site Mirror (Human-Redable)| Downloads full site and convert it into a clean, redable folder tree|
| [2] | Full Recon (Subdomains + Ports) | Performs subdomain discovery & Nmap scans on the target domain|
| [3] | JavaScript & Endpoint Extractor| Analyzes downloaded scripts to find API keys, endpoints, and sensitive paths|
| [I] | Install/Fix Dependencies | Auto-installs wget, nmap, jq, and configures Go-paths|
| [0] | Exit | To exit the tool|

---

## 📂 Output Structure
When a task is completed, CopyCat-CLI generates a workspace:

```text
copycat_20241020_[example.com/](https://example.com/)
├── mirror/              # The "Human-Readable" cloned site
│   ├── index.html
│   └── assets/          # Cleaned CSS, JS, and Images
├── scans/               # Subdomain and Nmap results
└── metadata/            # Extracted endpoints and JS refs
```
---

## 🛡 Disclaimer

This tool is intended for educational purposes and authorized security testing only. Mirroring or scanning targets without explicit permission is illegal.

**Developed by Hackops-Academy**

