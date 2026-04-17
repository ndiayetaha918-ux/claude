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
})();
