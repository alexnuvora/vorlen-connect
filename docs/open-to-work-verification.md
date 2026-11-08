# Open to Work badge verification

This is a conservative image-verification component for the public LinkedIn
profile-photo frame. It is not a candidate discovery source.

## Verification contract
- Only inspect avatar images obtained from a permitted public source.
- Accept only HTTPS image URLs on explicitly allowed LinkedIn CDN hosts.
- Reject redirects, non-image responses, and images over 5 MB.
- A candidate is **verified** only when both a green perimeter-frame signal and
  OCR text matching `#OpenToWork` / `Open to Work` are present.
- Missing avatar, failed OCR, low-resolution image, or ambiguous signal is
  **unverified**, never a negative or a positive.
- CV availability is independent and must not filter candidates.

## Runtime
Requires Pillow and Tesseract OCR (plus `pytesseract`). The detector deliberately
fails closed if OCR is unavailable.

## Important limitation
The detector does not discover candidates or guarantee that a public LinkedIn
avatar URL is available. The existing public Oracle collector is for job pages,
not people search. Candidate discovery must use a separately permitted public
source; no LinkedIn login, cookies, session tokens, account automation, or
access-control bypass is used.
