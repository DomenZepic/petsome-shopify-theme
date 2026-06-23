if (!customElements.get('kaching-custom-display')) {
  class KachingCustomDisplay extends HTMLElement {
    connectedCallback() {
      this.sectionId = this.dataset.section;
      this.capsulesPerPackage = parseFloat(this.dataset.capsulesPerPackage) || 0;
      this.capsulesPerDayBySize = (this.dataset.capsulesPerDayBySize || '')
        .split(',')
        .map((value) => parseFloat(value.trim()))
        .filter((value) => !Number.isNaN(value));

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

      this.waitForKachingReady().then(() => this.refresh());
    }

    disconnectedCallback() {
      this.sizeRadios.forEach((radio) => radio.removeEventListener('change', this.onSizeChange));
    }

    waitForKachingReady() {
      if (typeof this.kachingEl.pricing === 'function') return Promise.resolve();
      return new Promise((resolve) => {
        let resolved = false;
        const done = () => {
          if (resolved) return;
          resolved = true;
          resolve();
        };
        document.addEventListener('kaching-bundles-initialized', done, { once: true });
        this.kachingEl.addEventListener('kaching-bundles-initialized', done, { once: true });
        setTimeout(done, 4000);
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
        return { title: gift.title, image: null, icon: '🚚' };
      }
      if (gift.productGID) {
        const numericId = gift.productGID.split('/').pop();
        const productEl = document.querySelector(
          `script.kaching-bundles-product[data-product-id="${numericId}"]`
        );
        if (productEl) {
          try {
            const productData = JSON.parse(productEl.textContent);
            return { title: productData.title, image: productData.image, icon: '🎁' };
          } catch (error) {
            // fall through to default below
          }
        }
      }
      return { title: gift.title === '{{product}}' ? 'Gift' : gift.title, image: null, icon: '🎁' };
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
      const variant = this.getSelectedVariant();
      if (variant && this.kachingEl) {
        this.kachingEl.currentVariantId = variant.id;
      }
      this.refresh();
    }

    async setKachingQuantity(quantity) {
      try {
        this.kachingEl.quantity = quantity;
      } catch (error) {
        // ignore, fall through to manual input fallback below
      }
      const quantityInput = this.kachingEl.querySelector('input[name="quantity"]');
      if (quantityInput) {
        quantityInput.value = quantity;
        quantityInput.dispatchEvent(new Event('input', { bubbles: true }));
        quantityInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
      await new Promise((resolve) => setTimeout(resolve, 60));
    }

    async readPricingForTier(tier) {
      await this.setKachingQuantity(tier.quantity);

      let pricing = null;
      let valid = true;
      let validationMessage = null;

      try {
        if (typeof this.kachingEl.pricing === 'function') {
          pricing = await this.kachingEl.pricing();
        }
      } catch (error) {
        pricing = null;
      }

      try {
        if (typeof this.kachingEl.isItemSelectionValid === 'function') {
          valid = this.kachingEl.isItemSelectionValid();
        } else if (typeof this.kachingEl.validateItemSelection === 'function') {
          const result = await this.kachingEl.validateItemSelection();
          valid = !!(result && result.valid);
          validationMessage = result && result.message;
        }
      } catch (error) {
        valid = true;
      }

      return { pricing, valid, validationMessage };
    }

    computeFallbackPrice(tier, variant) {
      if (!variant) return null;
      const basePrice = Number(variant.price) / 100 || Number(variant.price);
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

    async refresh() {
      this.renderLoading();
      const sizeIndex = this.getSelectedSizeIndex();
      const variant = this.getSelectedVariant();
      this.currentImageUrl = variant && variant.featured_image ? variant.featured_image.src : null;
      const previousQuantity = this.kachingEl.quantity;

      const tilesData = [];
      for (const tier of this.dealBars) {
        const { pricing, valid, validationMessage } = await this.readPricingForTier(tier);
        const price = pricing && pricing.discountedPrice != null
          ? pricing.discountedPrice
          : this.computeFallbackPrice(tier, variant);
        const dosage = this.computeDosage(tier, sizeIndex);

        tilesData.push({ tier, price, valid, validationMessage, dosage });
      }

      if (previousQuantity != null) {
        await this.setKachingQuantity(previousQuantity);
      }

      this.renderTiles(tilesData);
      this.renderGifts();
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

    renderLoading() {
      if (!this.tilesContainer.querySelector('.kaching-tile')) {
        this.tilesContainer.innerHTML = '<p class="kaching-custom-display__loading">…</p>';
      }
    }

    renderError(message) {
      if (this.tilesContainer) {
        this.tilesContainer.innerHTML = `<p class="kaching-custom-display__error">${message}</p>`;
      }
    }

    renderTiles(tilesData) {
      this.tilesContainer.innerHTML = '';

      tilesData.forEach(({ tier, price, valid, validationMessage, dosage }) => {
        const tile = document.createElement('button');
        tile.type = 'button';
        tile.className = 'kaching-tile';
        tile.disabled = !valid;
        tile.dataset.dealBarId = tier.id;
        tile.dataset.badgeStyle = this.badgeStyleFor(tier.badgeText);

        const badge = tier.badgeText
          ? `<span class="kaching-tile__badge">${tier.badgeText}</span>`
          : '';

        const subtitleParts = [];
        if (tier.subtitle) subtitleParts.push(tier.subtitle);
        if (dosage) {
          subtitleParts.push(
            `${dosage.monthsSupply}-mesečna zaloga (${dosage.totalCapsules} kapsul) · ${this.formatMoney(price / (dosage.daysSupply || 1))} / dan`
          );
        }

        tile.innerHTML = `
          ${badge}
          <span class="kaching-tile__image" aria-hidden="true"${this.currentImageUrl ? ` style="background-image:url('${this.currentImageUrl}')"` : ''}></span>
          <span class="kaching-tile__content">
            <span class="kaching-tile__title">${tier.title}</span>
            <span class="kaching-tile__subtitle">${subtitleParts.join(' · ')}</span>
            ${!valid ? `<span class="kaching-tile__unavailable">${validationMessage || 'Unavailable'}</span>` : ''}
          </span>
          <span class="kaching-tile__price">${this.formatMoney(price)}</span>
        `;

        tile.addEventListener('click', () => this.handleTileClick(tier));
        this.tilesContainer.appendChild(tile);

        if (tier.id === this.preselectedDealBarId) {
          tile.classList.add('kaching-tile--selected');
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
            ? `<span class="kaching-gift__image" style="background-image:url('${gift.image}')"></span>`
            : `<span class="kaching-gift__image kaching-gift__image--placeholder">${gift.icon || '🎁'}</span>`;
          const lockText = unlocked
            ? ''
            : `<span class="kaching-gift__lock-text">${gift.lockedTitle || 'Locked'}</span>`;

          return `
            <div class="kaching-gift${unlocked ? ' kaching-gift--unlocked' : ''}">
              ${image}
              ${unlocked ? `<span class="kaching-gift__title">${gift.title}</span>` : ''}
              ${lockText}
            </div>
          `;
        })
        .join('');
    }

    badgeStyleFor(badgeText) {
      if (!badgeText) return 'none';
      const normalized = badgeText.toLowerCase();
      if (normalized.includes('največji') || normalized.includes('prihranek')) return 'best';
      if (normalized.includes('priporo') || normalized.includes('popular')) return 'recommended';
      return 'default';
    }

    async handleTileClick(tier) {
      this.querySelectorAll('.kaching-tile').forEach((tile) => {
        tile.classList.toggle('kaching-tile--selected', tile.dataset.dealBarId === tier.id);
      });

      this.selectedDealBarId = tier.id;
      this.renderGifts();

      await this.setKachingQuantity(tier.quantity);

      const form = this.kachingEl.querySelector('form');
      if (form) {
        if (typeof form.requestSubmit === 'function') {
          form.requestSubmit();
        } else {
          form.submit();
        }
        return;
      }

      const addToCartButton = this.kachingEl.querySelector(
        'button[type="submit"], input[type="submit"]'
      );
      if (addToCartButton) {
        addToCartButton.click();
      } else {
        console.warn('kaching-custom-display: could not find a way to trigger add-to-cart on the Kaching widget.');
      }
    }
  }

  customElements.define('kaching-custom-display', KachingCustomDisplay);
}
