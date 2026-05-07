/* =========================================================
   HABIB & ADIBA — Modern Minimalist
   ========================================================= */
'use strict';

const WEDDING_DATE = new Date('2025-12-30T07:00:00+07:00').getTime();

/* ---------- Guest personalization (?to= &address=) ---------- */
(function personalizeGuest() {
  const params = new URLSearchParams(location.search);
  const to   = params.get('to');
  const addr = params.get('address') || params.get('addr');

  if (to) {
    const el = document.getElementById('guestName');
    if (el) el.textContent = decodeURIComponent(to);
  }
  if (addr) {
    const el = document.getElementById('guestAddr');
    if (el) el.textContent = 'at ' + decodeURIComponent(addr);
  }
})();

/* ---------- Petal shower — green, continuous fall + ground pile ---------- */
(function petalShower() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const field = document.getElementById('petalField');
  if (!field) return;

  const SHAPES = ['sage', 'forest', 'mint', 'moss', 'jade', 'sage', 'jade'];
  const R = (min, max) => min + Math.random() * (max - min);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  const PILE_MAX = 55;
  const pile = [];

  function spawn(type /* 'through' | 'land' */) {
    const p = document.createElement('span');
    p.className = 'petal petal--' + pick(SHAPES);

    const startX = R(-5, 100) + 'vw';
    const driftX = R(-28, 28) + 'vw';
    const spin   = (Math.random() < .5 ? -1 : 1) * R(360, 1080) + 'deg';
    const width  = R(12, 24);
    const aspect = R(1.3, 1.6);               // leaf: taller than wide
    const height = width * aspect;
    const duration = type === 'land' ? R(5.5, 8) : R(5, 8);

    p.style.setProperty('--startX', startX);
    p.style.setProperty('--driftX', driftX);
    p.style.setProperty('--spin',   spin);
    p.style.width  = width  + 'px';
    p.style.height = height + 'px';
    p.style.animationDuration = duration + 's';

    if (type === 'land') {
      const landX = R(0, 100) + 'vw';
      const landY = Math.floor(R(0, 28)) + 'px';
      const landRot = R(-150, 150) + 'deg';
      p.style.setProperty('--landX', landX);
      p.style.setProperty('--landY', landY);
      p.style.setProperty('--landRot', landRot);
      p.style.animationName = 'petalLand';

      field.appendChild(p);
      pile.push(p);

      // Cap pile — fade oldest if too many
      if (pile.length > PILE_MAX) {
        const oldest = pile.shift();
        if (oldest) {
          oldest.style.transition = 'opacity 1.2s ease-out';
          oldest.style.opacity = '0';
          setTimeout(() => oldest.remove(), 1300);
        }
      }
    } else {
      p.style.animationName = 'petalFall';
      field.appendChild(p);
      setTimeout(() => p.remove(), duration * 1000 + 250);
    }
  }

  // Initial heavy burst (fires when cover opens)
  let hasBurst = false;
  function burst() {
    if (hasBurst) return;
    hasBurst = true;

    // 60 pass-through with staggered start
    for (let i = 0; i < 60; i++) {
      setTimeout(() => spawn('through'), R(0, 1800));
    }
    // Some landing petals to start building the ground pile
    for (let i = 0; i < 15; i++) {
      setTimeout(() => spawn('land'), R(200, 2800));
    }
  }

  // Continuous trickle — keeps running forever
  function scheduleNext(type, minMs, maxMs) {
    const delay = R(minMs, maxMs);
    setTimeout(() => {
      if (document.visibilityState !== 'hidden') spawn(type);
      scheduleNext(type, minMs, maxMs);
    }, delay);
  }

  // Expose the burst trigger + start the trickle right away (but softly)
  window.__petalBurst = burst;

  // Start gentle ambient trickle immediately (even before cover opens)
  // — very soft, just a hint of movement behind the cover
  scheduleNext('through', 900, 2200);   // 1 falling petal every ~1.5s average
  scheduleNext('land',    4500, 8500);  // 1 landing petal every ~6.5s average
})();

/* ---------- Open cover ---------- */
(function openCover() {
  const btn   = document.getElementById('btnOpen');
  const cover = document.getElementById('cover');
  const main  = document.getElementById('main');
  if (!btn || !cover || !main) return;

  btn.addEventListener('click', () => {
    if (typeof window.__petalBurst === 'function') window.__petalBurst();
    cover.classList.add('is-opening');
    document.body.classList.remove('is-locked');
    main.setAttribute('aria-hidden', 'false');
    window.scrollTo({ top: 0, behavior: 'instant' });

    setTimeout(() => {
      cover.remove();
    }, 2800);
  });
})();

/* ---------- Countdown ---------- */
(function countdown() {
  const elD = document.getElementById('cdDays');
  const elH = document.getElementById('cdHours');
  const elM = document.getElementById('cdMins');
  const elS = document.getElementById('cdSecs');
  if (!elD) return;

  const pad = (n) => String(n).padStart(2, '0');
  function tick() {
    let diff = WEDDING_DATE - Date.now();
    if (diff < 0) diff = 0;
    elD.textContent = pad(Math.floor(diff / 86400000));
    elH.textContent = pad(Math.floor((diff / 3600000) % 24));
    elM.textContent = pad(Math.floor((diff / 60000) % 60));
    elS.textContent = pad(Math.floor((diff / 1000) % 60));
  }
  tick();
  setInterval(tick, 1000);
})();

/* ---------- Add to calendar (ICS download) ---------- */
window.addToCalendar = function addToCalendar() {
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    'SUMMARY:Pernikahan Eka & Salsa',
    'DTSTART:20251230T000000Z',
    'DTEND:20251230T070000Z',
    'LOCATION:Ds. Pagu\\, Wates\\, Kediri\\, Jawa Timur',
    'DESCRIPTION:Akad Nikah 07.00 WIB & Resepsi 10.00 WIB',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');

  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'EkaSalsa-Wedding.ics';
  document.body.appendChild(a); a.click(); a.remove();
};

/* ---------- Reveal on scroll ---------- */
(function reveal() {
  const main  = document.getElementById('main');
  const items = document.querySelectorAll('[data-reveal]');
  if (!items.length) return;

  if (!('IntersectionObserver' in window)) {
    items.forEach(el => el.classList.add('is-visible'));
    return;
  }

  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add('is-visible');
      } else {
        e.target.classList.remove('is-visible');
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

  function start() {
    items.forEach(el => io.observe(el));
  }

  // If main is still hidden behind cover, wait until the parallax cover-open is nearly done
  if (main && main.getAttribute('aria-hidden') === 'true') {
    const mutObs = new MutationObserver(() => {
      if (main.getAttribute('aria-hidden') !== 'true') {
        mutObs.disconnect();
        // Start reveals shortly after cover begins sliding away
        setTimeout(start, 700);
      }
    });
    mutObs.observe(main, { attributes: true, attributeFilter: ['aria-hidden'] });
  } else {
    start();
  }
})();

/* ---------- Live Stream video: autoplay when scrolled into view ---------- */
(function livestreamAutoplay() {
  const video = document.getElementById('liveStreamVideo');
  if (!video) return;

  const unmuteBtn = document.getElementById('liveStreamUnmute');

  video.muted = true;

  // Button tap → unmute + play (the click itself is the user gesture the
  // browser uses to grant audio permission). Button is the ONLY way to unmute,
  // so it stays visible until the user explicitly taps it.
  if (unmuteBtn) {
    unmuteBtn.addEventListener('click', (e) => {
      e.preventDefault();
      video.muted = false;
      const p = video.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
      unmuteBtn.classList.add('is-hidden');
      setTimeout(() => { if (unmuteBtn.parentNode) unmuteBtn.remove(); }, 320);
    });
  }

  // Autoplay (muted) when the video scrolls into view; pause when it leaves.
  async function tryPlay() {
    try { await video.play(); } catch {}
  }

  if (!('IntersectionObserver' in window)) {
    tryPlay();
    return;
  }

  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) tryPlay();
      else video.pause();
    });
  }, { threshold: 0.35 });

  io.observe(video);
})();

/* ---------- Lightbox (zoom images) ---------- */
(function lightbox() {
  const lb    = document.getElementById('lightbox');
  const lbImg = document.getElementById('lightboxImg');
  if (!lb) return;

  document.querySelectorAll('.carousel__slide img, .person__photo img, .event-card__hero, .gift__photo').forEach((img) => {
    img.addEventListener('click', () => {
      lbImg.src = img.src.replace(/w=\d+/, 'w=1600');
      lbImg.alt = img.alt || '';
      lb.classList.add('is-open');
      document.body.style.overflow = 'hidden';
    });
  });

  function close() {
    lb.classList.remove('is-open');
    document.body.style.overflow = '';
  }
  lb.addEventListener('click', (e) => {
    if (e.target === lb || e.target.classList.contains('lightbox__close')) close();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
})();

/* ---------- Copy bank number ---------- */
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.btn-copy');
  if (!btn) return;
  const targetId = btn.dataset.copyTarget;
  const txt = document.getElementById(targetId)?.textContent.trim().replace(/\s+/g, '');
  if (!txt) return;

  try {
    await navigator.clipboard.writeText(txt);
  } catch {
    const range = document.createRange();
    range.selectNode(document.getElementById(targetId));
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    document.execCommand('copy');
  }

  const originalHTML = btn.innerHTML;
  btn.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg> Copied';
  btn.classList.add('copied');
  setTimeout(() => {
    btn.innerHTML = originalHTML;
    btn.classList.remove('copied');
  }, 2000);
});

/* ---------- RSVP form + stats (server API) ---------- */
(function rsvp() {
  const form    = document.getElementById('rsvpForm');
  const wall    = document.getElementById('rsvpWall');
  const elHadir = document.getElementById('countHadir');
  const elAbsen = document.getElementById('countAbsen');
  const elTotal = document.getElementById('countTotal');
  if (!form || !wall) return;
  if (!window.WeddingAPI) {
    console.warn('WeddingAPI not loaded — make sure js/api.js is included before js/main.js');
    return;
  }

  const attendLabel = { datang: 'Attend', absen: 'Absent' };

  const escapeHtml = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function renderStats(stats) {
    if (elHadir) elHadir.textContent = stats.hadir || 0;
    if (elAbsen) elAbsen.textContent = stats.absen || 0;
    if (elTotal) elTotal.textContent = stats.total || 0;
  }
  function render(comments, stats) {
    wall.innerHTML = comments.map((item) => `
      <article class="rsvp-msg">
        <strong>${escapeHtml(item.name)}</strong>
        <span class="attend${item.attend === 'absen' ? ' absen' : ''}">${attendLabel[item.attend] || ''}</span>
        <p>${escapeHtml(item.message)}</p>
      </article>
    `).join('');
    renderStats(stats || { hadir: 0, absen: 0, total: comments.length });
  }

  async function refresh() {
    try {
      const { comments, stats } = await window.WeddingAPI.getComments();
      render(comments || [], stats);
    } catch (err) {
      console.warn('Failed to load comments:', err.message);
      wall.innerHTML = '<p class="rsvp-msg" style="opacity:.7">Gagal memuat ucapan. Coba refresh halaman.</p>';
    }
  }
  refresh();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const payload = {
      name: String(fd.get('name') || '').trim().slice(0, 50),
      message: String(fd.get('message') || '').trim().slice(0, 300),
      attend: String(fd.get('attend') || 'datang')
    };
    if (!payload.name || !payload.message) return;

    const btn = form.querySelector('button[type="submit"]');
    const original = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }

    try {
      await window.WeddingAPI.postComment(payload);
      await refresh();
      form.reset();
      if (btn) {
        btn.textContent = '✓ Sent';
        setTimeout(() => { btn.textContent = original; btn.disabled = false; }, 2000);
      }
    } catch (err) {
      console.warn('Failed to submit RSVP:', err.message);
      if (btn) {
        btn.textContent = 'Gagal — coba lagi';
        setTimeout(() => { btn.textContent = original; btn.disabled = false; }, 2500);
      }
    }
  });
})();

/* ---------- Love Story — 3D Cylinder (CSS transforms + rAF spin + drag) ---------- */
(function gallery3D() {
  const scene = document.getElementById('g3dScene');
  const stage = document.getElementById('g3dStage');
  if (!scene || !stage) return;

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let rot = 0;                  // current rotation in degrees
  let velocity = 0;             // deg/ms (for flick momentum)
  const autoSpeed = -360 / 100000; // full turn every 100s (negative = counter-clockwise)
  let isDragging = false;
  let hoverPaused = false;
  let lastT = performance.now();

  function apply() {
    stage.style.setProperty('--rot', rot.toFixed(3) + 'deg');
  }
  apply();

  function tick(t) {
    const dt = t - lastT;
    lastT = t;

    if (!isDragging) {
      if (Math.abs(velocity) > 0.0001) {
        // Flick momentum decay
        rot += velocity * dt;
        velocity *= Math.pow(0.94, dt / 16.67);
        if (Math.abs(velocity) < 0.002) velocity = 0;
      } else if (!reduceMotion && !hoverPaused) {
        rot += autoSpeed * dt;
      }
      apply();
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  /* ---------- Drag to rotate ---------- */
  let startX = 0;
  let startY = 0;
  let startRot = 0;
  let lastX = 0;
  let lastDragT = 0;
  let touchPending = false;     // touch started, direction not yet locked
  let touchCommitted = false;   // touch locked as horizontal drag
  const DRAG_SENS = 0.4;        // deg per px (sedikit dikurangi)
  const DIR_THRESHOLD = 8;      // px moved before deciding direction
  const H_DOMINANCE = 1.2;      // |dx| must be > 1.2 × |dy| to count as horizontal

  function getPoint(e) {
    if (e.touches && e.touches[0]) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    return { x: e.clientX, y: e.clientY };
  }

  /* ---- Mouse drag (immediate — no direction check) ---- */
  function onMouseDown(e) {
    isDragging = true;
    velocity = 0;
    const p = getPoint(e);
    startX = lastX = p.x;
    startY = p.y;
    lastDragT = performance.now();
    startRot = rot;
    scene.classList.add('is-dragging');
  }

  function onMouseMove(e) {
    if (!isDragging) return;
    const p = getPoint(e);
    rot = startRot + (p.x - startX) * DRAG_SENS;
    apply();
    const now = performance.now();
    const dt = now - lastDragT;
    if (dt > 0) velocity = ((p.x - lastX) * DRAG_SENS) / dt;
    lastX = p.x;
    lastDragT = now;
  }

  function onMouseUp() {
    if (!isDragging) return;
    isDragging = false;
    scene.classList.remove('is-dragging');
  }

  /* ---- Touch drag (direction-aware) ---- */
  function onTouchStart(e) {
    // DON'T preventDefault on touchstart — let browser decide scroll initially
    touchPending = true;
    touchCommitted = false;
    isDragging = false;
    const p = getPoint(e);
    startX = lastX = p.x;
    startY = p.y;
    lastDragT = performance.now();
  }

  function onTouchMove(e) {
    if (!touchPending && !touchCommitted) return;
    const p = getPoint(e);
    const dx = p.x - startX;
    const dy = p.y - startY;

    // Direction-lock phase: wait until user moves enough to decide
    if (touchPending && !touchCommitted) {
      if (Math.abs(dx) < DIR_THRESHOLD && Math.abs(dy) < DIR_THRESHOLD) return;

      if (Math.abs(dx) > H_DOMINANCE * Math.abs(dy)) {
        // Dominant horizontal → commit as drag
        touchCommitted = true;
        touchPending = false;
        isDragging = true;
        velocity = 0;
        startRot = rot;
        scene.classList.add('is-dragging');
        // Recalibrate start so current finger pos becomes zero drag
        startX = lastX = p.x;
      } else {
        // Dominant vertical → abandon, let browser scroll normally
        touchPending = false;
        return;
      }
    }

    if (touchCommitted) {
      rot = startRot + (p.x - startX) * DRAG_SENS;
      apply();
      const now = performance.now();
      const dt = now - lastDragT;
      if (dt > 0) velocity = ((p.x - lastX) * DRAG_SENS) / dt;
      lastX = p.x;
      lastDragT = now;
      if (e.cancelable) e.preventDefault();
    }
  }

  function onTouchEnd() {
    if (touchCommitted) {
      isDragging = false;
      scene.classList.remove('is-dragging');
    }
    touchPending = false;
    touchCommitted = false;
  }

  // Mouse (desktop)
  scene.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('mouseleave', onMouseUp);

  // Touch (mobile) — passive start so vertical scroll feels instant
  scene.addEventListener('touchstart', onTouchStart, { passive: true });
  window.addEventListener('touchmove', onTouchMove, { passive: false });
  window.addEventListener('touchend', onTouchEnd);
  window.addEventListener('touchcancel', onTouchEnd);

  // Pause on hover (desktop non-touch)
  if (!matchMedia('(hover: none)').matches) {
    scene.addEventListener('mouseenter', () => { hoverPaused = true; });
    scene.addEventListener('mouseleave', () => { hoverPaused = false; });
  }
})();
