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

    readDealBars() {
      const productId = this.kachingEl.getAttribute('product-id');
      const settingsEl = document.querySelector(
        `script.kaching-bundles-deal-block-settings[data-product-id="${productId}"]`
      );
      if (!settingsEl) return [];
      try {
        const settings = JSON.parse(settingsEl.textContent);
        return Array.isArray(settings.dealBars) ? settings.dealBars : [];
      } catch (error) {
        return [];
      }
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
          <span class="kaching-tile__title">${tier.title}</span>
          <span class="kaching-tile__subtitle">${subtitleParts.join(' · ')}</span>
          <span class="kaching-tile__price">${this.formatMoney(price)}</span>
          ${!valid ? `<span class="kaching-tile__unavailable">${validationMessage || 'Unavailable'}</span>` : ''}
        `;

        tile.addEventListener('click', () => this.handleTileClick(tier));
        this.tilesContainer.appendChild(tile);

        if (tier.id === this.preselectedDealBarId) {
          tile.classList.add('kaching-tile--selected');
        }
      });
    }

    async handleTileClick(tier) {
      this.querySelectorAll('.kaching-tile').forEach((tile) => {
        tile.classList.toggle('kaching-tile--selected', tile.dataset.dealBarId === tier.id);
      });

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
