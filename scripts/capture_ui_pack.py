#!/usr/bin/env python3
"""Regenerate the eight-image current UI capture pack."""

from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.parse import urlparse

from PIL import Image
from playwright.sync_api import Locator, Page, Response, TimeoutError, sync_playwright


DEFAULT_TARGET_URL = "https://thejimmyapp.com"
DEFAULT_OUTPUT_DIR = Path(__file__).resolve().parents[1] / "docs/specimens/current-ui"
VIEWPORT = {"width": 1440, "height": 900}
UI_WIDTH = 1300
EXPORT_WIDTH = 1800
GUTTER_COLOR = (8, 13, 22)
JPEG_QUALITY = 82
CAPTURE_NOTE = "Capture-only note: the move changes both boards and deserves a second look."


@dataclass(frozen=True)
class Capture:
    filename: str
    region: str


CAPTURES = (
    Capture("current-01-entry.jpg", ".app-stage"),
    Capture("current-02-guest-list.jpg", ".app-stage"),
    Capture("current-03-review-stage.jpg", ".app-stage"),
    Capture("current-04-dock-moves.jpg", ".app-dock"),
    Capture("current-05-dock-info.jpg", ".app-dock"),
    Capture("current-06-quest-tab.jpg", ".app-dock"),
    Capture("current-07-moment-editor.jpg", ".app-stage"),
    Capture("current-08-library.jpg", ".app-dock"),
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--target-url",
        default=DEFAULT_TARGET_URL,
        help=f"deployed app URL (default: {DEFAULT_TARGET_URL})",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help=f"capture destination (default: {DEFAULT_OUTPUT_DIR})",
    )
    parser.add_argument(
        "--timeout-ms",
        type=int,
        default=120_000,
        help="timeout for each navigation/state gate (default: 120000)",
    )
    args = parser.parse_args()
    parsed_url = urlparse(args.target_url)
    if parsed_url.scheme not in {"http", "https"} or not parsed_url.netloc:
        parser.error("--target-url must be an absolute http(s) URL")
    if args.timeout_ms <= 0:
        parser.error("--timeout-ms must be positive")
    args.target_url = args.target_url.rstrip("/") + "/"
    args.output_dir = args.output_dir.resolve()
    return args


def wait_for_stable_ui(page: Page) -> None:
    page.wait_for_function("document.fonts.status === 'loaded'")
    page.add_style_tag(
        content="""
            *, *::before, *::after {
                animation: none !important;
                caret-color: transparent !important;
                scroll-behavior: auto !important;
                transition: none !important;
            }
        """
    )
    page.wait_for_timeout(100)


def require_visible(locator: Locator, description: str) -> Locator:
    try:
        locator.wait_for(state="visible")
    except TimeoutError as exc:
        raise RuntimeError(f"missing or hidden element: {description}") from exc
    return locator


def normalize_capture(raw_path: Path, output_path: Path) -> tuple[int, int]:
    with Image.open(raw_path) as source:
        source = source.convert("RGB")
        if source.width <= 0 or source.height <= 0:
            raise RuntimeError(f"empty screenshot: {raw_path.name}")
        normalized_height = round(source.height * UI_WIDTH / source.width)
        normalized = source.resize((UI_WIDTH, normalized_height), Image.Resampling.LANCZOS)
        export = Image.new("RGB", (EXPORT_WIDTH, normalized_height), GUTTER_COLOR)
        export.paste(normalized, (0, 0))
        export.save(output_path, format="JPEG", quality=JPEG_QUALITY)
    return EXPORT_WIDTH, normalized_height


def capture_region(page: Page, capture: Capture, staging_dir: Path) -> tuple[int, int]:
    if "-redline." in capture.filename:
        raise RuntimeError(f"refusing to overwrite owner redline: {capture.filename}")
    region = require_visible(page.locator(capture.region), capture.region)
    box = region.bounding_box()
    if not box or box["width"] < 100 or box["height"] < 100:
        raise RuntimeError(f"invalid capture bounds for {capture.filename}: {box}")
    raw_path = staging_dir / f"{capture.filename}.png"
    final_path = staging_dir / capture.filename
    region.screenshot(
        path=raw_path,
        type="png",
        animations="disabled",
        caret="hide",
        scale="css",
    )
    return normalize_capture(raw_path, final_path)


def valid_git_hash(value: str | None) -> str | None:
    if not value:
        return None
    candidate = value.strip()
    return candidate if re.fullmatch(r"[0-9a-fA-F]{7,40}", candidate) else None


def discover_git_hash(page: Page, response: Response | None) -> str | None:
    if response:
        for header in (
            "x-git-commit",
            "x-git-sha",
            "x-commit-sha",
            "x-source-version",
            "x-vercel-git-commit-sha",
        ):
            discovered = valid_git_hash(response.headers.get(header))
            if discovered:
                return discovered

    for selector in (
        'meta[name="git-commit"]',
        'meta[name="git-sha"]',
        'meta[name="commit-sha"]',
        '[data-git-hash]',
        '[data-commit-sha]',
    ):
        locator = page.locator(selector).first
        if not locator.count():
            continue
        for attribute in ("content", "data-git-hash", "data-commit-sha"):
            discovered = valid_git_hash(locator.get_attribute(attribute))
            if discovered:
                return discovered

    runtime_value = page.evaluate(
        """() => window.__GIT_SHA__ ?? window.__COMMIT_SHA__ ?? window.__BUILD_SHA__ ?? null"""
    )
    discovered = valid_git_hash(runtime_value if isinstance(runtime_value, str) else None)
    if discovered:
        return discovered

    match = re.search(
        r"(?:git(?:[-_ ]?(?:commit|sha))?|commit|revision)"
        r"[^0-9a-fA-F]{0,24}([0-9a-fA-F]{7,40})",
        page.content(),
        re.IGNORECASE,
    )
    return valid_git_hash(match.group(1)) if match else None


def capture_pack(page: Page, target_url: str, staging_dir: Path) -> tuple[dict[str, tuple[int, int]], str | None]:
    dimensions: dict[str, tuple[int, int]] = {}
    response = page.goto(target_url, wait_until="domcontentloaded")
    require_visible(page.get_by_label("Choose how to enter The Jimmy App"), "entry screen")
    guest_entry = require_visible(page.locator(".guest-entry-node"), "Guest Spawn entry")
    guest_entry.focus()
    page.wait_for_function("document.activeElement?.classList.contains('guest-entry-node')")
    wait_for_stable_ui(page)
    dimensions[CAPTURES[0].filename] = capture_region(page, CAPTURES[0], staging_dir)

    page.keyboard.press("Enter")
    matchup_list = require_visible(page.get_by_role("listbox", name="Guest matchups"), "guest matchup list")
    page.wait_for_function(
        "document.querySelectorAll('.guest-matchup-card').length === 5"
    )
    if matchup_list.get_attribute("aria-activedescendant") != "guest-matchup-0":
        raise RuntimeError("the first guest matchup is not selected")
    wait_for_stable_ui(page)
    dimensions[CAPTURES[1].filename] = capture_region(page, CAPTURES[1], staging_dir)

    page.keyboard.press("Enter")
    require_visible(page.locator(".workspace .board-panel.board-layout-primary"), "guest review stage")
    require_visible(page.get_by_text(re.compile(r"GAME REVIEW · MOVE 0\b")), "initial replay position")
    moves_tab = require_visible(page.get_by_role("tab", name="Moves", exact=True), "Moves tab")
    if moves_tab.get_attribute("aria-selected") != "true":
        raise RuntimeError("Moves tab did not become selected after loading the guest replay")
    wait_for_stable_ui(page)
    dimensions[CAPTURES[2].filename] = capture_region(page, CAPTURES[2], staging_dir)
    dimensions[CAPTURES[3].filename] = capture_region(page, CAPTURES[3], staging_dir)

    info_tab = require_visible(page.get_by_role("tab", name="Info", exact=True), "Info tab")
    info_tab.click()
    require_visible(page.locator(".info-pane .game-metadata"), "review game metadata")
    wait_for_stable_ui(page)
    dimensions[CAPTURES[4].filename] = capture_region(page, CAPTURES[4], staging_dir)

    quest_tab = require_visible(page.locator(".utility-primary-tabs .quest-preview"), "locked Quest preview tab")
    quest_tab.click()
    quest_progress = require_visible(page.get_by_role("progressbar", name="Quest learning moments"), "Quest progress")
    if quest_progress.get_attribute("aria-valuenow") != "0":
        raise RuntimeError("Quest preview is not at 0/3 learning moments")
    wait_for_stable_ui(page)
    dimensions[CAPTURES[5].filename] = capture_region(page, CAPTURES[5], staging_dir)

    page.get_by_role("tab", name="Review", exact=True).click()
    page.get_by_role("tab", name="Moves", exact=True).click()
    page.keyboard.press("ArrowRight")
    require_visible(page.get_by_text(re.compile(r"GAME REVIEW · MOVE 1\b")), "replay move 1")
    page.keyboard.press("m")
    editor = require_visible(page.get_by_role("dialog", name="Save this position"), "learning-moment editor")
    editor.get_by_role("radio", name="!?", exact=True).click()
    editor.locator("#moment-note").fill(CAPTURE_NOTE)
    if editor.get_by_role("button", name="Save moment").is_disabled():
        raise RuntimeError("learning-moment editor did not accept the capture fixture")
    wait_for_stable_ui(page)
    dimensions[CAPTURES[6].filename] = capture_region(page, CAPTURES[6], staging_dir)

    editor.get_by_role("button", name="Save moment").click()
    library_tab = require_visible(page.get_by_role("tab", name=re.compile(r"^Library")), "Library tab")
    if library_tab.is_disabled():
        raise RuntimeError("Library tab did not unlock after saving the learning moment")
    library_tab.click()
    require_visible(page.get_by_text(CAPTURE_NOTE, exact=True), "saved capture-only learning moment")
    wait_for_stable_ui(page)
    dimensions[CAPTURES[7].filename] = capture_region(page, CAPTURES[7], staging_dir)

    return dimensions, discover_git_hash(page, response)


def publish_pack(staging_dir: Path, output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    redlines_before = {
        path.resolve(): (path.stat().st_size, path.stat().st_mtime_ns)
        for path in output_dir.glob("*-redline.*")
    }
    for capture in CAPTURES:
        source = staging_dir / capture.filename
        if not source.is_file():
            raise RuntimeError(f"capture staging file is missing: {capture.filename}")
        source.replace(output_dir / capture.filename)
    redlines_after = {
        path.resolve(): (path.stat().st_size, path.stat().st_mtime_ns)
        for path in output_dir.glob("*-redline.*")
    }
    if redlines_after != redlines_before:
        raise RuntimeError("an owner-authored redline changed during publication")


def main() -> int:
    args = parse_args()
    try:
        with TemporaryDirectory(prefix="thejimmyapp-ui-pack-") as temporary:
            staging_dir = Path(temporary)
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch(headless=True)
                context = browser.new_context(
                    viewport=VIEWPORT,
                    device_scale_factor=1,
                    reduced_motion="reduce",
                )
                page = context.new_page()
                page.set_default_timeout(args.timeout_ms)
                dimensions, git_hash = capture_pack(page, args.target_url, staging_dir)
                context.close()
                browser.close()
            publish_pack(staging_dir, args.output_dir)
    except Exception as exc:
        print(f"CAPTURE FAILED: {exc}", file=sys.stderr)
        return 1

    print(f"target={args.target_url} git_hash={git_hash or 'unavailable'}")
    for capture in CAPTURES:
        width, height = dimensions[capture.filename]
        print(f"{capture.filename}\t{width}x{height}\tgit_hash={git_hash or 'unavailable'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
