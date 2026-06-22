/*
  Product image zoom — replaces magnify.js + product-media-modal.
  Handles:
    - <product-lightbox>: full-screen Splide slider with per-slide zoom (wheel/dblclick + drag on desktop, pinch + double-tap + pan on mobile)
    - <product-hover-zoom>: desktop hover-zoom on the main gallery image (inline lens or side-by-side pane)
    - Click wiring on <media-gallery> to open the matching lightbox when the desktop/mobile zoom setting allows
*/
(function () {
  const MIN_SCALE = 1;
  const MAX_SCALE = 4;
  const DOUBLE_TAP_SCALE = 2.5;
  const HOVER_ZOOM_RATIO = 2.5;
  // Cache media-query results; matchMedia change listeners fire only on breakpoint crossings,
  // avoiding a window.innerWidth read on every mousemove.
  const touchQuery = window.matchMedia('(hover: none) and (pointer: coarse)');
  let _isTouchDevice = touchQuery.matches;
  touchQuery.addEventListener('change', (e) => { _isTouchDevice = e.matches; });
  const isTouchDevice = () => _isTouchDevice;

  // Hover-zoom should only ever activate on desktop-sized viewports (>= 750px),
  // regardless of input type — this matches the theme editor's mobile preview.
  const desktopQuery = window.matchMedia('(min-width: 750px)');
  let _isDesktopViewport = desktopQuery.matches;
  desktopQuery.addEventListener('change', (e) => { _isDesktopViewport = e.matches; });
  const isDesktopViewport = () => _isDesktopViewport;

  // -------------------- ZoomState (per-slide) --------------------
  class ZoomState {
    constructor(wrap) {
      this.wrap = wrap;
      this.img = wrap.querySelector('img');
      this.scale = 1;
      this.tx = 0;
      this.ty = 0;
      this.pointers = new Map();
      this.lastTap = 0;
      this.dragging = false;
      this.dragStart = null;
      this.pinchStart = null;
      this.onWheel = this.onWheel.bind(this);
      this.onPointerDown = this.onPointerDown.bind(this);
      this.onPointerMove = this.onPointerMove.bind(this);
      this.onPointerUp = this.onPointerUp.bind(this);
      this.attach();
    }

    attach() {
      this.wrap.addEventListener('wheel', this.onWheel, { passive: false });
      this.wrap.addEventListener('pointerdown', this.onPointerDown);
      this.wrap.addEventListener('pointermove', this.onPointerMove);
      this.wrap.addEventListener('pointerup', this.onPointerUp);
      this.wrap.addEventListener('pointercancel', this.onPointerUp);
      this.wrap.addEventListener('pointerleave', this.onPointerUp);
    }

    detach() {
      this.wrap.removeEventListener('wheel', this.onWheel);
      this.wrap.removeEventListener('pointerdown', this.onPointerDown);
      this.wrap.removeEventListener('pointermove', this.onPointerMove);
      this.wrap.removeEventListener('pointerup', this.onPointerUp);
      this.wrap.removeEventListener('pointercancel', this.onPointerUp);
      this.wrap.removeEventListener('pointerleave', this.onPointerUp);
    }

    isZoomed() {
      return this.scale > 1.01;
    }

    apply() {
      this.clampPan();
      this.img.style.transform = `translate3d(${this.tx}px, ${this.ty}px, 0) scale(${this.scale})`;
      this.wrap.classList.toggle('is-zoomed', this.isZoomed());
      this.wrap.dispatchEvent(new CustomEvent('zoomchange', { bubbles: true, detail: { zoomed: this.isZoomed() } }));
    }

    reset() {
      this.scale = 1;
      this.tx = 0;
      this.ty = 0;
      this.apply();
    }

    clampPan() {
      // Keep image roughly within view: max pan = (scale - 1) * half-size
      const rect = this.wrap.getBoundingClientRect();
      const maxX = ((this.scale - 1) * rect.width) / 2;
      const maxY = ((this.scale - 1) * rect.height) / 2;
      this.tx = Math.max(-maxX, Math.min(maxX, this.tx));
      this.ty = Math.max(-maxY, Math.min(maxY, this.ty));
    }

    zoomAtPoint(newScale, clientX, clientY) {
      const rect = this.wrap.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      // Vector from center to cursor in image-local coords (before scaling)
      const dx = (clientX - cx - this.tx) / this.scale;
      const dy = (clientY - cy - this.ty) / this.scale;
      const clamped = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));
      this.tx -= dx * (clamped - this.scale);
      this.ty -= dy * (clamped - this.scale);
      this.scale = clamped;
      if (this.scale <= 1.001) {
        this.tx = 0;
        this.ty = 0;
      }
      this.apply();
    }

    onWheel(e) {
      // Only zoom on macOS pinch (ctrlKey is auto-set) or Cmd/Ctrl + wheel.
      // Plain scroll inside the lightbox should NOT zoom.
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const delta = -e.deltaY * 0.01;
      this.zoomAtPoint(this.scale * (1 + delta), e.clientX, e.clientY);
    }

    onPointerDown(e) {
      this.wrap.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (this.pointers.size === 2) {
        // start pinch
        const [a, b] = Array.from(this.pointers.values());
        this.pinchStart = {
          dist: Math.hypot(a.x - b.x, a.y - b.y),
          scale: this.scale,
          centerX: (a.x + b.x) / 2,
          centerY: (a.y + b.y) / 2,
        };
        this.dragging = false;
        this.dragMoved = true; // pinch is not a click
      } else if (this.pointers.size === 1) {
        this.downStart = { x: e.clientX, y: e.clientY, tx: this.tx, ty: this.ty };
        this.dragging = false;
        this.dragMoved = false;

        // Touch double-tap detection (single tap = swipe on touch, so we wait for double)
        if (e.pointerType === 'touch') {
          const now = Date.now();
          if (now - this.lastTap < 320) {
            const target = this.isZoomed() ? 1 : DOUBLE_TAP_SCALE;
            this.zoomAtPoint(target, e.clientX, e.clientY);
            this.lastTap = 0;
            this.dragMoved = true; // suppress click-up handler
          } else {
            this.lastTap = now;
          }
        }
      }
    }

    onPointerMove(e) {
      if (!this.pointers.has(e.pointerId)) return;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (this.pointers.size === 2 && this.pinchStart) {
        const [a, b] = Array.from(this.pointers.values());
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const ratio = dist / this.pinchStart.dist;
        const newScale = this.pinchStart.scale * ratio;
        this.zoomAtPoint(newScale, this.pinchStart.centerX, this.pinchStart.centerY);
        return;
      }

      if (!this.downStart) return;
      const dx = e.clientX - this.downStart.x;
      const dy = e.clientY - this.downStart.y;
      if (!this.dragMoved && Math.hypot(dx, dy) > 5) {
        this.dragMoved = true;
        if (this.isZoomed()) this.dragging = true;
      }

      if (this.dragging) {
        e.preventDefault();
        this.tx = this.downStart.tx + dx;
        this.ty = this.downStart.ty + dy;
        this.apply();
      }
    }

    onPointerUp(e) {
      // Desktop single-click toggles zoom (when pointer didn't drag and it wasn't a pinch)
      if (e.pointerType !== 'touch' && !this.dragMoved && this.downStart && this.pointers.size === 1) {
        const target = this.isZoomed() ? 1 : DOUBLE_TAP_SCALE;
        this.zoomAtPoint(target, e.clientX, e.clientY);
      }
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinchStart = null;
      if (this.pointers.size === 0) {
        this.dragging = false;
        this.downStart = null;
        this.dragMoved = false;
      }
    }
  }

  // -------------------- <product-lightbox> --------------------
  class ProductLightbox extends HTMLElement {
    constructor() {
      super();
      this.splide = null;
      this.zoomStates = [];
      this.isOpen = false;
      this.onKeydown = this.onKeydown.bind(this);
      this.onZoomChange = this.onZoomChange.bind(this);

      this.querySelector('.product-lightbox__close').addEventListener('click', () => this.close());
      this.querySelector('.product-lightbox__backdrop').addEventListener('click', () => this.close());
      this.querySelector('.product-lightbox__arrow--prev').addEventListener('click', () => this.splide && this.splide.go('-1'));
      this.querySelector('.product-lightbox__arrow--next').addEventListener('click', () => this.splide && this.splide.go('+1'));

      this.addEventListener('zoomchange', this.onZoomChange);
    }

    initSplideIfNeeded() {
      if (this.splide || typeof Splide === 'undefined') return;
      const container = this.querySelector('.product-lightbox__splide');
      const dotsContainer = this.querySelector('.product-lightbox__dots');
      this.splide = new Splide(container, {
        type: 'slide',
        arrows: false,
        pagination: false,
        drag: true,
        keyboard: false,
        speed: 250,
        rewind: false,
        easing: 'cubic-bezier(0.25, 1, 0.5, 1)',
      });
      this.splide.on('mounted', () => this.buildDots(dotsContainer));
      this.splide.on('moved', (newIndex) => {
        // Reset zoom on slides we leave
        this.zoomStates.forEach((z, i) => { if (i !== newIndex) z.reset(); });
        this.updateActiveDot(newIndex);
      });
      // Auto-pause native videos when their slide is no longer active
      // (mirrors the pattern used by splide-component in secondary.js)
      this.splide.on('hidden', (Slide) => {
        const video = Slide.slide.querySelector('internal-video');
        if (video && video.video && typeof video.video.pause === 'function') {
          video.video.pause();
          video.classList.remove('internal-video--playing');
        }
      });
      this.splide.mount();
      // Build per-slide zoom states
      const wraps = this.querySelectorAll('[data-zoomable]');
      wraps.forEach(w => this.zoomStates.push(new ZoomState(w)));
    }

    buildDots(container) {
      if (!container || !this.splide) return;
      container.innerHTML = '';
      const total = this.splide.length;
      for (let i = 0; i < total; i++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'product-lightbox__dot';
        btn.setAttribute('aria-label', `Go to slide ${i + 1}`);
        btn.addEventListener('click', () => this.splide.go(i));
        container.appendChild(btn);
      }
      this.updateActiveDot(this.splide.index);
    }

    updateActiveDot(index) {
      this.querySelectorAll('.product-lightbox__dot').forEach((d, i) => {
        d.classList.toggle('is-active', i === index);
      });
    }

    onZoomChange(e) {
      // When any slide is zoomed, disable Splide drag (so swipe pans instead of changing slide)
      if (!this.splide) return;
      const anyZoomed = this.zoomStates.some(z => z.isZoomed());
      this.splide.options = { drag: !anyZoomed };
      this.classList.toggle('is-slide-zoomed', anyZoomed);
    }

    open(targetMediaId) {
      this.hidden = false;
      document.body.classList.add('overflow-hidden');
      // Mount splide after the element is visible so it can measure sizes correctly
      requestAnimationFrame(() => {
        this.initSplideIfNeeded();
        if (this.splide && targetMediaId) {
          const slides = this.querySelectorAll('.product-lightbox__slide');
          let index = 0;
          slides.forEach((s, i) => { if (s.dataset.mediaId === targetMediaId) index = i; });
          this.splide.go(index);
        } else if (this.splide) {
          this.splide.refresh();
        }
      });
      this.isOpen = true;
      document.addEventListener('keydown', this.onKeydown);
    }

    close() {
      this.hidden = true;
      this.isOpen = false;
      document.body.classList.remove('overflow-hidden');
      this.zoomStates.forEach(z => z.reset());
      document.removeEventListener('keydown', this.onKeydown);
    }

    onKeydown(e) {
      if (e.key === 'Escape') {
        this.close();
      } else if (e.key === 'ArrowLeft' && this.splide) {
        this.splide.go('-1');
      } else if (e.key === 'ArrowRight' && this.splide) {
        this.splide.go('+1');
      }
    }
  }
  if (!customElements.get('product-lightbox')) customElements.define('product-lightbox', ProductLightbox);

  // -------------------- <product-hover-zoom> --------------------
  class ProductHoverZoom extends HTMLElement {
    constructor() {
      super();
      this.style_ = this.dataset.style || 'inline'; // 'inline' or 'pane'
      this.image = this.querySelector('img');
      this.lens = null;
      this.pane = null;
      this.active = false;

      if (!this.image) return;
      this.onMove = this.onMove.bind(this);
      this.onEnter = this.onEnter.bind(this);
      this.onLeave = this.onLeave.bind(this);

      this.addEventListener('mouseenter', this.onEnter);
      this.addEventListener('mousemove', this.onMove);
      this.addEventListener('mouseleave', this.onLeave);
    }

    onEnter() {
      if (isTouchDevice() || !isDesktopViewport()) return;
      this.active = true;
      if (this.style_ === 'pane') this.setupPane();
      else this.setupInline();
    }

    setupInline() {
      this.classList.add('product-hover-zoom--inline-active');
      this.image.style.transformOrigin = '50% 50%';
      this.image.style.transition = 'transform 0.05s linear';
    }

    setupPane() {
      if (this.pane) return;
      this.pane = document.createElement('div');
      this.pane.className = 'product-hover-zoom__pane';
      this.pane.style.display = 'block';
      this.pane.style.backgroundImage = `url('${this.image.currentSrc || this.image.src}')`;
      document.body.appendChild(this.pane);

      const rect = this.getBoundingClientRect();
      const gap = 16;
      const PANE_RATIO = 0.75;
      const paneW = rect.width * PANE_RATIO;
      const paneH = rect.height * PANE_RATIO;
      // Top-align with the image (industry standard).
      const paneTop = rect.top;
      // Prefer right side; fall back to left if no room.
      const rightFits = rect.right + gap + paneW <= window.innerWidth;
      const leftX = rightFits ? rect.right + gap : Math.max(8, rect.left - gap - paneW);
      this.pane.style.top = paneTop + 'px';
      this.pane.style.left = leftX + 'px';
      this.pane.style.width = paneW + 'px';
      this.pane.style.height = paneH + 'px';

      // Loupe: visual indicator on the source showing which area is magnified.
      // Size = source area visible in pane = rect / HOVER_ZOOM_RATIO (independent of pane size).
      this.loupe = document.createElement('div');
      this.loupe.className = 'product-hover-zoom__loupe';
      this.loupe.style.display = 'block';
      this.loupe.style.width = (rect.width / HOVER_ZOOM_RATIO) + 'px';
      this.loupe.style.height = (rect.height / HOVER_ZOOM_RATIO) + 'px';
      this.appendChild(this.loupe);

      this.classList.add('product-hover-zoom--pane-active');
    }

    onMove(e) {
      if (!this.active || isTouchDevice() || !isDesktopViewport()) return;
      const rect = this.getBoundingClientRect();
      const xPct = ((e.clientX - rect.left) / rect.width) * 100;
      const yPct = ((e.clientY - rect.top) / rect.height) * 100;
      if (this.style_ === 'pane' && this.pane) {
        this.pane.style.backgroundSize = `${HOVER_ZOOM_RATIO * 100}%`;
        this.pane.style.backgroundPosition = `${xPct}% ${yPct}%`;
        if (this.loupe) {
          const loupeW = this.loupe.offsetWidth;
          const loupeH = this.loupe.offsetHeight;
          let lx = (e.clientX - rect.left) - loupeW / 2;
          let ly = (e.clientY - rect.top) - loupeH / 2;
          lx = Math.max(0, Math.min(rect.width - loupeW, lx));
          ly = Math.max(0, Math.min(rect.height - loupeH, ly));
          this.loupe.style.left = lx + 'px';
          this.loupe.style.top = ly + 'px';
        }
      } else {
        this.image.style.transformOrigin = `${xPct}% ${yPct}%`;
        this.image.style.transform = `scale(${HOVER_ZOOM_RATIO})`;
      }
    }

    onLeave() {
      this.active = false;
      this.classList.remove('product-hover-zoom--inline-active', 'product-hover-zoom--pane-active');
      if (this.image) {
        this.image.style.transform = '';
        this.image.style.transformOrigin = '';
        this.image.style.transition = '';
      }
      if (this.pane) {
        this.pane.remove();
        this.pane = null;
      }
      if (this.loupe) {
        this.loupe.remove();
        this.loupe = null;
      }
    }
  }
  if (!customElements.get('product-hover-zoom')) customElements.define('product-hover-zoom', ProductHoverZoom);

  // -------------------- Wire <media-gallery> click -> lightbox open --------------------
  function wireGalleryLightbox(gallery) {
    const sectionId = gallery.dataset.section;
    if (!sectionId) return;
    const lightbox = document.getElementById(`ProductLightbox-${sectionId}`);
    if (!lightbox) return;

    const desktopAllows = ['lightbox', 'combined'].includes(gallery.dataset.zoomDesktop);
    const mobileAllows = gallery.dataset.zoomMobile === 'lightbox';

    gallery.addEventListener('click', (e) => {
      const slide = e.target.closest('.product__media-item');
      if (!slide || !slide.classList.contains('is-active')) return;
      // Skip non-image media (video, model) — those play in place
      const isImage = slide.querySelector('img') && !slide.classList.contains('product__media-item--full');
      if (!isImage) return;
      const allowed = isDesktopViewport() ? desktopAllows : mobileAllows;
      if (!allowed) return;
      const mediaId = slide.dataset.mediaId;
      lightbox.open(mediaId);
    });
  }

  function init() {
    document.querySelectorAll('media-gallery[data-zoom-desktop], media-gallery[data-zoom-mobile]').forEach(wireGalleryLightbox);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
