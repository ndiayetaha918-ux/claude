/* TAct H — interactions */
(() => {
  const prefersReduced =
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Wrap .reveal text in inner span (for mask animation) ---------- */
  document.querySelectorAll('.reveal').forEach((el) => {
    if (el.dataset.wrapped) return;
    const inner = document.createElement('span');
    inner.className = 'reveal__inner';
    while (el.firstChild) inner.appendChild(el.firstChild);
    el.appendChild(inner);
    el.dataset.wrapped = '1';
  });

  /* ---------- Nav scroll state ---------- */
  const nav = document.querySelector('.nav');
  const setNavState = () => {
    if (window.scrollY > 24) nav.classList.add('is-scrolled');
    else nav.classList.remove('is-scrolled');
  };
  setNavState();
  window.addEventListener('scroll', setNavState, { passive: true });

  /* ---------- Section reveal on scroll ---------- */
  const sections = document.querySelectorAll('[data-section]');
  if ('IntersectionObserver' in window && !prefersReduced) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -8% 0px' }
    );
    sections.forEach((s) => io.observe(s));
  } else {
    sections.forEach((s) => s.classList.add('is-visible'));
  }

  /* ---------- Smooth scroll for nav links ---------- */
  document.querySelectorAll('[data-link]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const href = a.getAttribute('href');
      if (!href || !href.startsWith('#')) return;
      const target = document.querySelector(href);
      if (!target) return;
      e.preventDefault();
      const top = target.getBoundingClientRect().top + window.scrollY - 80;
      window.scrollTo({ top, behavior: prefersReduced ? 'auto' : 'smooth' });
    });
  });

  /* ---------- Custom cursor ---------- */
  const cursor = document.querySelector('.cursor');
  if (cursor && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    let x = 0, y = 0, tx = 0, ty = 0;
    document.addEventListener('mousemove', (e) => {
      tx = e.clientX; ty = e.clientY;
    });
    const tick = () => {
      x += (tx - x) * 0.22;
      y += (ty - y) * 0.22;
      cursor.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
      requestAnimationFrame(tick);
    };
    tick();
    const hoverable = document.querySelectorAll('a, button, .work, [data-ba-handle]');
    hoverable.forEach((el) => {
      el.addEventListener('mouseenter', () => cursor.classList.add('is-hover'));
      el.addEventListener('mouseleave', () => cursor.classList.remove('is-hover'));
    });
  }

  /* ---------- Before / After slider ---------- */
  const ba = document.querySelector('[data-ba]');
  if (ba) {
    const frame = ba.querySelector('.ba__frame');
    const before = ba.querySelector('[data-ba-before]');
    const handle = ba.querySelector('[data-ba-handle]');
    let dragging = false;
    let pct = 50;

    const setPct = (p) => {
      pct = Math.max(2, Math.min(98, p));
      before.style.clipPath = `inset(0 ${100 - pct}% 0 0)`;
      before.style.webkitClipPath = `inset(0 ${100 - pct}% 0 0)`;
      handle.style.left = `${pct}%`;
    };

    const fromEvent = (e) => {
      const r = frame.getBoundingClientRect();
      const x = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
      return (x / r.width) * 100;
    };

    const start = (e) => {
      dragging = true;
      setPct(fromEvent(e));
      document.body.style.userSelect = 'none';
    };
    const move = (e) => {
      if (!dragging) return;
      setPct(fromEvent(e));
    };
    const end = () => {
      dragging = false;
      document.body.style.userSelect = '';
    };

    frame.addEventListener('mousedown', start);
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', end);

    frame.addEventListener('touchstart', start, { passive: true });
    document.addEventListener('touchmove', move, { passive: true });
    document.addEventListener('touchend', end);

    // initial position
    setPct(50);

    // Auto demo: sweep to reveal once visible the first time
    if (!prefersReduced && 'IntersectionObserver' in window) {
      const demoIO = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            demoIO.disconnect();
            const startTime = performance.now();
            const dur = 2200;
            const animate = (now) => {
              const t = Math.min((now - startTime) / dur, 1);
              // ease in-out
              const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
              // sweep 50 -> 80 -> 30 -> 50
              const v = 50 + Math.sin(eased * Math.PI * 2) * 30;
              setPct(v);
              if (t < 1) requestAnimationFrame(animate);
              else setPct(50);
            };
            requestAnimationFrame(animate);
          });
        },
        { threshold: 0.4 }
      );
      demoIO.observe(ba);
    }
  }

  /* ---------- Tilt on works ---------- */
  if (!prefersReduced && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    document.querySelectorAll('[data-tilt]').forEach((el) => {
      let rect = null;
      const enter = () => {
        rect = el.getBoundingClientRect();
        el.style.transition = 'transform .25s cubic-bezier(.2,.7,.2,1)';
      };
      const move = (e) => {
        if (!rect) return;
        const dx = (e.clientX - rect.left) / rect.width - 0.5;
        const dy = (e.clientY - rect.top) / rect.height - 0.5;
        el.style.transform = `perspective(900px) rotateY(${dx * 6}deg) rotateX(${-dy * 6}deg) translateY(-4px)`;
      };
      const leave = () => {
        rect = null;
        el.style.transform = '';
      };
      el.addEventListener('mouseenter', enter);
      el.addEventListener('mousemove', move);
      el.addEventListener('mouseleave', leave);
    });
  }

  /* ---------- Subtle parallax on hero bg wordmark ---------- */
  const heroBg = document.querySelector('.hero__bg');
  if (heroBg && !prefersReduced) {
    window.addEventListener(
      'scroll',
      () => {
        const y = window.scrollY;
        if (y > window.innerHeight) return;
        heroBg.style.transform = `translateY(${y * 0.18}px)`;
      },
      { passive: true }
    );
  }
})();
