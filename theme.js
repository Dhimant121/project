(function () {
  function q(sel, root) { return (root || document).querySelector(sel); }
  function qa(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

  function applyShell() {
    document.body.classList.add('rs-pro');

    const path = (window.location.pathname || '/').split('/').pop() || 'index.html';
    document.body.classList.add('rs-page-' + path.replace('.html', '').replace(/[^a-z0-9\-]/gi, '').toLowerCase());

    const topbar = q('.topbar');
    if (topbar) topbar.classList.add('fade-in');

    const navLinks = qa('nav a');
    const current = (window.location.pathname || '/').toLowerCase();
    navLinks.forEach(function (link) {
      const href = (link.getAttribute('href') || '').toLowerCase();
      if (href && href !== '/' && current.endsWith(href.replace(/^\//, ''))) {
        link.classList.add('active');
      }
    });

    const cartBtn = q('#cartBtn');
    if (cartBtn) {
      const txt = cartBtn.textContent || '';
      cartBtn.textContent = txt.replace(/[^\x20-\x7E]/g, '').trim() || 'Cart';
    }

    const footer = q('footer');
    if (footer) footer.classList.add('fade-in');
  }

  function decorateCards() {
    qa('.card').forEach(function (card, i) {
      card.classList.add('fade-in');
      card.style.animationDelay = ((i % 8) * 22) + 'ms';

      const img = q('img', card);
      if (img && !img.getAttribute('loading')) img.setAttribute('loading', 'lazy');

      if (q('.rs-meta', card)) return;
      const priceEl = q('.price', card);
      if (!priceEl) return;

      const raw = priceEl.textContent || '';
      const num = parseInt(raw.replace(/[^0-9]/g, ''), 10);
      if (!num || Number.isNaN(num)) return;

      const discount = Math.max(10, Math.min(45, (num % 35) + 10));
      const rating = (4 + ((num % 10) / 10)).toFixed(1);

      const meta = document.createElement('div');
      meta.className = 'rs-meta';
      meta.innerHTML = '<span class="rs-rating">' + rating + ' star</span><span class="rs-discount">' + discount + '% off today</span>';

      const title = q('h3', card);
      if (title && title.parentNode) {
        title.insertAdjacentElement('afterend', meta);
      } else {
        card.appendChild(meta);
      }
    });
  }

  function attachWishlistButtons() {
    qa('.card').forEach(function (card) {
      const actions = q('.actions', card);
      if (!actions || q('.rs-wishlist-btn', actions)) return;

      const viewBtn = Array.from(actions.querySelectorAll('button')).find(function (b) {
        return /^view$/i.test((b.textContent || '').trim());
      });
      if (viewBtn) viewBtn.remove();

      const addBtn = Array.from(actions.querySelectorAll('button')).find(function (b) {
        return /add/i.test((b.textContent || '').toLowerCase());
      });
      if (!addBtn) return;

      const onclickValue = addBtn.getAttribute('onclick') || '';
      const match = onclickValue.match(/addToCart\((\d+)\)/);
      if (!match) return;

      const productId = Number(match[1]);
      if (!productId) return;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-primary rs-wishlist-btn';
      btn.textContent = 'Add to Wishlist';
      btn.addEventListener('click', async function (e) {
        e.preventDefault();
        if (typeof window.addToWishlist === 'function') {
          await window.addToWishlist(productId);
        }
      });
      actions.appendChild(btn);
    });
  }

  function attachCardNavigation() {
    qa('.card').forEach(function (card) {
      const actions = q('.actions', card);
      if (!actions) return;

      const addBtn = Array.from(actions.querySelectorAll('button')).find(function (b) {
        return /add/i.test((b.textContent || '').toLowerCase());
      });
      if (!addBtn) return;

      const onclickValue = addBtn.getAttribute('onclick') || '';
      const match = onclickValue.match(/addToCart\((\d+)\)/);
      if (!match) return;
      const productId = Number(match[1]);
      if (!productId) return;

      const goToProduct = function () {
        if (typeof window.view === 'function') window.view(productId);
        else window.location.href = '/product-detail.html?id=' + productId;
      };

      const clickable = []
        .concat(qa('img', card))
        .concat(qa('h3', card))
        .concat(qa('.product-title', card))
        .concat(qa('.title', card));

      clickable.forEach(function (el) {
        if (!el || el.dataset.rsNavBound === '1') return;
        el.dataset.rsNavBound = '1';
        el.style.cursor = 'pointer';
        el.addEventListener('click', function (e) {
          e.preventDefault();
          goToProduct();
        });
      });
    });
  }

  function decoratePageBlocks() {
    qa('.banner, .hero, .items, .summary, .filters').forEach(function (el, i) {
      el.classList.add('fade-in');
      el.style.animationDelay = (i * 35) + 'ms';
    });

    qa('.summary h3, .items h2, .banner h1').forEach(function (h) {
      h.style.fontFamily = '"Space Grotesk", "Manrope", sans-serif';
    });
  }

  function bindDarkModeLabel() {
    const btn = q('#darkModeBtn');
    if (!btn) return;
    if (!btn.textContent || btn.textContent.trim().length < 2) btn.textContent = 'Mode';
  }

  function init() {
    applyShell();
    decorateCards();
    attachWishlistButtons();
    attachCardNavigation();
    decoratePageBlocks();
    bindDarkModeLabel();

    const target = q('#products') || document.body;
    const obs = new MutationObserver(function () {
      decorateCards();
      attachWishlistButtons();
      attachCardNavigation();
    });
    obs.observe(target, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
