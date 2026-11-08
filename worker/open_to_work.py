"""Conservative detector for the LinkedIn #OpenToWork profile-photo frame.

This module only inspects an image supplied by an independently permitted public
source. It does not log in to LinkedIn, fetch profiles, or bypass access controls.
A positive result requires both a green frame signal and OCR evidence.
"""
from __future__ import annotations

from io import BytesIO
from urllib.parse import urlparse
from urllib.request import Request, urlopen
import re

MAX_IMAGE_BYTES = 5 * 1024 * 1024
ALLOWED_HOSTS = {"media.licdn.com", "static.licdn.com", "media-exp1.licdn.com"}
OPEN_TO_WORK = re.compile(r"(?:#\s*OPEN\s*TO\s*WORK|OPEN\s*TO\s*WORK)", re.I)


def fetch_public_avatar(url: str, timeout: int = 8) -> bytes:
    """Fetch only a LinkedIn CDN image URL; reject arbitrary hosts and redirects."""
    parsed = urlparse(url)
    if parsed.scheme != "https" or (parsed.hostname or "").lower() not in ALLOWED_HOSTS:
        raise ValueError("AVATAR_URL_NOT_ALLOWED")
    request = Request(url, headers={"Accept": "image/*", "User-Agent": "VorlenConnect/1.0"})
    class NoRedirect:
        def __init__(self): self.opener = None
    # urllib's default redirect handler is deliberately not used.
    from urllib.request import build_opener, HTTPHandler, HTTPSHandler, BaseHandler
    class RejectRedirect(BaseHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            raise ValueError("AVATAR_REDIRECT_REJECTED")
    opener = build_opener(RejectRedirect, HTTPSHandler())
    with opener.open(request, timeout=timeout) as response:
        if response.status != 200:
            raise ValueError("AVATAR_HTTP_" + str(response.status))
        content_type = response.headers.get("Content-Type", "").split(";")[0].strip().lower()
        if not content_type.startswith("image/"):
            raise ValueError("AVATAR_NOT_IMAGE")
        data = response.read(MAX_IMAGE_BYTES + 1)
        if len(data) > MAX_IMAGE_BYTES:
            raise ValueError("AVATAR_TOO_LARGE")
        return data


def inspect_avatar(image_bytes: bytes, *, ocr_engine=None) -> dict:
    """Return verified only when green-frame geometry AND OCR agree.

    ocr_engine may be a callable accepting a PIL Image. When omitted, pytesseract
    is used if installed. Missing OCR is an unverified result, never a positive.
    """
    base = {
        "is_open_to_work": False,
        "status": "unverified",
        "green_ring_score": 0.0,
        "text_found": False,
        "detected_text": "",
        "confidence": 0.0,
        "reason": None,
    }
    if not isinstance(image_bytes, (bytes, bytearray)) or not image_bytes:
        base["reason"] = "IMAGE_MISSING"
        return base
    if len(image_bytes) > MAX_IMAGE_BYTES:
        base["reason"] = "IMAGE_TOO_LARGE"
        return base
    try:
        from PIL import Image
        image = Image.open(BytesIO(image_bytes)).convert("RGB")
        image.load()
    except Exception:
        base["reason"] = "IMAGE_DECODE_FAILED"
        return base
    width, height = image.size
    if min(width, height) < 80:
        base["reason"] = "IMAGE_TOO_SMALL"
        return base

    # The frame occupies a narrow perimeter around the circular avatar. Measure
    # saturated green pixels in the outer 8-30% band, excluding the central face.
    import math
    pixels = image.load()
    green = total = 0
    x0, x1 = int(width * .08), int(width * .92)
    y0, y1 = int(height * .08), int(height * .92)
    for y in range(y0, y1):
        for x in range(x0, x1):
            nx = (x - width / 2) / (width * .42)
            ny = (y - height / 2) / (height * .42)
            radius = math.sqrt(nx * nx + ny * ny)
            if .78 <= radius <= 1.08:
                total += 1
                r, g, b = pixels[x, y]
                if g >= 85 and g >= r * 1.22 and g >= b * 1.12 and (g - min(r, b)) >= 35:
                    green += 1
    score = green / total if total else 0.0
    base["green_ring_score"] = round(score, 4)
    if score < .22:
        base["reason"] = "GREEN_FRAME_NOT_CONFIRMED"
        return base

    try:
        if ocr_engine is None:
            import pytesseract
            ocr_engine = lambda im: pytesseract.image_to_string(im, config="--psm 11")
        detected = str(ocr_engine(image))[:1000]
    except Exception:
        base["reason"] = "OCR_UNAVAILABLE"
        return base
    base["detected_text"] = detected.strip()
    base["text_found"] = bool(OPEN_TO_WORK.search(detected))
    if not base["text_found"]:
        base["reason"] = "OPEN_TO_WORK_TEXT_NOT_CONFIRMED"
        return base

    # Both independent signals are required; score is intentionally capped and
    # never represents certainty about the person's current availability.
    confidence = min(.99, .55 + min(score, .6) * .35 + .10)
    base.update({
        "is_open_to_work": True,
        "status": "verified",
        "confidence": round(confidence, 3),
        "reason": "GREEN_FRAME_AND_OPEN_TO_WORK_TEXT_CONFIRMED",
    })
    return base
