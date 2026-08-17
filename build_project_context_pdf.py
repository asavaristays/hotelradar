from __future__ import annotations

import re
from datetime import date
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    KeepTogether,
    PageBreak,
    Paragraph,
    Preformatted,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

ROOT = Path(__file__).parent
OUT_DIR = ROOT / "output" / "pdf"
OUT_FILE = OUT_DIR / "HotelRADAR_Direct_Implementation_Context.pdf"

CHAPTERS = [
    ("Project intelligence", "HOTELRADAR_DIRECT_PROJECT_INTELLIGENCE.md"),
    ("Phase 1 external-system readiness", "PHASE_1_EXTERNAL_SYSTEM_READINESS.md"),
    ("Frontend design", "HOTELRADAR_DIRECT_FRONTEND_DESIGN.md"),
    ("Backend and operator-console design", "HOTELRADAR_DIRECT_BACKEND_DESIGN.md"),
    ("Connector", "connector.md"),
    ("Revenue Intelligence integration and upgrade", "revenue.hotelradar.md"),
    ("Salesman integration and upgrade", "salesman.hotelradar.in.md"),
    ("API", "api.md"),
    ("Security", "security.md"),
    ("VPS deployment", "vps.md"),
    ("Technical configuration", "technical-configuration.md"),
]

NAVY = colors.HexColor("#101D3A")
CORAL = colors.HexColor("#FF4054")
SLATE = colors.HexColor("#60708A")
LINE = colors.HexColor("#E3E7EE")
WARM = colors.HexColor("#FFFCF9")
PALE = colors.HexColor("#FFF0F1")


def register_fonts() -> tuple[str, str, str]:
    candidates = [
        Path("/System/Library/Fonts/Supplemental/Arial.ttf"),
        Path("/Library/Fonts/Arial.ttf"),
    ]
    bold_candidates = [
        Path("/System/Library/Fonts/Supplemental/Arial Bold.ttf"),
        Path("/Library/Fonts/Arial Bold.ttf"),
    ]
    mono_candidates = [
        Path("/System/Library/Fonts/Menlo.ttc"),
        Path("/Library/Fonts/Menlo.ttc"),
    ]
    regular = next((p for p in candidates if p.exists()), None)
    bold = next((p for p in bold_candidates if p.exists()), None)
    mono = next((p for p in mono_candidates if p.exists()), None)
    if regular and bold:
        pdfmetrics.registerFont(TTFont("HRRegular", str(regular)))
        pdfmetrics.registerFont(TTFont("HRBold", str(bold)))
        if mono:
            pdfmetrics.registerFont(TTFont("HRMono", str(mono), subfontIndex=0))
        return "HRRegular", "HRBold", "HRMono" if mono else "Courier"
    return "Helvetica", "Helvetica-Bold", "Courier"


REGULAR, BOLD, MONO = register_fonts()


def strip_md(value: str) -> str:
    value = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", value)
    value = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", value)
    value = value.replace("**", "").replace("`", "")
    return value.replace("<", "&lt;").replace(">", "&gt;")


def styles():
    base = getSampleStyleSheet()
    return {
        "cover_title": ParagraphStyle(
            "cover_title", parent=base["Title"], fontName=BOLD, fontSize=30,
            leading=35, textColor=colors.white, alignment=TA_CENTER, spaceAfter=12,
        ),
        "cover_subtitle": ParagraphStyle(
            "cover_subtitle", parent=base["BodyText"], fontName=REGULAR, fontSize=13,
            leading=19, textColor=colors.HexColor("#D9E3F8"), alignment=TA_CENTER,
        ),
        "cover_note": ParagraphStyle(
            "cover_note", parent=base["BodyText"], fontName=REGULAR, fontSize=10,
            leading=14, textColor=SLATE, alignment=TA_CENTER,
        ),
        "chapter": ParagraphStyle(
            "chapter", parent=base["Heading1"], fontName=BOLD, fontSize=22,
            leading=27, textColor=NAVY, spaceBefore=0, spaceAfter=11,
        ),
        "h1": ParagraphStyle(
            "h1", parent=base["Heading1"], fontName=BOLD, fontSize=17,
            leading=22, textColor=NAVY, spaceBefore=12, spaceAfter=8,
        ),
        "h2": ParagraphStyle(
            "h2", parent=base["Heading2"], fontName=BOLD, fontSize=13,
            leading=17, textColor=NAVY, spaceBefore=11, spaceAfter=6,
        ),
        "h3": ParagraphStyle(
            "h3", parent=base["Heading3"], fontName=BOLD, fontSize=10.5,
            leading=14, textColor=CORAL, spaceBefore=8, spaceAfter=4,
        ),
        "body": ParagraphStyle(
            "body", parent=base["BodyText"], fontName=REGULAR, fontSize=9.3,
            leading=13.2, textColor=NAVY, spaceAfter=5,
        ),
        "bullet": ParagraphStyle(
            "bullet", parent=base["BodyText"], fontName=REGULAR, fontSize=9.2,
            leading=13, textColor=NAVY, leftIndent=12, firstLineIndent=-8, spaceAfter=3,
        ),
        "small": ParagraphStyle(
            "small", parent=base["BodyText"], fontName=REGULAR, fontSize=8,
            leading=11, textColor=SLATE, spaceAfter=3,
        ),
        "toc": ParagraphStyle(
            "toc", parent=base["BodyText"], fontName=REGULAR, fontSize=10.5,
            leading=17, textColor=NAVY, leftIndent=8,
        ),
    }


STYLES = styles()


def header_footer(canvas, doc):
    canvas.saveState()
    width, height = A4
    if doc.page > 2:
        canvas.setStrokeColor(LINE)
        canvas.line(18 * mm, height - 15 * mm, width - 18 * mm, height - 15 * mm)
        canvas.setFillColor(NAVY)
        canvas.setFont(BOLD, 8)
        canvas.drawString(18 * mm, height - 11 * mm, "HOTELRADAR DIRECT")
        canvas.setFillColor(SLATE)
        canvas.setFont(REGULAR, 7.5)
        canvas.drawRightString(width - 18 * mm, height - 11 * mm, "Implementation Context")
    canvas.setStrokeColor(LINE)
    canvas.line(18 * mm, 14 * mm, width - 18 * mm, 14 * mm)
    canvas.setFillColor(SLATE)
    canvas.setFont(REGULAR, 7.5)
    canvas.drawString(18 * mm, 9 * mm, "Internal implementation reference")
    canvas.drawRightString(width - 18 * mm, 9 * mm, f"Page {doc.page}")
    canvas.restoreState()


def make_cover(story):
    story.append(Spacer(1, 46 * mm))
    title = Table([[Paragraph("HOTELRADAR DIRECT", STYLES["cover_title"])], [
        Paragraph("Phase 1 Implementation Context", STYLES["cover_subtitle"])
    ], [Paragraph(
        "Traveller experience, operational workflow, connector integration, security and deployment reference",
        STYLES["cover_subtitle"],
    )]], colWidths=[160 * mm], rowHeights=[19 * mm, 12 * mm, 25 * mm])
    title.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), NAVY),
        ("BOX", (0, 0), (-1, -1), 1, NAVY),
        ("LEFTPADDING", (0, 0), (-1, -1), 14 * mm),
        ("RIGHTPADDING", (0, 0), (-1, -1), 14 * mm),
        ("TOPPADDING", (0, 0), (-1, -1), 7 * mm),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7 * mm),
    ]))
    story.append(title)
    story.append(Spacer(1, 15 * mm))
    story.append(Paragraph(
        f"Compiled from {len(CHAPTERS)} approved project Markdown specifications - {date.today().isoformat()}",
        STYLES["cover_note"],
    ))
    story.append(PageBreak())


def add_toc(story):
    story.append(Paragraph("Implementation journey", STYLES["chapter"]))
    story.append(Paragraph(
        "Read this document in sequence: start with the project thesis and boundaries, then the pilot readiness, traveller and operator experiences, external-system contracts, and finally the API, security and deployment controls.",
        STYLES["body"],
    ))
    story.append(Spacer(1, 4 * mm))
    for number, (title, file_name) in enumerate(CHAPTERS, 1):
        story.append(Paragraph(f"<b>{number:02d}</b> &nbsp; {title}<br/><font color='#60708A' size='8'>{file_name}</font>", STYLES["toc"]))
    story.append(PageBreak())


def render_markdown(story, source: Path):
    lines = source.read_text(encoding="utf-8").splitlines()
    in_code = False
    code_lines: list[str] = []
    table_lines: list[str] = []

    def flush_code():
        nonlocal code_lines
        if code_lines:
            story.append(Preformatted("\n".join(code_lines), ParagraphStyle(
                "code", fontName=MONO, fontSize=7.4, leading=9.2, textColor=NAVY,
                backColor=colors.HexColor("#F4F6FA"), borderColor=LINE, borderWidth=0.5,
                borderPadding=6, spaceBefore=4, spaceAfter=7,
            )))
            code_lines = []

    def flush_table():
        nonlocal table_lines
        if not table_lines:
            return
        cleaned = [line for line in table_lines if not re.match(r"^\|?\s*:?-{3,}", line.replace("|", " "))]
        rows = []
        for line in cleaned:
            cells = [strip_md(cell.strip()) for cell in line.strip().strip("|").split("|")]
            if cells:
                rows.append(cells)
        if rows:
            cols = max(len(row) for row in rows)
            rows = [row + [""] * (cols - len(row)) for row in rows]
            cell_style = ParagraphStyle("table_cell", fontName=REGULAR, fontSize=6.8, leading=8.4, textColor=NAVY)
            data = [[Paragraph(cell, cell_style) for cell in row] for row in rows]
            table = Table(data, colWidths=[160 * mm / cols] * cols, repeatRows=1)
            table.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), NAVY),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), BOLD),
                ("GRID", (0, 0), (-1, -1), 0.35, LINE),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, WARM]),
            ]))
            story.append(table)
            story.append(Spacer(1, 3 * mm))
        table_lines = []

    for raw in lines:
        line = raw.rstrip()
        if line.startswith("```"):
            if in_code:
                flush_code()
                in_code = False
            else:
                flush_table()
                in_code = True
            continue
        if in_code:
            code_lines.append(line)
            continue
        if line.strip().startswith("|"):
            table_lines.append(line)
            continue
        flush_table()
        if not line.strip():
            story.append(Spacer(1, 1.5 * mm))
        elif line.startswith("# "):
            story.append(Paragraph(strip_md(line[2:]), STYLES["h1"]))
        elif line.startswith("## "):
            story.append(Paragraph(strip_md(line[3:]), STYLES["h2"]))
        elif line.startswith("### "):
            story.append(Paragraph(strip_md(line[4:]), STYLES["h3"]))
        elif re.match(r"^\s*[-*] ", line):
            story.append(Paragraph("- " + strip_md(re.sub(r"^\s*[-*] ", "", line)), STYLES["bullet"]))
        elif re.match(r"^\s*\d+\. ", line):
            story.append(Paragraph(strip_md(line), STYLES["bullet"]))
        elif line.strip() == "---":
            story.append(Spacer(1, 2 * mm))
        else:
            story.append(Paragraph(strip_md(line), STYLES["body"]))
    flush_code()
    flush_table()


def build():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(OUT_FILE), pagesize=A4, rightMargin=18 * mm, leftMargin=18 * mm,
        topMargin=22 * mm, bottomMargin=20 * mm, title="HotelRADAR Direct - Implementation Context",
        author="HotelRADAR AI Agency",
    )
    story = []
    make_cover(story)
    add_toc(story)
    for index, (title, file_name) in enumerate(CHAPTERS, 1):
        story.append(Paragraph(f"{index:02d}. {title}", STYLES["chapter"]))
        story.append(Paragraph(f"Source: {file_name}", STYLES["small"]))
        story.append(Spacer(1, 2 * mm))
        render_markdown(story, ROOT / file_name)
        if index != len(CHAPTERS):
            story.append(PageBreak())
    doc.build(story, onFirstPage=header_footer, onLaterPages=header_footer)
    print(OUT_FILE)


if __name__ == "__main__":
    build()
