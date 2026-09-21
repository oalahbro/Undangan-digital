"""Run: py test/opening-static-check.py"""
from pathlib import Path
import struct

root = Path(__file__).parent.parent
html = (root / "index.html").read_text(encoding="utf-8")
css = (root / "css" / "vintage-intro.css").read_text(encoding="utf-8")
script = (root / "js" / "main.js").read_text(encoding="utf-8")

assert 'id="vintageIntro"' in html and 'id="vintageOpen"' in html
assert 'id="vintageOpeningVideo"' in html and 'id="vintageVideoOverlay"' in html
assert 'id="main" class="main" aria-hidden="true"' in html
assert 'src="js/api.js"' in html and 'src="js/main.js"' in html
assert "BUKA UNDANGAN" in html and "color: #000;" in css
assert html.count('data-intro-name="groom"') == 2 and html.count('data-intro-name="bride"') == 2
assert 'class="btn-pill btn-pill--outline vintage-intro__save"' in html
assert 'class="vintage-intro__scroll-cue"' in html
assert ".vintage-intro__overlay {" in css and "  color: #000;" in css
assert ".vintage-intro__overlay .vintage-intro__save" in css and "  pointer-events: auto;" in css
assert ".vintage-intro__overlay .vintage-intro__save:hover" in css and "  color: #fff;" in css
assert "@keyframes vintage-name-blink" not in css
assert "@keyframes vintage-scroll-cue" in css
assert "getElementById('vintageCoverImage')" in script and ".cover__bg" not in script
assert "'[data-intro-name=\"groom\"]'" in script and "'[data-intro-name=\"bride\"]'" in script
assert "OVERLAY_TIME = 11" in script

server = (root / "server.js").read_text(encoding="utf-8")
assert 'id="vintageCoverImage"' in server and "out.replace" in server and "no-store, must-revalidate" in server

# Link tamu: nama dienkripsi + di-inject server-side, bukan lagi dari ?to= di browser
assert (root / "lib" / "guest-token.js").is_file()
assert "lib/guest-token" in server and "decryptGuestToken" in server and "injectGuest" in server
assert "/api/admin/guest-links" in server and "invalidLinkPage" in server
assert "?to=" not in script and "personalizeGuest" not in script

admin_js = (root / "admin" / "admin.js").read_text(encoding="utf-8")
assert "/api/admin/guest-links" in admin_js and "?to=" not in admin_js
assert "intro.classList.add('is-opened')" in script
assert "main.setAttribute('aria-hidden', 'false')" in script
assert "document.body.classList.remove('is-locked')" in script
assert ".vintage-intro.is-opened" in css and "position: relative;" in css and "height: 100svh;" in css
assert "vintageFinalFrame" not in html and "requestVideoFrameCallback" not in script
assert "is-finished" not in css and "intro.remove()" not in script
assert "video.addEventListener('ended'" not in script

for asset in [
    root / "assets" / "fonts" / "cormorant-garamond-latin.woff2",
    root / "assets" / "fonts" / "cormorant-garamond-latin-italic.woff2",
    root / "assets" / "images" / "25KN154_2-2.jpg",
    root / "assets" / "images" / "FALLBACK-HIJAU-V2-MOTION-PII-1.jpg",
    root / "assets" / "media" / "VINTAGE-06-BARU.mp4",
]:
    assert asset.is_file(), f"missing asset: {asset.name}"

media = (root / "assets" / "media" / "VINTAGE-06-BARU.mp4").read_bytes()
marker = media.find(b"mvhd")
assert marker >= 0, "MP4 must contain movie metadata"
timescale, duration = struct.unpack_from(">II", media, marker + 16)
seconds = duration / timescale
assert 19.9 < seconds < 20.1, f"unexpected video duration: {seconds:.3f}s"
print(f"OK: Vintage intro and legacy invitation present; MP4 duration {seconds:.3f}s")
