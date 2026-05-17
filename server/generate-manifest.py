#!/usr/bin/env python3
"""
Génère manifest.json pour le repo EthernicaClient.

Workflow :
  1. Tu as un repo Git local "EthernicaClient" qui contient :
       mods/         ← .jar des 47 mods Forge
       config/       ← configs des mods
       resourcepacks/← packs de textures éventuels
  2. Tu lances ce script depuis ce repo :
       python3 generate-manifest.py
  3. Il produit manifest.json à la racine.
  4. git add . && git commit -m "update mods" && git push
  5. Tes joueurs récupèrent la diff au prochain JOUER.

Le launcher consulte manifest.json via :
   https://raw.githubusercontent.com/<owner>/<repo>/<branch>/manifest.json
et télécharge chaque fichier listé via le même base URL + "files[i].path".
"""
from __future__ import annotations
import hashlib
import json
import sys
from pathlib import Path

# Dossiers gérés par le launcher (relatifs au .minecraft client).
# Tout fichier local qui est dans ces dossiers mais ABSENT du manifeste
# sera supprimé côté client.
MANAGED_DIRS = ["mods", "config", "resourcepacks"]

MC_VERSION = "1.20.1"
FORGE_VERSION = "1.20.1-47.4.18"


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def scan(root: Path) -> list[dict]:
    files = []
    for d in MANAGED_DIRS:
        base = root / d
        if not base.exists():
            continue
        for full in base.rglob("*"):
            if not full.is_file():
                continue
            # Ignore les fichiers cachés et les fichiers Git
            if any(part.startswith(".") for part in full.relative_to(root).parts):
                continue
            rel = full.relative_to(root).as_posix()
            files.append({
                "path": rel,
                "sha256": sha256(full),
                "size": full.stat().st_size,
            })
    files.sort(key=lambda f: f["path"])
    return files


def main() -> int:
    root = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
    print(f"[manifest] scan {root}")
    files = scan(root)

    prev_version = 0
    prev_path = root / "manifest.json"
    if prev_path.exists():
        try:
            prev = json.loads(prev_path.read_text(encoding="utf-8"))
            prev_version = int(prev.get("version", 0))
        except Exception:
            pass

    manifest = {
        "version": prev_version + 1,
        "minecraft": MC_VERSION,
        "forge": FORGE_VERSION,
        "managedDirs": MANAGED_DIRS,
        "files": files,
    }

    prev_path.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    total_size = sum(f["size"] for f in files)
    print(f"[manifest] wrote {prev_path} — v{manifest['version']}, "
          f"{len(files)} files, {total_size / 1024 / 1024:.1f} MB total")
    print("[manifest] commit + push :")
    print("    git add .")
    print(f"    git commit -m 'manifest v{manifest['version']}'")
    print("    git push")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
