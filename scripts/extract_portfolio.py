#!/usr/bin/env python3
"""
Parse portfolio .docx files under project-database/, extract document titles and
the TECHNOLOGIES & SKILLS table, write site/data/projects.json.
Uses only stdlib (zipfile + XML).
"""
from __future__ import annotations

import json
import re
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
W = "{%s}" % W_NS

TECH_HEADING = re.compile(
    r"^\s*(technologies?|technology)\s*(?:&|and)\s*skills?\s*$",
    re.IGNORECASE,
)
HEADER_ROW = re.compile(
    r"^(category|technology|skill|area|domain|tool|stack)\b",
    re.IGNORECASE,
)
SKIP_TITLE = re.compile(
    r"^(technical proposal|project portfolio|table of content|executive summary)\b",
    re.IGNORECASE,
)
SKILLS_SECTION_STOP = re.compile(
    r"^(TECHNICAL HIGHLIGHTS|PICTURES|RESULTS|CONCLUSION|REFERENCES|APPENDIX|"
    r"BLOCK DIAGRAM|FLOWCHART|SEQUENCE DIAGRAM)\b",
    re.IGNORECASE,
)


def para_text(p: ET.Element) -> str:
    parts: list[str] = []
    for t in p.findall(".//%st" % W):
        if t.text:
            parts.append(t.text)
    return "".join(parts).strip()


def cell_text(tc: ET.Element) -> str:
    return para_text(tc).replace("\n", " ").strip()


def max_run_sz(p: ET.Element) -> int:
    best = 0
    for r in p.findall("%sr" % W):
        rpr = r.find("%srPr" % W)
        if rpr is None:
            continue
        for tag in ("sz", "szCs"):
            el = rpr.find("%s%s" % (W, tag))
            if el is not None:
                v = el.get(W + "val")
                if v and v.isdigit():
                    best = max(best, int(v))
    return best


def is_bold_para(p: ET.Element) -> bool:
    for r in p.findall("%sr" % W):
        rpr = r.find("%srPr" % W)
        if rpr is None:
            continue
        b = rpr.find("%sb" % W)
        if b is not None and b.get(W + "val", "1") not in ("0", "false"):
            return True
    return False


def table_to_skill_cells(tbl: ET.Element) -> list[str]:
    cells: list[str] = []
    for tr in tbl.findall("%str" % W):
        row_cells: list[str] = []
        for tc in tr.findall("%stc" % W):
            ct = cell_text(tc)
            if ct:
                row_cells.append(ct)
        if not row_cells:
            continue
        if len(row_cells) <= 3 and all(HEADER_ROW.match(c) for c in row_cells if c):
            continue
        cells.extend(row_cells)
    return cells


def extract_skills_after_tech_heading(body: ET.Element) -> list[str] | None:
    """Table or one-skill-per-paragraph list immediately after TECHNOLOGIES & SKILLS."""
    children = list(body)
    for i, child in enumerate(children):
        if child.tag != "%sp" % W:
            continue
        if not TECH_HEADING.match(para_text(child)):
            continue
        j = i + 1
        while j < len(children):
            ch = children[j]
            if ch.tag == "%sp" % W and not para_text(ch).strip():
                j += 1
                continue
            break
        if j >= len(children):
            return []
        if children[j].tag == "%stbl" % W:
            cells = table_to_skill_cells(children[j])
            return cells if cells else []
        skills: list[str] = []
        while j < len(children):
            ch = children[j]
            if ch.tag == "%stbl" % W:
                break
            if ch.tag != "%sp" % W:
                j += 1
                continue
            pt = para_text(ch).strip()
            if not pt:
                j += 1
                continue
            if SKILLS_SECTION_STOP.match(pt):
                break
            if len(pt) > 220:
                break
            skills.append(pt)
            j += 1
        return skills if skills else None
    return None


def extract_layer_key_components_table(body: ET.Element) -> list[str] | None:
    """Fallback: 'Layer' | 'Key Components' software stack table (proposals)."""
    for tbl in body.findall("%stbl" % W):
        rows: list[list[str]] = []
        for tr in tbl.findall("%str" % W):
            rows.append([cell_text(tc) for tc in tr.findall("%stc" % W)])
        if not rows or len(rows[0]) < 2:
            continue
        h0 = rows[0][0].strip().lower()
        h1 = rows[0][1].strip().lower()
        if "layer" not in h0 or "key" not in h1:
            continue
        out: list[str] = []
        for r in rows[1:]:
            if len(r) < 2:
                continue
            layer = r[0].strip()
            blob = r[1].strip()
            if layer:
                out.append(layer)
            for part in re.split(r"[,;]", blob):
                p = re.sub(r"\s+", " ", part).strip()
                if p:
                    out.append(p)
        return out if out else None
    return None


def dedupe_skills(raw: list[str]) -> list[str]:
    seen: set[str] = set()
    skills: list[str] = []
    for s in raw:
        s = re.sub(r"\s+", " ", s).strip()
        if not s or len(s) > 120:
            continue
        key = s.casefold()
        if key in seen:
            continue
        seen.add(key)
        skills.append(s)
    return skills


def parse_docx(path: Path) -> tuple[str | None, list[str], str | None]:
    """Returns (title, skills, error)."""
    try:
        with zipfile.ZipFile(path) as z:
            xml = z.read("word/document.xml")
    except (KeyError, zipfile.BadZipFile) as e:
        return None, [], str(e)

    root = ET.fromstring(xml)
    body = root.find("%sbody" % W)
    if body is None:
        return None, [], "no body"

    title: str | None = None
    best_title_score = 0

    for child in body:
        if child.tag != "%sp" % W:
            continue
        t = para_text(child)
        if not t:
            continue
        sz = max_run_sz(child)
        bold = is_bold_para(child)
        if (
            bold
            and sz >= 32
            and len(t) < 200
            and "http" not in t.lower()
            and t.upper() not in ("PROJECT DESCRIPTION",)
            and not TECH_HEADING.match(t)
            and not SKIP_TITLE.match(t)
        ):
            score = sz * 10 + (200 - len(t))
            if score > best_title_score:
                best_title_score = score
                title = t

    skills_raw = extract_skills_after_tech_heading(body)
    err: str | None = None
    if not skills_raw:
        skills_raw = extract_layer_key_components_table(body)
    if not skills_raw:
        err = "no technologies/skills section found"
        skills: list[str] = []
    else:
        skills = dedupe_skills(skills_raw)

    if title is None:
        title = path.stem

    return title, skills, err


def iter_portfolio_docx(db: Path) -> list[Path]:
    out: list[Path] = []
    skip_roots = {"Completed", "Proposals", "Misc"}

    for d in sorted(db.iterdir()):
        if not d.is_dir():
            continue
        name = d.name
        if name in skip_roots:
            continue

        candidates = [
            f
            for f in d.glob("*.docx")
            if f.is_file() and not f.name.startswith(".") and not f.name.startswith("~$")
        ]
        if not candidates:
            continue
        preferred = d / f"{name}.docx"
        if preferred in candidates:
            out.append(preferred)
            continue
        # Prefer docx whose name starts with folder name
        prefixed = [f for f in candidates if f.stem.startswith(name)]
        if len(prefixed) == 1:
            out.append(prefixed[0])
            continue
        if len(candidates) == 1:
            out.append(candidates[0])
            continue
        # Fallback: longest name match
        candidates.sort(key=lambda p: (len(p.stem), p.name), reverse=True)
        out.append(candidates[0])

    return out


VALID_CATEGORIES = frozenset(
    {
        "work-experience",
        "contracts",
        "research-experience",
        "projects",
        "competitions",
        "awards",
    }
)


def load_category_config(root: Path) -> tuple[str, dict[str, str]]:
    """Returns (default_category, project_id -> category slug)."""
    cfg_path = root / "site" / "data" / "portfolio-categories.json"
    default = "projects"
    by_id: dict[str, str] = {}
    if not cfg_path.is_file():
        return default, by_id
    try:
        raw = json.loads(cfg_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return default, by_id
    d = raw.get("defaultCategory")
    if isinstance(d, str) and d in VALID_CATEGORIES:
        default = d
    mapping = raw.get("byId")
    if isinstance(mapping, dict):
        for k, v in mapping.items():
            if isinstance(k, str) and isinstance(v, str) and v in VALID_CATEGORIES:
                by_id[k] = v
    return default, by_id


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    db = root / "project-database"
    out_path = root / "site" / "data" / "projects.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)

    category_default, category_by_id = load_category_config(root)

    projects: list[dict] = []
    errors: list[str] = []

    for docx in iter_portfolio_docx(db):
        rel = str(docx.relative_to(db))
        title, skills, err = parse_docx(docx)
        if err:
            errors.append(f"{rel}: {err}")
        if not title and not skills:
            continue
        cat = category_by_id.get(rel, category_default)
        if cat not in VALID_CATEGORIES:
            cat = category_default
        projects.append(
            {
                "id": rel,
                "title": title or docx.stem,
                "skills": skills,
                "sourceDoc": rel,
                "category": cat,
            }
        )

    # Stable sort by title
    projects.sort(key=lambda p: p["title"].casefold())

    payload = {
        "generated": True,
        "categoryDefault": category_default,
        "projects": projects,
        "errors": errors,
    }
    out_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"Wrote {out_path} ({len(projects)} projects, {len(errors)} errors)")
    for e in errors[:25]:
        print("  ", e)
    if len(errors) > 25:
        print(f"  ... and {len(errors) - 25} more")


if __name__ == "__main__":
    main()
