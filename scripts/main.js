/* TAct H — interactions */
(() => {
  const prefersReduced =
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Nav : état scroll + thème selon la section survolée ---------- */
  const nav = document.querySelector('.nav');
  const themedSections = Array.from(document.querySelectorAll('[data-theme]'));
  const setNavState = () => {
    if (window.scrollY > 24) nav.classList.add('is-scrolled');
    else nav.classList.remove('is-scrolled');

    // Déterminer le thème de la section actuellement derrière la nav
    const navY = 40; // point d'échantillonnage sous la nav
    let current = null;
    for (const s of themedSections) {
      const r = s.getBoundingClientRect();
      if (r.top <= navY && r.bottom > navY) { current = s; break; }
    }
    if (current && current.dataset.theme === 'paper') {
      nav.classList.add('is-over-paper');
    } else {
      nav.classList.remove('is-over-paper');
    }
  };
  setNavState();
  window.addEventListener('scroll', setNavState, { passive: true });
  window.addEventListener('resize', setNavState);

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

  /* ---------- Smooth scroll ---------- */
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

  /* ---------- Custom cursor (petit point qui suit) ---------- */
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
    const hoverable = document.querySelectorAll('a, button, .work, .dual__item');
    hoverable.forEach((el) => {
      el.addEventListener('mouseenter', () => cursor.classList.add('is-hover'));
      el.addEventListener('mouseleave', () => cursor.classList.remove('is-hover'));
    });
  }

  /* ---------- Dual avant / après (hover grossit / dégonfle) ---------- */
  const dual = document.querySelector('[data-dual]');
  if (dual) {
    const items = dual.querySelectorAll('[data-dual-item]');
    const setFocus = (f) => {
      if (f) dual.setAttribute('data-focus', f);
      else dual.removeAttribute('data-focus');
    };

    items.forEach((item) => {
      const key = item.getAttribute('data-dual-item');
      item.addEventListener('mouseenter', () => setFocus(key));
      item.addEventListener('focusin',    () => setFocus(key));
      item.addEventListener('click',      () => setFocus(key));
    });
    dual.addEventListener('mouseleave', () => setFocus(null));

    /* Tactile / clavier : toggle */
    items.forEach((item) => {
      item.setAttribute('tabindex', '0');
      item.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const k = item.getAttribute('data-dual-item');
          const cur = dual.getAttribute('data-focus');
          setFocus(cur === k ? null : k);
        }
      });
    });

    /* Démo d'intro : oscille une fois visible */
    if (!prefersReduced && 'IntersectionObserver' in window) {
      const demo = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          demo.disconnect();
          setTimeout(() => setFocus('before'), 500);
          setTimeout(() => setFocus('after'),  1600);
          setTimeout(() => setFocus(null),     2700);
        });
      }, { threshold: 0.4 });
      demo.observe(dual);
    }
  }

  /* ---------- Stack de slides : la slide visée monte, les autres reculent ---------- */
  const stack = document.querySelector('[data-stack]');
  if (stack) {
    const items = stack.querySelectorAll('[data-stack-item]');
    const setStackFocus = (k) => {
      if (k === null || k === undefined) stack.removeAttribute('data-focus');
      else stack.setAttribute('data-focus', String(k));
    };
    items.forEach((it) => {
      const k = it.getAttribute('data-stack-item');
      it.addEventListener('mouseenter', () => setStackFocus(k));
      it.addEventListener('focusin',    () => setStackFocus(k));
      it.addEventListener('click',      () => setStackFocus(k));
      it.setAttribute('tabindex', '0');
    });
    stack.addEventListener('mouseleave', () => setStackFocus(null));

    /* Démo d'intro : balaye une fois quand visible */
    if (!prefersReduced && 'IntersectionObserver' in window) {
      const demo = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          demo.disconnect();
          setTimeout(() => setStackFocus('0'), 400);
          setTimeout(() => setStackFocus('1'), 1200);
          setTimeout(() => setStackFocus('2'), 2000);
          setTimeout(() => setStackFocus(null), 2900);
        });
      }, { threshold: 0.35 });
      demo.observe(stack);
    }
  }

  /* ---------- Cases : slider auto, change toutes les 3.8s ---------- */
  const cases = document.querySelector('[data-cases]');
  if (cases) {
    const track   = cases.querySelector('[data-cases-track]');
    const slides  = cases.querySelectorAll('[data-case-slide]');
    const caps    = cases.querySelectorAll('[data-case-caption]');
    const pips    = cases.querySelectorAll('[data-cases-pip]');
    const total   = slides.length;
    const interval = 3800;
    let idx = 0;
    let timer = null;
    let visible = false;

    const render = () => {
      track.style.transform = `translateX(-${idx * 100}%)`;
      caps.forEach((c, i) => c.classList.toggle('is-active', i === idx));
      pips.forEach((p, i) => p.classList.toggle('is-active', i === idx));
    };
    const next = () => { idx = (idx + 1) % total; render(); };
    const start = () => {
      if (prefersReduced || timer) return;
      timer = setInterval(next, interval);
    };
    const stop = () => {
      if (timer) { clearInterval(timer); timer = null; }
    };

    /* Pause quand l'onglet n'est pas visible (économie de batterie) */
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stop();
      else if (visible) start();
    });

    /* Démarre / arrête selon la visibilité dans le viewport */
    if ('IntersectionObserver' in window) {
      const io2 = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          visible = entry.isIntersecting;
          if (visible) start();
          else stop();
        });
      }, { threshold: 0.25 });
      io2.observe(cases);
    } else {
      start();
    }

    render();
  }

  /* ---------- Compteurs hero : chiffres qui montent ---------- */
  const counters = document.querySelectorAll('[data-counter]');
  if (counters.length) {
    const animateCount = (el) => {
      const target = parseInt(el.dataset.counter, 10);
      if (!Number.isFinite(target)) return;
      if (prefersReduced) {
        el.textContent = target.toLocaleString('fr-FR');
        return;
      }
      const duration = 1800;
      const startTime = performance.now();
      const tick = (now) => {
        const t = Math.min(1, (now - startTime) / duration);
        const eased = 1 - Math.pow(1 - t, 3); /* ease-out cubic */
        const value = Math.round(target * eased);
        el.textContent = value.toLocaleString('fr-FR');
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };

    /* Petite tempo pour laisser le hero se poser avant que les chiffres montent */
    const launch = (el) => {
      const delay = parseInt(el.dataset.counterDelay || '700', 10);
      setTimeout(() => animateCount(el), delay);
    };

    if ('IntersectionObserver' in window) {
      const io3 = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            launch(entry.target);
            io3.unobserve(entry.target);
          }
        });
      }, { threshold: 0.4 });
      counters.forEach((c) => io3.observe(c));
    } else {
      counters.forEach((c) => animateCount(c));
    }
  }
})();
