if (!customElements.get('progressive-gifts')) {
  class ProgressiveGifts extends HTMLElement {
    connectedCallback() {
      this.sectionId = this.dataset.section;
      this.productHandle = this.dataset.productHandle;

      const configEl = this.querySelector('[data-progressive-gifts-config]');
      try {
        this.gifts = JSON.parse((configEl && configEl.textContent) || '[]');
      } catch (error) {
        this.gifts = [];
      }

      this.variantRadios = Array.from(
        document.querySelectorAll(
          `#variant-selects-${this.sectionId} input[type="radio"][data-package-quantity]`
        )
      );

      this.onVariantChange = this.onVariantChange.bind(this);
      this.variantRadios.forEach((radio) => {
        radio.addEventListener('change', this.onVariantChange);
      });

      if (this.gifts.length > 0 && this.variantRadios.length > 0) {
        this.syncGiftsForCurrentSelection();
      }
    }

    disconnectedCallback() {
      this.variantRadios.forEach((radio) => {
        radio.removeEventListener('change', this.onVariantChange);
      });
    }

    onVariantChange() {
      this.syncGiftsForCurrentSelection();
    }

    getSelectedQuantity() {
      const checked = this.variantRadios.find((radio) => radio.checked);
      if (!checked) return null;
      const quantity = parseFloat(checked.dataset.packageQuantity);
      return Number.isNaN(quantity) ? null : quantity;
    }

    async syncGiftsForCurrentSelection() {
      const selectedQuantity = this.getSelectedQuantity();
      const desiredGifts =
        selectedQuantity === null
          ? []
          : this.gifts.filter((gift) => Number(gift.requiredQuantity) === selectedQuantity);

      let cart;
      try {
        const cartResponse = await fetch('/cart.js');
        cart = await cartResponse.json();
      } catch (error) {
        return;
      }

      const myGiftLines = cart.items.filter(
        (item) => item.properties && item.properties._progressive_gift_source === this.productHandle
      );

      const desiredVariantIds = desiredGifts.map((gift) => String(gift.variantId));
      const updates = {};

      myGiftLines.forEach((line) => {
        if (!desiredVariantIds.includes(String(line.variant_id))) {
          updates[line.key] = 0;
        }
      });

      if (Object.keys(updates).length > 0) {
        await fetch('/cart/update.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ updates }),
        });
      }

      const remainingVariantIds = myGiftLines
        .filter((line) => !updates[line.key])
        .map((line) => String(line.variant_id));

      const itemsToAdd = desiredGifts.filter(
        (gift) => !remainingVariantIds.includes(String(gift.variantId))
      );

      if (itemsToAdd.length > 0) {
        await fetch('/cart/add.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: itemsToAdd.map((gift) => ({
              id: gift.variantId,
              quantity: 1,
              properties: {
                _progressive_gift: 'true',
                _progressive_gift_source: this.productHandle,
              },
            })),
          }),
        });
      }

      if (Object.keys(updates).length > 0 || itemsToAdd.length > 0) {
        // The cart drawer/count UI in this theme is rendered by a CDN-hosted
        // bundle we can't read or hook into directly. Dispatch the common
        // event name as a best-effort signal; if the cart UI doesn't refresh
        // on its own, confirm the correct event name with theme support and
        // update this dispatch accordingly.
        document.dispatchEvent(new CustomEvent('cart:refresh', { bubbles: true }));
      }
    }
  }

  customElements.define('progressive-gifts', ProgressiveGifts);
}
