(function(){
  async function fetchJSON(url, opts){
    const res = await fetch(url, opts);
    const text = await res.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch(e) { data = { error: text || `Request failed (${res.status})` }; }
    if(!res.ok) throw data;
    return data;
  }

  function ensureResponsiveStyles(){
    if(document.getElementById('rs-responsive-styles')) return;
    const style = document.createElement('style');
    style.id = 'rs-responsive-styles';
    style.textContent = `
      .rs-menu-toggle{
        display:none;
        align-items:center;
        justify-content:center;
        width:38px;
        height:38px;
        border:1px solid #e6e6e9;
        background:#fff;
        border-radius:8px;
        cursor:pointer;
        font-size:18px;
        line-height:1;
      }
      @media (max-width:900px){
        .topbar{flex-wrap:wrap;row-gap:10px}
        .topbar > nav{
          display:none;
          order:5;
          width:100%;
          flex-direction:column;
          align-items:stretch;
          gap:8px;
          padding:6px 0 2px;
        }
        .topbar.rs-nav-open > nav{display:flex}
        .topbar > nav .cat-container{padding-bottom:0}
        .topbar > nav .cat-link{
          display:block;
          width:100%;
          padding:10px 12px;
          border:1px solid #eee;
          border-radius:8px;
          background:#fff;
        }
        .topbar > nav .cat-dropdown{
          position:static;
          top:auto;
          left:auto;
          opacity:1;
          visibility:visible;
          min-width:unset;
          box-shadow:none;
          border:1px solid #eee;
          border-radius:8px;
          margin-top:6px;
        }
        .topbar > nav .cat-dropdown a{padding:10px 12px}
        .topbar > .search{
          order:4;
          width:100%;
          margin:0;
        }
        .rs-menu-toggle{display:inline-flex}
      }
    `;
    document.head.appendChild(style);
  }

  function setupResponsiveHeader(){
    const topbar = document.querySelector('.topbar');
    const nav = topbar ? topbar.querySelector('nav') : null;
    const actions = topbar ? topbar.querySelector('.actions') : null;
    if(!topbar || !nav || !actions) return;

    ensureResponsiveStyles();

    if(!topbar.querySelector('.rs-menu-toggle')){
      const toggle = document.createElement('button');
      toggle.className = 'rs-menu-toggle';
      toggle.type = 'button';
      toggle.setAttribute('aria-label', 'Toggle menu');
      toggle.textContent = 'Menu';
      actions.prepend(toggle);
      toggle.addEventListener('click', ()=> topbar.classList.toggle('rs-nav-open'));
    }

    window.addEventListener('resize', ()=>{
      if(window.innerWidth > 900) topbar.classList.remove('rs-nav-open');
    });
  }

  async function syncCartBadge(){
    try{
      const items = await fetchJSON('/api/cart');
      const total = items.reduce((s,i)=>s + (i.qty||0), 0);
      const badge = document.getElementById('cartBadge');
      if(badge){ if(total>0){ badge.style.display='block'; badge.textContent = total } else badge.style.display='none'; }
    }catch(err){ console.debug('no backend', err) }
  }

  function showNotification(message, type='success'){
    const toast = document.createElement('div');
    toast.style.cssText = `position:fixed;bottom:20px;right:20px;background:${type==='success'?'#4caf50':'#f44336'};color:#fff;padding:16px 20px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);z-index:99999;font-size:14px;animation:slideIn 0.3s ease-out;max-width:300px`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    // Add keyframe animation
    if(!document.getElementById('notification-styles')){
      const style = document.createElement('style');
      style.id = 'notification-styles';
      style.textContent = `@keyframes slideIn{from{transform:translateX(400px);opacity:0}to{transform:translateX(0);opacity:1}}`;
      document.head.appendChild(style);
    }
    
    setTimeout(()=>{ toast.style.animation='slideIn 0.3s ease-out reverse'; setTimeout(()=>toast.remove(), 300); }, 3000);
  }

  window.addToCart = async function(id){
    try{
      const p = (typeof productsData !== 'undefined') ? productsData.find(x=>x.id===id) : null;
      await fetchJSON('/api/cart/add', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ id: p ? p.id : id, title: p ? p.title : 'Item', price: p ? p.price : 0, qty: 1 }) });
      await syncCartBadge();
      showNotification('Item added to cart', 'success');
    }catch(err){
      showNotification(err.error || 'Failed to add to cart', 'error');
    }
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    const btn = document.getElementById('cartBtn'); if(btn) btn.addEventListener('click', ()=>{ window.location.href = '/cart.html' });
    setupResponsiveHeader();
    syncCartBadge();
  });
  // Create a shared backdrop once
  function ensureSharedBackdrop(){
    if(document.getElementById('rs-backdrop')) return;
    const bd = document.createElement('div');
    bd.id = 'rs-backdrop';
    bd.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:none;z-index:9999';
    bd.addEventListener('click', ()=>{ 
      const m = document.getElementById('rs-auth-modal'); 
      const su = document.getElementById('rs-signup-modal');
      if(m && m.style.display === 'flex') hideAuthModal();
      else if(su && su.style.display === 'flex'){ su.style.display='none'; hideBackdrop(); }
    });
    document.body.appendChild(bd);
  }

  // --- Auth modal ---
  function createAuthModal(){
    if(isStandaloneAuthPage()) return;
    if(document.getElementById('rs-auth-modal')) return;
    ensureSharedBackdrop();
    // Ensure body doesn't interfere with backdrop visibility
    if(!document.body.style.position) document.body.style.position = 'relative';
    const html = `
      <div id="rs-auth-modal" style="position:fixed;inset:0;display:none;align-items:center;justify-content:center;z-index:10000;pointer-events:none">
        <div style="position:relative;max-width:920px;width:95%;display:flex;gap:20px;background:#fff;border-radius:8px;overflow:hidden;pointer-events:auto">
          <div style="flex:1;padding:28px;background:linear-gradient(180deg,#fff,#f7fbff)">
            <h2 style="margin:0 0 8px">Welcome back</h2>
            <p style="color:#666;margin:0 0 12px">Sign in to access your orders and faster checkout.</p>
            <div style="max-height:420px;overflow:auto">
              <img src="https://images.unsplash.com/photo-1542291026-7eec264c27ff?q=80&w=800&auto=format&fit=crop&ixlib=rb-4.0.3&s=abc" alt="" style="width:100%;border-radius:8px;object-fit:cover" />
            </div>
          </div>
          <div style="width:420px;padding:22px;background:#fff;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
              <strong style="font-size:18px">Sign in</strong>
              <button id="rs-close" style="border:0;background:transparent;font-size:18px;cursor:pointer">✕</button>
            </div>
            <div id="rs-error" style="color:#b00020;display:none;margin-bottom:8px"></div>
            <form id="rs-signin-form">
              <label style="display:block;font-size:13px;margin-bottom:6px">Email</label>
              <input id="rs-email" type="email" required style="width:100%;padding:10px;border:1px solid #e6e6ea;border-radius:6px;margin-bottom:10px" />
              <label style="display:block;font-size:13px;margin-bottom:6px">Password</label>
              <input id="rs-password" type="password" required style="width:100%;padding:10px;border:1px solid #e6e6ea;border-radius:6px;margin-bottom:12px" />
              <button id="rs-submit" class="rs-btn" type="submit" style="width:100%;padding:10px;background:#2874f0;color:#fff;border:0;border-radius:6px;cursor:pointer">Sign in</button>
            </form>
            <div style="text-align:center;margin-top:12px;color:#666">Or <a href="#" id="rs-to-signup">create a new account</a></div>
            <hr style="margin:14px 0" />
            <div style="font-size:13px;color:#666">Continue as guest or close this box to continue shopping.</div>
          </div>
        </div>
      </div>
    `;
    const div = document.createElement('div'); div.innerHTML = html; document.body.appendChild(div.firstElementChild);

    // wiring
    const modal = document.getElementById('rs-auth-modal');
    document.getElementById('rs-close').addEventListener('click', hideAuthModal);
    document.querySelector('#rs-auth-modal > div').addEventListener('click', (e)=>e.stopPropagation());
    document.getElementById('rs-to-signup').addEventListener('click', (e)=>{ e.preventDefault(); showSignUp(); });

    document.getElementById('rs-signin-form').addEventListener('submit', async (e)=>{
      e.preventDefault();
      const err = document.getElementById('rs-error'); err.style.display='none'; err.textContent='';
      const email = document.getElementById('rs-email').value.trim();
      const password = document.getElementById('rs-password').value;
      try{
        const res = await fetch('/api/signin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});
        if(!res.ok){ const j = await res.json().catch(()=>({})); throw j }
        hideAuthModal(); window.location.reload();
      }catch(errv){ err.style.display='block'; err.textContent = errv && errv.error ? errv.error : 'Sign in failed'; }
    });
  }

  function showAuthModal(){ createAuthModal(); const m = document.getElementById('rs-auth-modal'); const su = document.getElementById('rs-signup-modal'); if(su) su.style.display='none'; m.style.display='flex'; showBackdrop(); }
  function hideAuthModal(){ const m = document.getElementById('rs-auth-modal'); if(m) m.style.display='none'; hideBackdrop(); }
  
  function showBackdrop(){ const bd = document.getElementById('rs-backdrop'); if(bd) bd.style.display='block'; }
  function hideBackdrop(){ const bd = document.getElementById('rs-backdrop'); if(bd) bd.style.display='none'; }

  function createSignupModal(){
    if(isStandaloneAuthPage()) return;
    if(document.getElementById('rs-signup-modal')) return;
    ensureSharedBackdrop();
    const html = `
      <div id="rs-signup-modal" style="position:fixed;inset:0;display:none;align-items:center;justify-content:center;z-index:10000;pointer-events:none">
        <div style="background:#fff;padding:20px;border-radius:8px;max-width:420px;width:95%;pointer-events:auto">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
            <strong>Create account</strong>
            <button id="rs-su-close" style="border:0;background:transparent;font-size:18px;cursor:pointer">✕</button>
          </div>
          <div id="rs-su-error" style="color:#b00020;display:none;margin-bottom:8px"></div>
          <form id="rs-signup-form">
            <label style="display:block;margin-bottom:6px">Full name</label>
            <input id="rs-su-name" required style="width:100%;padding:10px;border:1px solid #e6e6ea;border-radius:6px;margin-bottom:8px" />
            <label style="display:block;margin-bottom:6px">Email</label>
            <input id="rs-su-email" type="email" required style="width:100%;padding:10px;border:1px solid #e6e6ea;border-radius:6px;margin-bottom:8px" />
            <label style="display:block;margin-bottom:6px">Password</label>
            <input id="rs-su-password" type="password" required style="width:100%;padding:10px;border:1px solid #e6e6ea;border-radius:6px;margin-bottom:12px" />
            <button class="rs-btn" type="submit" style="width:100%;padding:10px;background:#2874f0;color:#fff;border:0;border-radius:6px;cursor:pointer">Create account</button>
          </form>
        </div>
      </div>
    `;
    const div = document.createElement('div'); div.innerHTML = html; document.body.appendChild(div.firstElementChild);
    document.querySelector('#rs-signup-modal > div').addEventListener('click', (e)=>e.stopPropagation());
    document.getElementById('rs-su-close').addEventListener('click', ()=>{ document.getElementById('rs-signup-modal').style.display='none'; hideBackdrop(); });
    document.getElementById('rs-signup-form').addEventListener('submit', async (e)=>{
      e.preventDefault();
      const err = document.getElementById('rs-su-error'); err.style.display='none'; err.textContent='';
      const name = document.getElementById('rs-su-name').value.trim();
      const email = document.getElementById('rs-su-email').value.trim();
      const password = document.getElementById('rs-su-password').value;
      try{
        const res = await fetch('/api/signup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,email,password})});
        if(!res.ok){ const j = await res.json().catch(()=>({})); throw j }
        hideBackdrop(); window.location.reload();
      }catch(errv){ err.style.display='block'; err.textContent = errv && errv.error ? errv.error : 'Signup failed' }
    });
  }

  const isStandaloneAuthPage = () => {
    const p = (window.location && window.location.pathname) ? window.location.pathname.toLowerCase() : '';
    return p.endsWith('/signin.html') || p.endsWith('/signup.html');
  };

  function showSignIn(){
    if(isStandaloneAuthPage()){ window.location.href = '/signin.html'; return; }
    createAuthModal(); const m = document.getElementById('rs-auth-modal'); const su = document.getElementById('rs-signup-modal'); if(su) su.style.display='none'; m.style.display='flex'; showBackdrop();
  }
  function showSignUp(){
    if(isStandaloneAuthPage()){ window.location.href = '/signup.html'; return; }
    createSignupModal(); const su = document.getElementById('rs-signup-modal'); const m = document.getElementById('rs-auth-modal'); if(m) m.style.display='none'; su.style.display='flex'; showBackdrop();
  }

  // expose to global
  window.showSignIn = showSignIn;
  window.showSignUp = showSignUp;
  // expose notification to global so inline scripts can use it
  window.showNotification = showNotification;

  // Dark mode support
  function initDarkMode(){
    const style = document.createElement('style');
    style.textContent = `
      body.dark-mode { background:#1a1a1a; color:#fff; }
      body.dark-mode header { background:#222; border-bottom-color:#333; }
      body.dark-mode .utility-bar { background:#161b21; }
      body.dark-mode .topbar { background:#222a34; }
      body.dark-mode nav a { color:#ccc; }
      body.dark-mode nav { background:#243244; }
      body.dark-mode .cat-dropdown { background:#222; border-color:#333; }
      body.dark-mode .cat-dropdown a { color:#ccc; }
      body.dark-mode .card, body.dark-mode .section, body.dark-mode .items, body.dark-mode .summary, body.dark-mode .filters, body.dark-mode .banner, body.dark-mode .promo-card { background:#222; border-color:#333; }
      body.dark-mode input { background:#333; color:#fff; border-color:#444; }
      body.dark-mode .muted { color:#c3c9d2 !important; }
      body.dark-mode footer { background:#11161d !important; border-top-color:#273447 !important; }
    `;
    document.head.appendChild(style);
  }

  initDarkMode();

  function setDarkMode(enabled){
    document.body.classList.toggle('dark-mode', enabled);
    try { localStorage.setItem('darkMode', String(enabled)); } catch(e) {}
  }

  function bindDarkModeToggle(){
    const btn = document.getElementById('darkModeBtn');
    if(!btn || btn.dataset.darkBound === '1') return;
    btn.dataset.darkBound = '1';

    const initial = (() => {
      try { return localStorage.getItem('darkMode') === 'true'; } catch(e) { return false; }
    })();
    setDarkMode(initial);

    btn.addEventListener('click', (e)=>{
      e.preventDefault();
      setDarkMode(!document.body.classList.contains('dark-mode'));
    });
  }

  // Account menu in navbar
  async function initAccountMenu(){
    try {
      const account = await fetchJSON('/api/account');
      const signinBtn = Array.from(document.querySelectorAll('a')).find(a => a.textContent.toLowerCase().includes('sign in'));
      
      if(signinBtn && account.user){
        signinBtn.textContent = '👤 ' + account.user.name.split(' ')[0];
        signinBtn.href = '#';
        signinBtn.onclick = (e) => {
          e.preventDefault();
          const menu = document.getElementById('account-menu');
          if(menu) menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
          else createAccountMenu();
        };
      }
    } catch(err) {}
  }

  function createAccountMenu(){
    if(document.getElementById('account-menu')) return;
    const menu = document.createElement('div');
    menu.id = 'account-menu';
    menu.style.cssText = 'position:fixed;top:60px;right:20px;background:#fff;border:1px solid #e6e6e9;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.1);z-index:1000;min-width:180px';
    menu.innerHTML = `
      <a href="/profile.html" style="display:block;padding:10px 16px;border-bottom:1px solid #f0f0f0;text-decoration:none;color:#111">👤 Profile</a>
      <a href="/orders.html" style="display:block;padding:10px 16px;border-bottom:1px solid #f0f0f0;text-decoration:none;color:#111">📦 Orders</a>
      <a href="/wishlist.html" style="display:block;padding:10px 16px;border-bottom:1px solid #f0f0f0;text-decoration:none;color:#111">♥ Wishlist</a>
      <a href="#" onclick="fetch('/api/signout',{method:'POST'}).then(()=>window.location.reload());return false;" style="display:block;padding:10px 16px;text-decoration:none;color:#f44336">🚪 Logout</a>
    `;
    document.body.appendChild(menu);
    
    document.addEventListener('click', (e) => {
      if(!e.target.closest('#account-menu') && !e.target.closest('a[href*=\"profile\"]')){
        menu.style.display = 'none';
      }
    });
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    initAccountMenu();
    bindDarkModeToggle();
  });

})();
