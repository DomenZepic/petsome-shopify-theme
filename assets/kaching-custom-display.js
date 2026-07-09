if (!customElements.get('kaching-custom-display')) {
  class KachingCustomDisplay extends HTMLElement {
    connectedCallback() {
      this.sectionId = this.dataset.section;
      this.productTitle = this.dataset.productTitle || '';
      this.productType = this.dataset.productType || 'capsules';
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
      const settingsEl = document.querySelector(
        `script.kaching-bundles-deal-block-settings[data-product-id="${productId}"]`
      );
      if (!settingsEl) return null;
      try {
        return JSON.parse(settingsEl.textContent);
      } catch (error) {
        return null;
      }
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
        return { title: gift.title, image: null, icon: 'local_shipping' };
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
      return { title: gift.title === '{{product}}' ? 'Gift' : gift.title, image: null, icon: 'redeem' };
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
          lockedTitle: gift.lockedTitle,
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
        comparePrice: basePrice != null ? basePrice * tier.quantity : null,
        valid: available,
        validationMessage: available ? null : 'Unavailable',
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

        const total = perItemPrice * data.tier.quantity;
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
        return new Intl.NumberFormat(document.documentElement.lang || undefined, {
          style: 'currency',
          currency: window.Shopify && window.Shopify.currency ? window.Shopify.currency.active : 'EUR',
        }).format(amount);
      } catch (error) {
        return `${amount.toFixed(2)}`;
      }
    }

    renderError(message) {
      if (this.tilesContainer) {
        this.tilesContainer.innerHTML = `<p class="kaching-custom-display__error">${message}</p>`;
      }
    }

    renderHeader(tilesData) {
      if (!this.headerContainer) return;
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
      this.headerPriceCompare.textContent = hasSavings ? this.formatMoney(selected.comparePrice) : '';

      this.savingsBadge.hidden = !hasSavings;
      if (hasSavings) {
        this.savingsBadgeText.textContent = `Prihraniš ${this.formatMoney(selected.comparePrice - selected.price)}`;
      }
    }

    renderTiles(tilesData) {
      this.tilesContainer.innerHTML = '';

      tilesData.forEach(({ tier, imageUrl, price, valid, validationMessage, dosage }, index) => {
        const position = index + 1;
        const badgeStyle = this.dataset[`tier${position}Style`] || 'none';
        const badgeLabel = tier.label || tier.badgeText || '';
        const isSelected = tier.id === (this.selectedDealBarId || this.preselectedDealBarId);

        const dosageLines = [];
        if (dosage) {
          const unitLabel = this.productType === 'powder' ? 'g' : 'kapsul';
          dosageLines.push(`${dosage.monthsSupply}-mesečna zaloga (${dosage.totalCapsules} ${unitLabel})`);
          dosageLines.push(`${this.formatMoney(price / (dosage.daysSupply || 1))} / dan`);
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
            <span class="kaching-tile__image" aria-hidden="true"${imageUrl ? ` style="background-image:url('${imageUrl}')"` : ''}></span>
            <span class="kaching-tile__content">
              <span class="kaching-tile__title">${tier.title}</span>
              <span class="kaching-tile__price">${this.formatMoney(price / tier.quantity)}</span>
              ${dosageLines.map((line) => `<span class="kaching-tile__dosage">${line}</span>`).join('')}
              ${!valid ? `<span class="kaching-tile__unavailable">${validationMessage || 'Unavailable'}</span>` : ''}
            </span>
          </button>
        `;

        let wrapperEl;
        if (badgeStyle === 'none' || !badgeLabel) {
          wrapperEl = document.createElement('div');
          wrapperEl.innerHTML = tileHtml;
        } else {
          wrapperEl = document.createElement('div');
          wrapperEl.className = `kaching-tile-wrapper kaching-tile-wrapper--${badgeStyle}`;
          wrapperEl.innerHTML = `
            <p class="kaching-tile-wrapper__label">${badgeLabel}</p>
            ${tileHtml}
          `;
        }

        const tileButton = wrapperEl.querySelector('.kaching-tile');
        tileButton.addEventListener('click', () => this.handleTileClick(tier));

        if (badgeStyle === 'none' || !badgeLabel) {
          this.tilesContainer.appendChild(tileButton);
        } else {
          this.tilesContainer.appendChild(wrapperEl);
        }
      });
    }

    renderGifts() {
      if (!this.giftsContainer) return;

      if (!this.gifts || this.gifts.length === 0) {
        this.giftsContainer.innerHTML = '';
        if (this.giftsWrapper) this.giftsWrapper.hidden = true;
        return;
      }

      if (this.giftsWrapper) this.giftsWrapper.hidden = false;

      const headingEl = this.querySelector('.kaching-custom-display__gifts-heading');
      if (headingEl && this.giftsTitle) {
        headingEl.textContent = this.giftsTitle;
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
