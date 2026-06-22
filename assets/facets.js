class FacetFiltersForm extends HTMLElement {
  constructor() {
    super();
    this.onActiveFilterClick = this.onActiveFilterClick.bind(this);

    this.debouncedOnSubmit = debounce((event) => {
      this.onSubmitHandler(event);
    }, 500);

    const facetForm = this.querySelector('form');
    facetForm.addEventListener('input', this.debouncedOnSubmit.bind(this));

    const facetWrapper = this.querySelector('#FacetsWrapperDesktop');
    if (facetWrapper) facetWrapper.addEventListener('keyup', onKeyUpEscape);
  }

  static setListeners() {
    const onHistoryChange = (event) => {
      const searchParams = event.state ? event.state.searchParams : FacetFiltersForm.searchParamsInitial;
      if (searchParams === FacetFiltersForm.searchParamsPrev) return;
      FacetFiltersForm.renderPage(searchParams, null, false);
    }
    window.addEventListener('popstate', onHistoryChange);
  }

  static toggleActiveFacets(disable = true) {
    document.querySelectorAll('.js-facet-remove').forEach((element) => {
      element.classList.toggle('disabled', disable);
    });
  }

  static renderPage(searchParams, event, updateURLHash = true) {
    FacetFiltersForm.searchParamsPrev = searchParams;
    const sections = FacetFiltersForm.getSections();
    const countContainer = document.getElementById('ProductCount');
    const countContainerDesktop = document.getElementById('ProductCountDesktop');
    document.getElementById('ProductGridContainer').querySelector('.collection').classList.add('loading');
    if (countContainer){
      countContainer.classList.add('loading');
    }
    if (countContainerDesktop){
      countContainerDesktop.classList.add('loading');
    }

    sections.forEach((section) => {
      const url = `${window.location.pathname}?section_id=${section.section}&${searchParams}`;
      const filterDataUrl = element => element.url === url;

      FacetFiltersForm.filterData.some(filterDataUrl) ?
        FacetFiltersForm.renderSectionFromCache(filterDataUrl, event) :
        FacetFiltersForm.renderSectionFromFetch(url, event);
    });

    if (updateURLHash) FacetFiltersForm.updateURLHash(searchParams);
  }

  static renderSectionFromFetch(url, event) {
    fetch(url)
      .then(response => response.text())
      .then((responseText) => {
        const html = responseText;
        FacetFiltersForm.filterData = [...FacetFiltersForm.filterData, { html, url }];
        FacetFiltersForm.renderFilters(html, event);
        FacetFiltersForm.renderProductGridContainer(html);
        FacetFiltersForm.renderProductCount(html);
      });
  }

  static renderSectionFromCache(filterDataUrl, event) {
    const html = FacetFiltersForm.filterData.find(filterDataUrl).html;
    FacetFiltersForm.renderFilters(html, event);
    FacetFiltersForm.renderProductGridContainer(html);
    FacetFiltersForm.renderProductCount(html);
  }

  static renderProductGridContainer(html) {
    document.getElementById('ProductGridContainer').innerHTML = new DOMParser().parseFromString(html, 'text/html').getElementById('ProductGridContainer').innerHTML;
  }

  static renderProductCount(html) {
    const count = new DOMParser().parseFromString(html, 'text/html').getElementById('ProductCount').innerHTML
    const container = document.getElementById('ProductCount');
    const containerDesktop = document.getElementById('ProductCountDesktop');
    container.innerHTML = count;
    container.classList.remove('loading');
    if (containerDesktop) {
      containerDesktop.innerHTML = count;
      containerDesktop.classList.remove('loading');
    }
  }

  static renderFilters(html, event) {
    const parsedHTML = new DOMParser().parseFromString(html, 'text/html');

    const facetDetailsElements =
      parsedHTML.querySelectorAll('#FacetFiltersForm .js-filter, #FacetFiltersFormMobile .js-filter, #FacetFiltersPillsForm .js-filter');
    const matchesIndex = (element) => {
      const jsFilter = event ? event.target.closest('.js-filter') : undefined;
      return jsFilter ? element.dataset.index === jsFilter.dataset.index : false;
    }
    const facetsToRender = Array.from(facetDetailsElements).filter(element => !matchesIndex(element));
    const countsToRender = Array.from(facetDetailsElements).find(matchesIndex);

    facetsToRender.forEach((element) => {
      let elementToReplace = document.querySelector(`.js-filter[data-index="${element.dataset.index}"]`);
      if (elementToReplace.querySelector(':scope > details')) {
        elementToReplace.querySelector(':scope > details').innerHTML = element.querySelector(':scope > details').innerHTML;
      } else {
        elementToReplace.innerHTML = element.innerHTML;
      }
      if (elementToReplace.querySelector('.drawer__submenu-content-wrapper')) {
        elementToReplace.querySelector('.drawer__submenu-content-wrapper').innerHTML = element.querySelector('.drawer__submenu-content-wrapper').innerHTML;
      }
    });

    FacetFiltersForm.renderActiveFacets(parsedHTML);
    FacetFiltersForm.renderAdditionalElements(parsedHTML);

    if (countsToRender) FacetFiltersForm.renderCounts(countsToRender, event.target.closest('.js-filter'));
  }

  static renderActiveFacets(html) {
    const activeFacetElementSelectors = ['.active-facets-mobile', '.active-facets-desktop'];

    activeFacetElementSelectors.forEach((selector) => {
      const activeFacetsElement = html.querySelector(selector);
      if (!activeFacetsElement) return;
      document.querySelector(selector).innerHTML = activeFacetsElement.innerHTML;
    })

    FacetFiltersForm.toggleActiveFacets(false);
  }

  static renderAdditionalElements(html) {
    const mobileElementSelectors = ['.mobile-facets__open', '.mobile-facets__count', '.sorting'];

    mobileElementSelectors.forEach((selector) => {
      if (!html.querySelector(selector)) return;
      document.querySelector(selector).innerHTML = html.querySelector(selector).innerHTML;
    });

    document.getElementById('FacetFiltersFormMobile').closest('menu-drawer').bindEvents();
  }

  static renderCounts(source, target) {
    const targetElement = target.querySelector('.facets__selected');
    const sourceElement = source.querySelector('.facets__selected');

    const targetElementAccessibility = target.querySelector('.facets__summary');
    const sourceElementAccessibility = source.querySelector('.facets__summary');

    if (sourceElement && targetElement) {
      target.querySelector('.facets__selected').outerHTML = source.querySelector('.facets__selected').outerHTML;
    }

    if (targetElementAccessibility && sourceElementAccessibility) {
      target.querySelector('.facets__summary').outerHTML = source.querySelector('.facets__summary').outerHTML;
    }
  }

  static updateURLHash(searchParams) {
    history.pushState({ searchParams }, '', `${window.location.pathname}${searchParams && '?'.concat(searchParams)}`);
  }

  static getSections() {
    return [
      {
        section: document.getElementById('product-grid').dataset.id,
      }
    ]
  }

  createSearchParams(form) {
    const formData = new FormData(form);
    return new URLSearchParams(formData).toString();
  }

  onSubmitForm(searchParams, event) {
    FacetFiltersForm.renderPage(searchParams, event);
  }

  onSubmitHandler(event) {
    event.preventDefault();
    const sortFilterForms = document.querySelectorAll('facet-filters-form form');
    if (event.srcElement.className == 'mobile-facets__checkbox') {
      const searchParams = this.createSearchParams(event.target.closest('form'))
      this.onSubmitForm(searchParams, event)
    } else {
      const forms = [];
      const isMobile = event.target.closest('form').id === 'FacetFiltersFormMobile';

      sortFilterForms.forEach((form) => {
        if (!isMobile) {
          if (form.id === 'FacetSortForm' || form.id === 'FacetFiltersForm' || form.id === 'FacetSortDrawerForm') {
            const noJsElements = document.querySelectorAll('.no-js-list');
            noJsElements.forEach((el) => el.remove());
            forms.push(this.createSearchParams(form));
          }
        } else if (form.id === 'FacetFiltersFormMobile') {
          forms.push(this.createSearchParams(form));
        }
      });
      this.onSubmitForm(forms.join('&'), event)
    }
  }

  onActiveFilterClick(event) {
    event.preventDefault();
    FacetFiltersForm.toggleActiveFacets();
    const url = event.currentTarget.href.indexOf('?') == -1 ? '' : event.currentTarget.href.slice(event.currentTarget.href.indexOf('?') + 1);
    FacetFiltersForm.renderPage(url);
  }
}

FacetFiltersForm.filterData = [];
FacetFiltersForm.searchParamsInitial = window.location.search.slice(1);
FacetFiltersForm.searchParamsPrev = window.location.search.slice(1);
customElements.define('facet-filters-form', FacetFiltersForm);
FacetFiltersForm.setListeners();

// class PriceRange extends HTMLElement {
//   constructor() {
//     super();
//     this.querySelectorAll('input')
//       .forEach(element => element.addEventListener('change', this.onRangeChange.bind(this)));
//     this.setMinAndMaxValues();
//   }

//   onRangeChange(event) {
//     this.adjustToValidValues(event.currentTarget);
//     this.setMinAndMaxValues();
//   }

//   setMinAndMaxValues() {
//     const inputs = this.querySelectorAll('input');
//     const minInput = inputs[0];
//     const maxInput = inputs[1];
//     if (maxInput.value) minInput.setAttribute('max', maxInput.value);
//     if (minInput.value) maxInput.setAttribute('min', minInput.value);
//     if (minInput.value === '') maxInput.setAttribute('min', 0);
//     if (maxInput.value === '') minInput.setAttribute('max', maxInput.getAttribute('max'));
//   }

//   adjustToValidValues(input) {
//     const value = Number(input.value);
//     const min = Number(input.getAttribute('min'));
//     const max = Number(input.getAttribute('max'));

//     if (value < min) input.value = min;
//     if (value > max) input.value = max;
//   }
// }

// customElements.define('price-range', PriceRange);

class PriceRange extends HTMLElement {
  constructor() {
    super();

    // native inputs (kept for no-JS + form integration)
    this.inputs = this.querySelectorAll('input');
    this.minInput = this.inputs[0];
    this.maxInput = this.inputs[1];

    // slider parts (if JS-enhanced UI exists)
    this.slider = this.querySelector('.price-slider');
    this.track = this.querySelector('.price-slider__track');
    this.range = this.querySelector('.price-slider__range');
    this.minHandle = this.querySelector('.price-slider__handle--min');
    this.maxHandle = this.querySelector('.price-slider__handle--max');
    this.minLabel = this.querySelector('[data-label="min"]');
    this.maxLabel = this.querySelector('[data-label="max"]');

    // numbers
    this.maxAllowed = Number(this.dataset.max || this.maxInput?.getAttribute('max') || 0);
    this.valueMin = Number(this.dataset.initialMin || this.minInput?.value || 0);
    this.valueMax = Number(this.dataset.initialMax || this.maxInput?.value || this.maxAllowed);
    this.currency = this.dataset.currency || '';

    // keep existing behavior for manual typing
    this.inputs.forEach(el => el.addEventListener('change', this.onInputChange.bind(this)));

    // If slider parts aren’t present, bail (keeps old behavior).
    if (!this.slider || !this.track || !this.range || !this.minHandle || !this.maxHandle) {
      this.setMinAndMaxValues(); // original guard-rails
      return;
    }

    this.facetForm = this.closest('facet-filters-form')?.querySelector('form') || this.closest('form');

    // Init positions & listeners
    this.rect = null; // track rect cache
    this.attachPointer(this.minHandle);
    this.attachPointer(this.maxHandle);
    this.track.addEventListener('pointerdown', this.onTrackClick.bind(this));

    // keyboard support
    this.minHandle.addEventListener('keydown', (e) => this.onHandleKey(e, 'min'));
    this.maxHandle.addEventListener('keydown', (e) => this.onHandleKey(e, 'max'));

    this.syncFromValues(); // position handles
    this.setMinAndMaxValues(); // keep input min/max in sync
  }

  /* ---------- original input constraints ---------- */
  onInputChange(e) {
    this.adjustToValidValues(e.currentTarget);
    this.setMinAndMaxValues();

    // reflect typed values into slider (if present)
    if (this.slider) {
      this.valueMin = Number(this.minInput.value || 0);
      this.valueMax = Number(this.maxInput.value || this.maxAllowed);
      this.syncFromValues();
    }
  }

  setMinAndMaxValues() {
    const minVal = this.minInput.value !== '' ? Number(this.minInput.value) : 0;
    const maxVal = this.maxInput.value !== '' ? Number(this.maxInput.value) : this.maxAllowed;

    if (this.maxInput.value) this.minInput.setAttribute('max', maxVal);
    if (this.minInput.value) this.maxInput.setAttribute('min', minVal);

    if (this.minInput.value === '') this.maxInput.setAttribute('min', 0);
    if (this.maxInput.value === '') this.minInput.setAttribute('max', this.maxInput.getAttribute('max'));
  }

  adjustToValidValues(input) {
    const value = Number(input.value);
    const min = Number(input.getAttribute('min') || 0);
    const max = Number(input.getAttribute('max') || this.maxAllowed);

    if (value < min) input.value = min;
    if (value > max) input.value = max;
  }

  /* ---------- slider helpers ---------- */
  attachPointer(handle) {
    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.suppressNextDocumentClick();
      handle.setPointerCapture(e.pointerId);
      this.rect = this.track.getBoundingClientRect();

      const move = this.onPointerMove.bind(this, handle);
      const up = (ev) => {
        handle.releasePointerCapture(ev.pointerId);
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);

        // On release: write to inputs and dispatch change events to trigger filtering.
        if (handle.dataset.handle === 'min') {
          this.minInput.value = this.valueMin;
          this.minInput.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
          this.maxInput.value = this.valueMax;
          this.maxInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
        this.setMinAndMaxValues();
        this.emitFacetInput();
      };

      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    }, { passive: false });
  }

  onPointerMove(handle, e) {
    const x = Math.min(Math.max(e.clientX - this.rect.left, 0), this.rect.width);
    const pct = x / this.rect.width;
    const raw = pct * this.maxAllowed;

    // choose which value we’re moving
    if (handle.dataset.handle === 'min') {
      this.valueMin = Math.min(Math.max(0, this.roundValue(raw)), this.valueMax);
    } else {
      this.valueMax = Math.max(Math.min(this.maxAllowed, this.roundValue(raw)), this.valueMin);
    }
    this.updateUI();
  }

  onTrackClick(e) {
    this.suppressNextDocumentClick();

    this.rect = this.track.getBoundingClientRect();
    const x = Math.min(Math.max(e.clientX - this.rect.left, 0), this.rect.width);
    const pct = x / this.rect.width;
    const raw = this.roundValue(pct * this.maxAllowed);

    // move the closest handle
    const distToMin = Math.abs(raw - this.valueMin);
    const distToMax = Math.abs(raw - this.valueMax);
    if (distToMin <= distToMax) {
      this.valueMin = Math.min(raw, this.valueMax);
      this.minInput.value = this.valueMin;
      this.minInput.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      this.valueMax = Math.max(raw, this.valueMin);
      this.maxInput.value = this.valueMax;
      this.maxInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
    this.updateUI();
    this.emitFacetInput();
  }

  onHandleKey(e, which) {
    const step = Math.max(1, Math.round(this.maxAllowed / 100)); // 1% of max, min 1
    let delta = 0;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') delta = -step;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') delta = step;
    if (!delta) return;

    e.preventDefault();
    if (which === 'min') {
      this.valueMin = Math.max(0, Math.min(this.valueMin + delta, this.valueMax));
      this.minInput.value = this.valueMin;
      this.minInput.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      this.valueMax = Math.min(this.maxAllowed, Math.max(this.valueMax + delta, this.valueMin));
      this.maxInput.value = this.valueMax;
      this.maxInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
    this.updateUI();
    this.emitFacetInput();
  }

  roundValue(v) {
    // keep integers by default; adjust here if you want finer precision
    return Math.round(v);
  }

  percentFromValue(v) {
    return (v / this.maxAllowed) * 100;
  }

  syncFromValues() {
    // clamp & order
    this.valueMin = Math.max(0, Math.min(this.valueMin, this.maxAllowed));
    this.valueMax = Math.max(this.valueMin, Math.min(this.valueMax, this.maxAllowed));
    this.updateUI();
  }

  updateUI() {
    const minPct = this.percentFromValue(this.valueMin);
    const maxPct = this.percentFromValue(this.valueMax);

    // handles
    this.minHandle.style.left = `${minPct}%`;
    this.maxHandle.style.left = `${maxPct}%`;

    // filled range bar
    this.range.style.left = `${minPct}%`;
    this.range.style.right = `${100 - maxPct}%`;

    // labels
    if (this.minLabel) this.minLabel.textContent = `${this.valueMin}`;
    if (this.maxLabel) this.maxLabel.textContent = `${this.valueMax}`;
  }

  emitFacetInput() {
    const facetFiltersForm = this.closest('facet-filters-form');
    if (facetFiltersForm && facetFiltersForm.debouncedOnSubmit) {
      facetFiltersForm.debouncedOnSubmit({
        preventDefault() {},            // no-op to satisfy handler
        target: this,                   // <price-range> element; .closest('form') will work
        srcElement: { className: '' }   // avoid the mobile checkbox branch
      });
    }
    // if (!this.facetForm) return;
    // this.facetForm.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // Suppress exactly one upcoming document-level click (used to avoid closing drawers/details)
  suppressNextDocumentClick() {
    const kill = (e) => {
      e.stopPropagation();
      document.removeEventListener('click', kill, true);
    };
    // capture so we stop it before theme listeners
    document.addEventListener('click', kill, true);
  }
}
customElements.define('price-range', PriceRange);


class FacetRemove extends HTMLElement {
  constructor() {
    super();
    const facetLink = this.querySelector('a');
    facetLink.setAttribute('role', 'button');
    facetLink.addEventListener('click', this.closeFilter.bind(this));
    facetLink.addEventListener('keyup', (event) => {
      event.preventDefault();
      if (event.code.toUpperCase() === 'SPACE') this.closeFilter(event);
    });
  }

  closeFilter(event) {
    event.preventDefault();
    const form = this.closest('facet-filters-form') || document.querySelector('facet-filters-form');
    form.onActiveFilterClick(event);
  }
}

customElements.define('facet-remove', FacetRemove);
