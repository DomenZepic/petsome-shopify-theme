if (!customElements.get('kaching-custom-display')) {
  class KachingCustomDisplay extends HTMLElement {
    connectedCallback() {
      this.sectionId = this.dataset.section;
      this.productTitle = this.dataset.productTitle || '';
      this.productType = this.dataset.productType || 'capsules';
      this.i18n = {
        unavailable: this.dataset.i18nUnavailable || 'Unavailable',
        savingsPrefix: this.dataset.i18nSavingsPrefix || 'Save {{ amount }}',
        dosageSupply: this.dataset.i18nDosageSupply || '{{ months }}-month supply ({{ amount }} {{ unit }})',
        dosageUnitCapsules: this.dataset.i18nDosageUnitCapsules || 'capsules',
        dosageUnitPowder: this.dataset.i18nDosageUnitPowder || 'g',
        pricePerDay: this.dataset.i18nPricePerDay || '{{ amount }} / day',
      };
      this.giftsInTier = this.dataset.giftsInTier === '1';
      this.bf26 = this.dataset.bf26 === '1';
      if (this.bf26) this.classList.add('kcd26');
      // Vrednost paketa (BF): "2:9,4:23.9" = vrednost daril po kolicini.
      // Precrtana cena v glavi = doze + darila, zraven "Vrednost paketa" (Omnibus).
      this.bfGiftValues = {};
      (this.dataset.bfGiftValues || '').split(',').forEach((pair) => {
        const parts = pair.split(':');
        const qty = parseInt(parts[0], 10);
        const val = parseFloat(parts[1]);
        if (qty > 0 && !Number.isNaN(val)) this.bfGiftValues[qty] = val;
      });
      this.bfValueLabel = this.dataset.bfValueLabel || '';
      this.bfTileValueLabel = this.dataset.bfTileValueLabel || 'vrednost';
      this.capsulesPerPackage = parseFloat(this.dataset.capsulesPerPackage) || 0;
      this.capsulesPerDayBySize = (this.dataset.capsulesPerDayBySize || '')
        .split(',')
        .map((value) => parseFloat(value.trim()))
        .filter((value) => !Number.isNaN(value));

      this.headerContainer = this.querySelector('[data-header-container]');
      this.headerTitle = this.querySelector('[data-header-title]');
      this.savingsBadge = this.querySelector('[data-savings-badge]');
      this.savingsBadgeText = this.querySelector('[data-savings-badge-text]');
      this.headerPriceCurrent = this.querySelector('[data-header-price-current]');
      this.headerPriceCompare = this.querySelector('[data-header-price-compare]');
      this.tilesContainer = this.querySelector('[data-tiles-container]');
      this.giftsContainer = this.querySelector('[data-gifts-container]');
      this.giftsWrapper = this.giftsContainer
        ? this.giftsContainer.closest('.kaching-custom-display__gifts')
        : null;

      this.kachingEl = document.querySelector('kaching-bundle');
      this.variantRoot = document.querySelector(`#variant-selects-${this.sectionId}`);
      this.variantJsonEl = this.variantRoot
        ? this.variantRoot.querySelector('script[type="application/json"]')
        : null;
      this.variants = [];
      try {
        this.variants = this.variantJsonEl ? JSON.parse(this.variantJsonEl.textContent) : [];
      } catch (error) {
        this.variants = [];
      }

      if (!this.kachingEl) {
        this.renderError('Kaching Bundles app block not found on this page.');
        return;
      }

      this.dealBars = this.readDealBars();
      if (this.dealBars.length === 0) {
        this.renderError('No Kaching deal configured for this product yet.');
        return;
      }

      this.gifts = this.collectGifts();
      this.selectedDealBarId = this.preselectedDealBarId;

      this.sizeRadios = this.variantRoot
        ? Array.from(this.variantRoot.querySelectorAll('input[type="radio"]'))
        : [];
      this.onSizeChange = this.onSizeChange.bind(this);
      this.sizeRadios.forEach((radio) => radio.addEventListener('change', this.onSizeChange));

      // Everything needed to render (dealBars, gifts, variant prices) is
      // already in the page synchronously - no need to wait on the live
      // Kaching widget just to paint. It's only touched at add-to-cart time.
      this.refresh();
    }

    disconnectedCallback() {
      this.sizeRadios.forEach((radio) => radio.removeEventListener('change', this.onSizeChange));
    }

    // The real rendered widget (verified via devtools) is a child
    // <kaching-bundles-block> custom element that Kaching inserts inside
    // our hidden <kaching-bundle> after its own JS runs - it isn't present
    // at page load. There's no .pricing()/.items()/.quantity JS API on this
    // build; selection happens via plain <input type="radio"> elements
    // inside it, one per deal bar (data-deal-bar-id="<tier.id>").
    waitForKachingBlock() {
      const existing = document.querySelector('kaching-bundles-block');
      if (existing) return Promise.resolve(existing);

      return new Promise((resolve) => {
        const observer = new MutationObserver(() => {
          const el = document.querySelector('kaching-bundles-block');
          if (el) {
            observer.disconnect();
            resolve(el);
          }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        setTimeout(() => {
          observer.disconnect();
          resolve(document.querySelector('kaching-bundles-block'));
        }, 3000);
      });
    }

    readDealSettings() {
      const productId = this.kachingEl.getAttribute('product-id');
      const settingsEls = Array.from(
        document.querySelectorAll(
          `script.kaching-bundles-deal-block-settings[data-product-id="${productId}"]`
        )
      );
      if (!settingsEls.length) return null;
      const parse = (el) => {
        try {
          return JSON.parse(el.textContent);
        } catch (error) {
          return null;
        }
      };
      // Kaching embeds every deal for the product on every market's page
      // (each with marketId / excludedMarketIds). Only on the Czech market
      // pick the deal bound to it; everywhere else keep the first one.
      const CZECH_MARKET_ID = 103847461189;
      if (Number(this.dataset.marketId) === CZECH_MARKET_ID) {
        const czech = settingsEls
          .map(parse)
          .find((settings) => settings && Number(settings.marketId) === CZECH_MARKET_ID);
        if (czech) return czech;
      }
      return parse(settingsEls[0]);
    }

    // Kaching's own multi-language deal text (translated natively in the
    // Kaching app) lives in a separate static <script id="kaching-bundles-
    // translations"> blob - a list of { locale, translations: { dealBlocks:
    // { <dealId>: { "<original text>": "<translated text>" } } } }. The
    // static deal-settings blob we read in readDealSettings() is only ever
    // in the deal's original/default language, so any text sourced from it
    // (e.g. the progressive-gifts title) needs a lookup here to actually
    // show translated on non-default-locale storefronts. The same source
    // string maps to the same translation across every dealBlock entry, so
    // there's no need to match this page's specific deal - the first hit
    // for the current locale is used.
    translateFromKaching(sourceText) {
      if (!sourceText) return null;

      if (this._kachingTranslations === undefined) {
        const el = document.getElementById('kaching-bundles-translations');
        try {
          this._kachingTranslations = el ? JSON.parse(el.textContent) : null;
        } catch (error) {
          this._kachingTranslations = null;
        }
      }

      if (!Array.isArray(this._kachingTranslations)) return null;

      const locale = (document.documentElement.lang || '').split('-')[0].toLowerCase();
      const entry = this._kachingTranslations.find((item) => item.locale === locale);
      const dealBlocks = entry && entry.translations && entry.translations.dealBlocks;
      if (!dealBlocks) return null;

      for (const blockId in dealBlocks) {
        if (Object.prototype.hasOwnProperty.call(dealBlocks[blockId], sourceText)) {
          return dealBlocks[blockId][sourceText];
        }
      }
      return null;
    }

    readDealBars() {
      const settings = this.readDealSettings();
      if (!settings) return [];
      this.preselectedDealBarId = settings.preselectedDealBarId || null;
      return Array.isArray(settings.dealBars) ? settings.dealBars : [];
    }

    getSelectedTier() {
      return (
        this.dealBars.find((tier) => tier.id === this.selectedDealBarId) ||
        this.dealBars.find((tier) => tier.id === this.preselectedDealBarId) ||
        this.dealBars[0]
      );
    }

    getSelectedBarPosition() {
      const tier = this.getSelectedTier();
      const index = this.dealBars.findIndex((bar) => bar.id === (tier && tier.id));
      return index === -1 ? 1 : index + 1;
    }

    resolveGiftDisplay(gift) {
      if (gift.giftType === 'shipping') {
        return { title: this.translateFromKaching(gift.title) || gift.title, image: null, icon: 'local_shipping' };
      }
      if (gift.productGID) {
        const numericId = gift.productGID.split('/').pop();
        const productEl = document.querySelector(
          `script.kaching-bundles-product[data-product-id="${numericId}"]`
        );
        if (productEl) {
          try {
            const productData = JSON.parse(productEl.textContent);
            return { title: productData.title, image: productData.image, icon: 'redeem' };
          } catch (error) {
            // fall through to default below
          }
        }
      }
      const fallbackTitle = gift.title === '{{product}}' ? 'Gift' : gift.title;
      return { title: this.translateFromKaching(fallbackTitle) || fallbackTitle, image: null, icon: 'redeem' };
    }

    collectGifts() {
      const settings = this.readDealSettings();
      this.giftsTitle = null;
      this.hideLockedGifts = false;

      if (!settings || !settings.progressiveGiftsEnabled || !settings.progressiveGifts) {
        return [];
      }

      this.giftsTitle = settings.progressiveGifts.title || null;
      this.hideLockedGifts = !!settings.progressiveGifts.hideLockedGifts;

      const rawGifts = Array.isArray(settings.progressiveGifts.gifts)
        ? settings.progressiveGifts.gifts
        : [];

      return rawGifts.map((gift) => {
        const display = this.resolveGiftDisplay(gift);
        return {
          id: gift.id,
          title: display.title,
          image: display.image,
          icon: display.icon,
          comparePrice: gift.comparePrice || null,
          lockedTitle: this.translateFromKaching(gift.lockedTitle) || gift.lockedTitle,
          unlockAtBar: gift.unlockAtBar,
        };
      });
    }

    getSelectedSizeIndex() {
      const index = this.sizeRadios.findIndex((radio) => radio.checked);
      return index === -1 ? 0 : index;
    }

    getSelectedVariant() {
      const checked = this.sizeRadios.find((radio) => radio.checked);
      if (!checked) return this.variants[0];
      return this.variants.find((variant) => variant.option1 === checked.value) || this.variants[0];
    }

    onSizeChange() {
      // Kaching syncs itself to the native variant picker (confirmed by
      // disableVariantOptionSync: false in its deal config) - no need to
      // push the selection into it ourselves.
      this.refresh();
    }

    getBasePrice(variant) {
      if (!variant) return null;
      return Number(variant.price) / 100 || Number(variant.price);
    }

    // discountType is "default" (no discount), "percentage" (off the
    // quantity x base-price total), or "specific" (discountValue IS the
    // exact final total price for the tier, confirmed against Kaching's
    // own rendered per-item price: e.g. discountValue 69.8 for a 2x tier
    // renders as "€34,90" per item, i.e. 69.8 / 2).
    computeFallbackPrice(tier, variant) {
      const basePrice = this.getBasePrice(variant);
      if (basePrice == null) return null;
      if (tier.discountType === 'specific') {
        return tier.discountValue;
      }
      const total = basePrice * tier.quantity;
      if (tier.discountType === 'percentage') {
        return total * (1 - (tier.discountValue || 0) / 100);
      }
      return total;
    }

    computeDosage(tier, sizeIndex) {
      if (this.capsulesPerPackage <= 0) return null;
      const capsulesPerDay = this.capsulesPerDayBySize[sizeIndex];
      if (!capsulesPerDay) return null;

      const totalCapsules = this.capsulesPerPackage * tier.quantity;
      const daysSupply = totalCapsules / capsulesPerDay;
      const monthsRaw = Math.round((daysSupply / 30) * 10) / 10;
      const monthsSupply = Number.isInteger(monthsRaw)
        ? String(monthsRaw)
        : monthsRaw.toFixed(1).replace('.', ',');

      return { totalCapsules: Math.round(totalCapsules), daysSupply, monthsSupply };
    }

    refresh() {
      const sizeIndex = this.getSelectedSizeIndex();
      const variant = this.getSelectedVariant();
      const available = variant ? variant.available !== false : true;
      const basePrice = this.getBasePrice(variant);

      const tilesData = this.dealBars.map((tier) => ({
        tier,
        imageUrl: tier.kachingImageUrl || null,
        price: this.computeFallbackPrice(tier, variant),
        comparePrice: basePrice != null ? basePrice * tier.quantity + (this.bfGiftValues[tier.quantity] || 0) : null,
        baseCompare: basePrice != null ? basePrice * tier.quantity : null,
        valid: available,
        validationMessage: available ? null : this.i18n.unavailable,
        dosage: this.computeDosage(tier, sizeIndex),
      }));

      this.renderHeader(tilesData);
      this.renderTiles(tilesData);
      this.renderGifts();

      // computeFallbackPrice re-implements Kaching's discount math just to
      // paint instantly - it WILL go stale the next time the deal's
      // discount type/value changes in Kaching admin. Once Kaching's own
      // widget has actually rendered, correct the displayed price to
      // whatever IT shows - that's authoritative and survives any future
      // change in Kaching, since we're reading its output, not guessing
      // its formula.
      this.correctPricesFromRealWidget(tilesData);
    }

    parseMoneyText(text) {
      if (!text) return null;
      const cleaned = text.replace(/[^\d.,-]/g, '').trim();
      if (!cleaned) return null;
      const normalized = cleaned.includes(',') && !cleaned.includes('.')
        ? cleaned.replace(',', '.')
        : cleaned.replace(/,(?=\d{3}\b)/g, '');
      const value = parseFloat(normalized);
      return Number.isNaN(value) ? null : value;
    }

    async correctPricesFromRealWidget(tilesData, attempt = 1) {
      const kachingBlock = await this.waitForKachingBlock();
      if (!kachingBlock) return;

      let changed = false;
      let anyZero = false;
      tilesData.forEach((data) => {
        const barEl = kachingBlock.querySelector(`[data-deal-bar-id="${data.tier.id}"]`);

        // Extract image from Kaching's rendered bar element and cache on the tier
        // so it survives across refresh() calls (e.g. size changes).
        const imgEl = barEl ? barEl.querySelector('img') : null;
        if (imgEl && imgEl.src && data.tier.kachingImageUrl !== imgEl.src) {
          data.tier.kachingImageUrl = imgEl.src;
          data.imageUrl = imgEl.src;
          changed = true;
        }

        const priceEl = barEl ? barEl.querySelector('.kaching-bundles__bar-price') : null;
        const perItemPrice = priceEl ? this.parseMoneyText(priceEl.textContent) : null;
        // Kaching's block can briefly render before it has resolved a
        // variant/price (shows 0,00 for an instant) - never trust that as
        // a real correction, keep our fallback estimate until it settles.
        if (perItemPrice == null || perItemPrice <= 0) {
          anyZero = true;
          return;
        }

        let total = perItemPrice * data.tier.quantity;
        // Kaching kaze ceno na kos zaokrozeno (109,90 / 4 = 27,48) - pri fiksni ceni paketa obdrzi tocen znesek.
        if (data.tier.discountType === 'specific' && Math.abs(total - data.tier.discountValue) < 0.01 * data.tier.quantity + 0.001) {
          total = data.tier.discountValue;
        }
        if (Math.abs(total - data.price) > 0.005) {
          data.price = total;
          changed = true;
        }
      });

      if (changed) {
        this.renderHeader(tilesData);
        this.renderTiles(tilesData);
      }

      // It can take a moment for Kaching to resolve the initial variant -
      // retry a couple of times so the real price settles without needing
      // the user to touch a size pill first.
      if (anyZero && attempt < 5) {
        setTimeout(() => this.correctPricesFromRealWidget(tilesData, attempt + 1), 400);
      }
    }

    formatMoney(amount) {
      if (amount == null) return '';
      try {
        const currency = window.Shopify && window.Shopify.currency ? window.Shopify.currency.active : 'EUR';
        const options = { style: 'currency', currency };
        // Czech prices are shown without decimals (999 Kč, not 999,00 Kč).
        if (currency === 'CZK') {
          options.minimumFractionDigits = 0;
          options.maximumFractionDigits = 0;
        }
        return new Intl.NumberFormat(document.documentElement.lang || undefined, options).format(amount);
      } catch (error) {
        return `${amount.toFixed(2)}`;
      }
    }

    t(template, tokens) {
      return Object.keys(tokens || {}).reduce(
        (text, key) => text.split(`{{ ${key} }}`).join(tokens[key]),
        template
      );
    }

    renderError(message) {
      if (this.tilesContainer) {
        this.tilesContainer.innerHTML = `<p class="kaching-custom-display__error">${message}</p>`;
      }
    }

    renderHeader(tilesData) {
      if (!this.headerContainer) return;
      if (this.bf26) return this.renderHeader26(tilesData);
      const selected = tilesData.find((data) => data.tier.id === (this.selectedDealBarId || this.preselectedDealBarId))
        || tilesData[0];
      if (!selected) {
        this.headerContainer.hidden = true;
        return;
      }

      this.headerContainer.hidden = false;
      this.headerTitle.textContent = `${selected.tier.quantity}x ${this.productTitle}`;
      this.headerPriceCurrent.textContent = this.formatMoney(selected.price);

      const hasSavings = selected.comparePrice != null && selected.comparePrice > selected.price + 0.005;
      this.headerPriceCompare.hidden = !hasSavings;
      const hasValue = hasSavings && this.bfValueLabel && this.bfGiftValues[selected.tier.quantity];
      if (hasValue) {
        this.headerPriceCompare.style.textDecoration = 'none';
        this.headerPriceCompare.innerHTML = `<span class="kcd-value-label">${this.bfValueLabel}</span> <s>${this.formatMoney(selected.comparePrice)}</s>`;
      } else {
        this.headerPriceCompare.style.textDecoration = '';
        this.headerPriceCompare.textContent = hasSavings ? this.formatMoney(selected.comparePrice) : '';
      }

      this.savingsBadge.hidden = !hasSavings;
      if (hasSavings) {
        const pct = Math.round((1 - selected.price / selected.comparePrice) * 100);
        this.savingsBadgeText.textContent = this.t(this.i18n.savingsPrefix, {
          amount: this.formatMoney(selected.comparePrice - selected.price),
        }) + (hasValue ? ` (−${pct} %)` : '');
      }
    }

    renderTiles(tilesData) {
      if (this.bf26) return this.renderTiles26(tilesData);
      this.tilesContainer.innerHTML = '';
      const maxQty = Math.max.apply(null, tilesData.map(function (t) { return t.tier.quantity || 0; }));
      // Katera plocica nosi ponudbo. Privzeto najvecja; nastavitev jo lahko
      // premakne na manjso (npr. 1+1 = kolicina 2), ce je ta glavna ponudba.
      const heroQtySetting = parseInt(this.dataset.heroTierQuantity || '', 10);
      const heroQty = heroQtySetting > 0 ? heroQtySetting : maxQty;
      // Kljukica gre na NAJMANJSI paket, ki doseze priporocene 3 mesece (90 dni).
      let protocolQty = null;
      tilesData.forEach(function (t) {
        const d = t.dosage && t.dosage.daysSupply;
        if (d && d >= 89 && (protocolQty === null || t.tier.quantity < protocolQty)) {
          protocolQty = t.tier.quantity;
        }
      });

      tilesData.forEach(({ tier, imageUrl, price, comparePrice, baseCompare, valid, validationMessage, dosage }, index) => {
        const position = index + 1;
        const badgeStyle = this.dataset[`tier${position}Style`] || 'none';
        const rawBadgeLabel = tier.label || tier.badgeText || '';
        const badgeLabel = this.translateFromKaching(rawBadgeLabel) || rawBadgeLabel;
        const isSelected = tier.id === (this.selectedDealBarId || this.preselectedDealBarId);

        const dosageLines = [];
        if (dosage) {
          const unitLabel = this.productType === 'powder' ? this.i18n.dosageUnitPowder : this.i18n.dosageUnitCapsules;
          dosageLines.push(
            this.t(this.i18n.dosageSupply, {
              months: dosage.monthsSupply,
              amount: dosage.totalCapsules,
              unit: unitLabel,
            })
          );
          dosageLines.push(
            this.t(this.i18n.pricePerDay, {
              amount: this.formatMoney(price / (dosage.daysSupply || 1)),
            })
          );
        } else if (tier.subtitle) {
          dosageLines.push(tier.subtitle);
        }

        const tileHtml = `
          <button
            type="button"
            class="kaching-tile${isSelected ? ' kaching-tile--selected' : ''}"
            ${valid ? '' : 'disabled'}
            data-deal-bar-id="${tier.id}"
          >
            ${imageUrl || !this.giftsInTier
              ? `<span class="kaching-tile__image" aria-hidden="true"${imageUrl ? ` style="background-image:url('${imageUrl}')"` : ''}></span>`
              : ''}
            <span class="kaching-tile__content">
              <span class="kaching-tile__title">${(this.giftsInTier && tier.quantity === heroQty && (this.dataset.heroTitle || '').trim()) ? this.dataset.heroTitle.trim() : (this.translateFromKaching(tier.title) || tier.title)}</span>
              <span class="kaching-tile__price-row">
                <span class="kaching-tile__price">${this.formatMoney(price / tier.quantity)}</span>
                ${this.giftsInTier && baseCompare && baseCompare > price
                  ? ((this.bfValueLabel && this.bfGiftValues[tier.quantity])
                    ? `<span class="kcd-tile-value">${this.bfTileValueLabel}</span> <s class="kaching-tile__price-compare">${this.formatMoney(comparePrice / tier.quantity)}</s>`
                    : `<s class="kaching-tile__price-compare">${this.formatMoney(baseCompare / tier.quantity)}</s>`)
                  : ''}
                ${this.bfValueLabel && this.bfGiftValues[tier.quantity] && comparePrice > price
                  ? `<span class="kcd-tile-pct">−${Math.round((1 - price / comparePrice) * 100)} %</span>`
                  : ''}
              </span>
              ${dosageLines.map((line) => `<span class="kaching-tile__dosage">${line}</span>`).join('')}
              ${this.giftsInTier && tier.quantity === protocolQty
                ? `<span class="kaching-tile__check">✓ ${this.dataset.protocolLabel || '3-mesečni protokol'}</span>`
                : ''}
              ${tier.quantity === 2 && (this.dataset.bfDuoGift || '').trim()
                ? `<span class="kaching-tile__checklist-item">${this.dataset.bfDuoGift.trim()}</span>`
                : ''}
              ${!valid ? `<span class="kaching-tile__unavailable">${validationMessage || this.i18n.unavailable}</span>` : ''}
            </span>
          </button>
        `;

        const isHero = this.giftsInTier && tier.quantity === heroQty;
        const heroLabel = isHero ? (this.dataset.heroLabel || '').trim() : '';
        const withGifts = isHero && !!this.gifts && !!this.gifts.length;
        const giftsHtml = withGifts ? this.giftsMarkup() : '';
        const listHtml = isHero ? this.checklistMarkup() : '';
        const label = heroLabel || badgeLabel;
        const bare = (badgeStyle === 'none' && !heroLabel) || (!label && !withGifts);

        let wrapperEl = document.createElement('div');
        if (bare) {
          wrapperEl.innerHTML = tileHtml;
        } else if ((badgeStyle === 'none' || !label) && !heroLabel) {
          wrapperEl.className = 'kaching-tile-wrapper';
          wrapperEl.innerHTML = `${tileHtml}${listHtml}${giftsHtml}`;
        } else {
          wrapperEl.className = `kaching-tile-wrapper kaching-tile-wrapper--${badgeStyle === 'none' ? 'best' : badgeStyle}`;
          wrapperEl.innerHTML = `
            <p class="kaching-tile-wrapper__label">${label}</p>
            ${tileHtml}
            ${listHtml}
            ${giftsHtml}
          `;
        }
        if (withGifts) wrapperEl.classList.add('kaching-tile-wrapper--has-gifts');

        const tileButton = wrapperEl.querySelector('.kaching-tile');
        tileButton.addEventListener('click', () => this.handleTileClick(tier));

        // Seznam in darila so zunaj gumba, zato klik nanju sam po sebi ne izbere
        // ponudbe. Poslusamo cel okvir; klike znotraj gumba pusti gumbu.
        if (isHero) {
          wrapperEl.classList.add('kaching-tile-wrapper--clickable');
          wrapperEl.addEventListener('click', (event) => {
            if (event.target.closest('.kaching-tile')) return;
            if (tileButton.disabled) return;
            this.handleTileClick(tier);
          });
        }

        if (bare) {
          this.tilesContainer.appendChild(tileButton);
        } else {
          this.tilesContainer.appendChild(wrapperEl);
        }
      });
    }

    // Darila izrisana kot del ploscice. Nastanejo znotraj renderTiles, zato
    // prezivijo vsak ponovni izris - nic se ne premika po DOM-u.
    // Vrednostni sklop, ki ga uporabnik vpise v urejevalniku teme.
    checklistMarkup() {
      let items = [];
      try {
        items = JSON.parse(this.dataset.offerChecklist || '[]');
      } catch (e) {
        items = [];
      }
      items = items.map((x) => String(x).trim()).filter(Boolean);
      const total = (this.dataset.offerTotal || '').trim();
      if (!items.length && !total) return '';
      const rows = items
        .map((x) => `<span class="kaching-tile__checklist-item">${x}</span>`)
        .join('');
      const totalRow = total ? `<span class="kaching-tile__total">${total}</span>` : '';
      return `<span class="kaching-tile__checklist">${rows}${totalRow}</span>`;
    }

    giftsMarkup() {
      if (!this.gifts || !this.gifts.length) return '';
      const heading = this.dataset.giftsTitle || '';
      const boxes = this.gifts
        .map((gift) => {
          const image = gift.image
            ? `<img class="kaching-gift__image" src="${gift.image}" alt="" loading="lazy">`
            : `<span class="kaching-gift__icon"><span class="material-icon material-symbols-outlined">${gift.icon || 'redeem'}</span></span>`;
          const priceEl = gift.comparePrice
            ? `<span class="kaching-gift__compare-price">${this.formatMoney(gift.comparePrice)}</span>`
            : '';
          return `<div class="kaching-gift kaching-gift--unlocked">${image}<span class="kaching-gift__title">${gift.title}</span>${priceEl}</div>`;
        })
        .join('');
      return `<div class="kaching-tile__gifts">${heading ? `<p class="kaching-tile__gifts-heading">${heading}</p>` : ''}<div class="kaching-tile__gifts-list">${boxes}</div></div>`;
    }

    renderGifts() {
      if (!this.giftsContainer) return;
      if (this.bf26) { if (this.giftsWrapper) this.giftsWrapper.hidden = true; return; }

      if (!this.gifts || this.gifts.length === 0) {
        this.giftsContainer.innerHTML = '';
        if (this.giftsWrapper) this.giftsWrapper.hidden = true;
        return;
      }

      if (this.giftsWrapper) this.giftsWrapper.hidden = !!this.giftsInTier;
      if (this.giftsInTier) return;

      const headingEl = this.querySelector('.kaching-custom-display__gifts-heading');
      if (headingEl && this.giftsTitle) {
        headingEl.textContent = this.translateFromKaching(this.giftsTitle) || this.giftsTitle;
      }

      const selectedBarPosition = this.getSelectedBarPosition();
      const visibleGifts = this.hideLockedGifts
        ? this.gifts.filter((gift) => selectedBarPosition >= gift.unlockAtBar)
        : this.gifts;

      this.giftsContainer.innerHTML = visibleGifts
        .map((gift) => {
          const unlocked = selectedBarPosition >= gift.unlockAtBar;
          const image = gift.image
            ? `<img class="kaching-gift__image" src="${gift.image}" alt="" loading="lazy">`
            : `<span class="kaching-gift__icon"><span class="material-icon material-symbols-outlined">${gift.icon || 'redeem'}</span></span>`;
          const title = unlocked
            ? `<span class="kaching-gift__title">${gift.title}</span>`
            : `<span class="kaching-gift__title">${gift.lockedTitle || 'Locked'}</span>`;
          const priceEl = gift.comparePrice
            ? `<span class="kaching-gift__compare-price">${this.formatMoney(gift.comparePrice)}</span>`
            : '';

          return `
            <div class="kaching-gift${unlocked ? ' kaching-gift--unlocked' : ''}">
              ${image}
              ${title}
              ${priceEl}
            </div>
          `;
        })
        .join('');
    }

    // ---- BF 2026 izgled (vklop: nastavitev teme "BF 2026 dizajn paketov") ----
    l26() {
      const lang = (document.documentElement.lang || 'sl').split('-')[0].toLowerCase();
      const L = {
        sl: { save: 'Prihraniš', value: 'Vrednost', saveTag: 'PRIHRANI', unit: '/kos', months: '-mesečna zaloga', weeks: '-tedenska zaloga', excl: 'BLACK FRIDAY EKSKLUZIVNO', gratis: 'GRATIS',
          chkGifts: 'Brezplačna darila', chkGiftsVal: (v) => `Brezplačna darila (${v} vrednosti)`, chkLowest: 'Najnižja cena na kos', chkShip: 'Brezplačna dostava', chkDose: 'Odmerek prilagojen teži psa', chkGuarantee: '90-dnevna garancija vračila kupnine',
          gifts: (n) => (n === 1 ? '1 GRATIS darilo' : n === 2 ? '2 GRATIS darili' : n + ' GRATIS darila'),
          giftsHead: (n) => (n === 1 ? 'GRATIS darilo ob tvojem nakupu!' : n === 2 ? '2 GRATIS darili ob tvojem nakupu!' : n + ' GRATIS darila ob tvojem nakupu!') },
        hr: { save: 'Uštedi', value: 'Vrijednost', saveTag: 'UŠTEDI', unit: '/kom', months: '-mjesečna zaliha', weeks: '-tjedna zaliha', excl: 'BLACK FRIDAY EKSKLUZIVNO', gratis: 'GRATIS',
          chkGifts: 'Besplatni pokloni', chkGiftsVal: (v) => `Besplatni pokloni (vrijednost ${v})`, chkLowest: 'Najniža cijena po komadu', chkShip: 'Besplatna dostava', chkDose: 'Doza prilagođena težini psa', chkGuarantee: '90-dnevno jamstvo povrata novca',
          gifts: (n) => (n === 1 ? '1 GRATIS poklon' : n + ' GRATIS poklona'),
          giftsHead: (n) => (n === 1 ? 'GRATIS poklon uz tvoju kupnju!' : n + ' GRATIS poklona uz tvoju kupnju!') },
        cs: { save: 'Ušetříte', value: 'Hodnota', saveTag: 'UŠETŘÍTE', unit: '/ks', months: 'měsíční zásoba', weeks: 'týdenní zásoba', excl: 'BLACK FRIDAY EXKLUZIVNĚ', gratis: 'ZDARMA',
          chkGifts: 'Dárky zdarma', chkGiftsVal: (v) => `Dárky zdarma (v hodnotě ${v})`, chkLowest: 'Nejnižší cena za kus', chkShip: 'Doprava zdarma', chkDose: 'Dávka podle váhy psa', chkGuarantee: '90denní záruka vrácení peněz',
          gifts: (n) => (n === 1 ? '1 dárek ZDARMA' : n + ' dárky ZDARMA'),
          giftsHead: (n) => (n === 1 ? 'Dárek ZDARMA k nákupu!' : n + ' dárky ZDARMA k nákupu!') }
      };
      return L[lang] || L.sl;
    }

    supplyTitle26(tier, dosage) {
      const L = this.l26();
      if (!dosage || !dosage.daysSupply) return this.translateFromKaching(tier.title) || tier.title;
      const join = (n, s) => n + (s.charAt(0) === '-' ? s : ' ' + s);
      if ((document.documentElement.lang || '').toLowerCase().indexOf('cs') === 0) {
        const mm = dosage.daysSupply / 30;
        if (Math.abs(mm - Math.round(mm)) < 0.08) { const n = Math.round(mm); return 'Zásoba na ' + n + (n === 1 ? ' měsíc' : n <= 4 ? ' měsíce' : ' měsíců'); }
        const w = Math.round(dosage.daysSupply / 7); return 'Zásoba na ' + w + (w <= 4 ? ' týdny' : ' týdnů');
      }
      const m = dosage.daysSupply / 30;
      if (Math.abs(m - Math.round(m)) < 0.08) return join(Math.round(m), L.months);
      return join(Math.round(dosage.daysSupply / 7), L.weeks);
    }

    heroQty26(tilesData) {
      const maxQty = Math.max.apply(null, tilesData.map((t) => t.tier.quantity || 0));
      const s = parseInt(this.dataset.heroTierQuantity || '', 10);
      return s > 0 ? s : maxQty;
    }

    giftsForTier26(tier, heroQty) {
      const cur26 = window.Shopify && window.Shopify.currency ? window.Shopify.currency.active : 'EUR';
      if (this.dataset.bf26Plan === '1' && (cur26 === 'EUR' || cur26 === 'CZK')) return this.plannedGifts26(tier, heroQty);
      if (tier.quantity === heroQty) {
        return (this.gifts || []).map((g) => ({ title: g.title, image: g.image, icon: g.icon, compare: g.comparePrice || this.giftFallbackValue26(g.title) }));
      }
      const duo = (this.dataset.bfDuoGift || '').trim();
      if (tier.quantity === 2 && duo) {
        const m = duo.match(/^[^:]*:\s*(.*?)\s*[—–-]\s*([\d.,]+\s*\S*)$/);
        const t = m ? m[1] : duo;
        const key = t.toLowerCase().slice(0, 6);
        const same = (this.gifts || []).find((g) => g.image && String(g.title || '').toLowerCase().indexOf(key) !== -1);
        const ttl = same ? same.title : t;
        return [{ title: ttl, image: same ? same.image : null, icon: 'redeem', compare: (same && same.comparePrice) || this.giftFallbackValue26(ttl), compareText: m ? m[2] : '' }];
      }
      return [];
    }

    // Nacrtovana BF darila (predogled, vklop: nastavitev "bf26_planned_gifts").
    plannedGifts26(tier, heroQty) {
      const CDN = 'https://cdn.shopify.com/s/files/1/0970/1284/2821/files/';
      const title = String(this.productTitle || '').toLowerCase();
      const lang26 = (document.documentElement.lang || '').toLowerCase();
      const hr = lang26.indexOf('hr') === 0;
      const czk = (window.Shopify && window.Shopify.currency ? window.Shopify.currency.active : 'EUR') === 'CZK';
      const V = czk ? { jar: 1140, bowl: 225, sticks: 375, ship: 99 } : { jar: 45.9, bowl: 9.0, sticks: 14.9, ship: 3.95 };
      const cs = lang26.indexOf('cs') === 0;
      const heroGift = title.indexOf('dentalmix') !== -1
        ? { title: 'MobiMix', image: CDN + '1xMobiMix.png?width=200', compare: V.jar }
        : { title: 'DentalMix', image: CDN + '1xDentalMix-no_bg.png?width=200', compare: V.jar };
      const bowl = { title: cs ? 'Skládací miska' : hr ? 'Sklopiva zdjelica' : 'Zložljiva posodica', image: CDN + 'Ada0f20e1488b42368773869a28a63524b1.png?width=200', compare: V.bowl };
      const sticks = { title: 'DentalSticks', image: CDN + 'hf_20260709_194728_f15d5b24-84c3-48bd-a64e-0545ecd72289.png?width=200', compare: V.sticks };
      const ship = { title: cs ? 'Doprava zdarma' : hr ? 'Besplatna dostava' : 'Brezplačna dostava', image: null, icon: 'local_shipping', compare: V.ship };
      if (tier.quantity >= 3 || tier.quantity === heroQty) return [heroGift, bowl, sticks, ship];
      if (tier.quantity === 2) return [bowl, sticks];
      return [];
    }

    // Privzete vrednosti daril (EUR), dokler v Kachingu ni vpisane primerjalne cene.
    giftFallbackValue26(title) {
      const cur = window.Shopify && window.Shopify.currency ? window.Shopify.currency.active : 'EUR';
      if (cur !== 'EUR') return null;
      const t = String(title || '').toLowerCase();
      if (t.indexOf('posod') !== -1 || t.indexOf('zdjel') !== -1 || t.indexOf('ciotol') !== -1) return 9.0;
      if (t.indexOf('dentalstick') !== -1) return 14.9;
      if (t.indexOf('dentalmix') !== -1 || t.indexOf('mobimix') !== -1 || t.indexOf('floramix') !== -1) return 45.9;
      if (t.indexOf('dostav') !== -1 || t.indexOf('shipping') !== -1) return 3.95;
      return null;
    }

    renderHeader26(tilesData) {
      const L = this.l26();
      const selected = tilesData.find((d) => d.tier.id === (this.selectedDealBarId || this.preselectedDealBarId)) || tilesData[0];
      if (!selected) {
        this.headerContainer.hidden = true;
        return;
      }
      this.headerContainer.hidden = false;
      this.headerTitle.textContent = '';
      this.headerTitle.hidden = true;
      this.headerPriceCurrent.textContent = this.formatMoney(selected.price);
      const hasSavings = selected.comparePrice != null && selected.comparePrice > selected.price + 0.005;
      this.headerPriceCompare.hidden = !hasSavings;
      this.headerPriceCompare.style.textDecoration = 'none';
      this.headerPriceCompare.innerHTML = hasSavings
        ? `<span class="kcd-value-label">${L.value}</span> <s>${this.formatMoney(selected.comparePrice)}</s>`
        : '';
      this.savingsBadge.hidden = !hasSavings;
      if (hasSavings) {
        const pct = Math.round((1 - selected.price / selected.comparePrice) * 100);
        this.savingsBadgeText.textContent = `${L.save} ${this.formatMoney(selected.comparePrice - selected.price)} (−${pct} %)`;
      }
    }

    renderTiles26(tilesData) {
      const L = this.l26();
      this.tilesContainer.innerHTML = '';
      const heroQty = this.heroQty26(tilesData);
      const selId = this.selectedDealBarId || this.preselectedDealBarId;
      tilesData.forEach(({ tier, price, comparePrice, baseCompare, valid, validationMessage, dosage }) => {
        const isSel = tier.id === selId;
        const isHero = tier.quantity === heroQty;
        const gifts = this.giftsForTier26(tier, heroQty);
        const qty = tier.quantity || 1;
        const unit = price / qty;
        const unitBase = comparePrice && comparePrice > (baseCompare || 0) ? comparePrice / qty : (baseCompare ? baseCompare / qty : null);
        const pctBase = comparePrice && comparePrice > price ? comparePrice : baseCompare;
        const pct = pctBase && pctBase > price ? Math.round((1 - price / pctBase) * 100) : 0;
        const qtyLine = `${qty}× ${this.productTitle}${gifts.length ? ' + ' + L.gifts(gifts.length) : ''}`;

        const giftTiles = gifts
          .map((g) => {
            const img = g.image
              ? `<img class="kcd26-gift__img" src="${g.image}" alt="" loading="lazy">`
              : `<span class="kcd26-gift__img kcd26-gift__img--icon"><span class="material-icon material-symbols-outlined">${g.icon || 'redeem'}</span></span>`;
            const was = g.compare ? this.formatMoney(g.compare) : g.compareText || '';
            return `<div class="kcd26-gift"><span class="kcd26-gift__tag">${L.gratis}</span>${img}<span class="kcd26-gift__name">${g.title}</span>${was ? `<s class="kcd26-gift__was">${was}</s>` : ''}</div>`;
          })
          .join('');

        const giftSum = gifts.reduce((a, g) => a + (Number(g.compare) || (g.compareText ? this.parseMoneyText(g.compareText) || 0 : 0)), 0);
        const checksArr = [];
        if (gifts.length) checksArr.push(giftSum > 0 ? L.chkGiftsVal(this.formatMoney(giftSum)) : L.chkGifts);
        if (isHero) checksArr.push(L.chkLowest);
        if (isHero) checksArr.push(L.chkShip);
        checksArr.push(L.chkDose);
        checksArr.push(L.chkGuarantee);
        const checklist = `<div class="kcd26-checks">${checksArr.map((x) => `<span class="kcd26-check">${x}</span>`).join('')}</div>`;

        const giftsBox = gifts.length
          ? `<div class="kcd26-gifts"><p class="kcd26-gifts__head">${L.giftsHead(gifts.length)}</p><div class="kcd26-gifts__grid">${giftTiles}</div></div>`
          : '';
        const body = isSel ? `<div class="kcd26-body">${checklist}${giftsBox}</div>` : '';

        const el = document.createElement('div');
        el.className = `kcd26-card${isSel ? ' is-selected' : ''}${isHero ? ' is-hero' : ''}${valid ? '' : ' is-disabled'}`;
        el.setAttribute('role', 'button');
        el.setAttribute('tabindex', '0');
        el.setAttribute('aria-pressed', isSel ? 'true' : 'false');
        el.dataset.dealBarId = tier.id;
        el.innerHTML = `
          ${isHero ? `<div class="kcd26-card__strip">${L.excl}</div>` : ''}
          <div class="kcd26-card__main">
            <div class="kcd26-card__left">
              <div class="kcd26-card__titlerow"><span class="kcd26-dot" aria-hidden="true"></span><span class="kcd26-card__title">${this.supplyTitle26(tier, dosage)}</span></div>
              <div class="kcd26-card__qty">${qtyLine}</div>
              ${!valid ? `<div class="kcd26-card__unavail">${validationMessage || this.i18n.unavailable}</div>` : ''}
            </div>
            <div class="kcd26-card__right">
              ${pct > 0 ? `<span class="kcd26-save">${L.saveTag} −${pct} %</span>` : ''}
              <span class="kcd26-price">${this.formatMoney(unit)}${L.unit}</span>
              ${unitBase && unitBase > unit + 0.005 ? `<s class="kcd26-strike">${this.formatMoney(unitBase)}${L.unit}</s>` : ''}
            </div>
          </div>
          ${body}`;
        const pick = () => {
          if (valid) this.handleTileClick(tier);
        };
        el.addEventListener('click', pick);
        el.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            pick();
          }
        });
        this.tilesContainer.appendChild(el);
      });
    }

    async handleTileClick(tier) {
      this.selectedDealBarId = tier.id;
      this.refresh();

      // Only sync the selection into Kaching's own widget so its internal
      // state (and therefore the real Add to Cart button) reflects the
      // chosen tier. Adding to cart itself is left entirely to the
      // visible Add to Cart button - we never submit on the user's behalf.
      const kachingBlock = await this.waitForKachingBlock();
      if (kachingBlock) {
        const radio = kachingBlock.querySelector(
          `[data-deal-bar-id="${tier.id}"] input[type="radio"]`
        );
        if (radio && !radio.checked) {
          radio.checked = true;
          radio.dispatchEvent(new Event('input', { bubbles: true }));
          radio.dispatchEvent(new Event('change', { bubbles: true }));
          radio.dispatchEvent(new Event('click', { bubbles: true }));
        } else if (!radio) {
          console.warn('kaching-custom-display: no matching deal-bar radio found for', tier.id);
        }
      } else {
        console.warn('kaching-custom-display: kaching-bundles-block never appeared.');
      }
    }
  }

  customElements.define('kaching-custom-display', KachingCustomDisplay);
}
