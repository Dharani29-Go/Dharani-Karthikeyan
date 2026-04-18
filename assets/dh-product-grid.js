/**
 * ============================================================
 * dh-product-grid.js
 * Handles all popup + cart logic for the Product Grid section.
 *
 * Features:
 *   1. Open/close product popup on hotspot click
 *   2. Render variant selectors dynamically from product data
 *      — Color → inline toggle buttons
 *      — Size  → styled <select> dropdown
 *   3. Add to Cart via Shopify AJAX Cart API (/cart/add.js)
 *   4. Auto-add "Soft Winter Jacket" when Black + Medium chosen
 *   5. Keyboard (Escape) + backdrop click to close
 *
 * Rules: Vanilla JavaScript ONLY — zero jQuery
 * Author: Dharani Karthikeyan
 * ============================================================
 */

(function () {
  'use strict';

  /* ── Soft Winter Jacket handle (from imported CSV) ── */
  var JACKET_HANDLE = 'dark-winter-jacket';

  /* ── DOM refs ── */
  var overlay  = document.getElementById('dhPopupOverlay');
  var closeBtn = document.getElementById('dhPopupClose');
  var imgEl    = document.getElementById('dhPopupImg');
  var titleEl  = document.getElementById('dhPopupTitle');
  var priceEl  = document.getElementById('dhPopupPrice');
  var descEl   = document.getElementById('dhPopupDesc');
  var varEl    = document.getElementById('dhPopupVariants');
  var atcBtn   = document.getElementById('dhPopupATC');
  var statusEl = document.getElementById('dhPopupStatus');

  /* ── State ── */
  var currentVariants = [];  // Shopify variant objects
  var currentOptions  = [];  // [{name, values[]}]
  var selectedValues  = {};  // { 'Color': 'Black', 'Size': 'M' }

  /* ============================================================
     1. OPEN / CLOSE
     ============================================================ */

  /**
   * Populate popup with product data and show it.
   * @param {HTMLButtonElement} btn — the clicked hotspot
   */
  function openPopup(btn) {
    /* Parse product data from data-attributes */
    try {
      currentVariants = JSON.parse(btn.dataset.productVariants);
      currentOptions  = JSON.parse(btn.dataset.productOptions);
    } catch (e) {
      currentVariants = [];
      currentOptions  = [];
      console.error('[DH Grid] Failed to parse product data:', e);
    }

    selectedValues = {};

    /* Fill static fields */
    imgEl.src             = btn.dataset.productImage  || '';
    imgEl.alt             = btn.dataset.productTitle  || '';
    titleEl.textContent   = btn.dataset.productTitle  || '';
    priceEl.textContent   = btn.dataset.productPrice  || '';
    descEl.textContent    = btn.dataset.productDescription || '';

    /* Build variant UI */
    renderVariants();

    /* Clear any previous status */
    setStatus('', '');

    /* Show overlay */
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');

    /* Trap focus on close button */
    closeBtn.focus();

    /* Prevent background scroll */
    document.body.style.overflow = 'hidden';
  }

  /** Hide popup and restore page scroll. */
  function closePopup() {
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  /* ── Close triggers ── */
  closeBtn.addEventListener('click', closePopup);

  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) closePopup();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && overlay.classList.contains('is-open')) closePopup();
  });

  /* ── Hotspot click — delegated to document body ── */
  document.addEventListener('click', function (e) {
    var hotspot = e.target.closest('.dh-grid__hotspot');
    if (hotspot) {
      e.stopPropagation();
      openPopup(hotspot);
    }
  });

  /* ============================================================
     2. RENDER VARIANT SELECTORS
     ============================================================ */

  /**
   * Builds the variant selector UI inside the popup.
   * Rule:
   *   index 0 (usually "Color") → inline toggle buttons
   *   index 1+ (usually "Size") → styled <select> dropdown
   */
  function renderVariants() {
    varEl.innerHTML = '';

    if (!currentOptions || !currentOptions.length) return;

    currentOptions.forEach(function (option, idx) {
      var group = document.createElement('div');
      group.className = 'dh-popup__option-group';

      /* Label */
      var label = document.createElement('span');
      label.className   = 'dh-popup__option-label';
      label.textContent = option.name;
      group.appendChild(label);

      if (idx === 0) {
        /* ── Color: inline toggle buttons ── */
        var colorWrap = document.createElement('div');
        colorWrap.className = 'dh-popup__color-options';

        option.values.forEach(function (val) {
          var btn = document.createElement('button');
          btn.className   = 'dh-popup__color-btn';
          btn.textContent = val;
          btn.setAttribute('type', 'button');

          btn.addEventListener('click', function () {
            /* Deactivate siblings */
            colorWrap.querySelectorAll('.dh-popup__color-btn').forEach(function (b) {
              b.classList.remove('is-active');
            });
            btn.classList.add('is-active');
            selectedValues[option.name] = val;
          });

          colorWrap.appendChild(btn);
        });

        group.appendChild(colorWrap);

      } else {
        /* ── Size/other: dropdown ── */
        var select = document.createElement('select');
        select.className = 'dh-popup__size-select';
        select.setAttribute('aria-label', option.name);

        /* Placeholder */
        var placeholder = document.createElement('option');
        placeholder.value    = '';
        placeholder.textContent = 'Choose your ' + option.name.toLowerCase();
        placeholder.disabled = true;
        placeholder.selected = true;
        select.appendChild(placeholder);

        option.values.forEach(function (val) {
          var opt = document.createElement('option');
          opt.value       = val;
          opt.textContent = val;
          select.appendChild(opt);
        });

        select.addEventListener('change', function () {
          selectedValues[option.name] = select.value;
        });

        group.appendChild(select);
      }

      varEl.appendChild(group);
    });
  }

  /* ============================================================
     3. FIND MATCHING VARIANT
     ============================================================ */

  /**
   * Returns the Shopify variant whose option values match
   * every currently selected value, or null if none.
   */
  function findMatchingVariant() {
    if (!currentVariants.length) return null;

    return currentVariants.find(function (variant) {
      return currentOptions.every(function (option, idx) {
        var chosen = selectedValues[option.name];
        if (!chosen) return false;
        /* Shopify: option1, option2, option3 */
        return variant['option' + (idx + 1)] === chosen;
      });
    }) || null;
  }

  /* ============================================================
     4. CART API HELPERS
     ============================================================ */

  /**
   * POST one item to the Shopify cart.
   * @param {number} variantId
   * @param {number} qty
   * @returns {Promise}
   */
  function addToCart(variantId, qty) {
    return fetch('/cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: variantId, quantity: qty })
    }).then(function (res) {
      if (!res.ok) {
        return res.json().then(function (data) {
          throw new Error(data.description || 'Unable to add to cart.');
        });
      }
      return res.json();
    });
  }

  /**
   * Fetch the Soft Winter Jacket product and return the first
   * available variant id (so we can auto-add it).
   * @returns {Promise<number|null>}
   */
  function fetchJacketVariantId() {
    return fetch('/products/' + JACKET_HANDLE + '.js')
      .then(function (res) {
        if (!res.ok) throw new Error('Soft Winter Jacket not found.');
        return res.json();
      })
      .then(function (product) {
        var available = product.variants.find(function (v) { return v.available; });
        return available
          ? available.id
          : (product.variants[0] ? product.variants[0].id : null);
      });
  }

  /**
   * Returns true when the selection qualifies for the auto-add rule:
   * Color = Black AND Size = Medium
   */
  function shouldAutoAdd() {
    return (
      (selectedValues['Color'] || '').toLowerCase() === 'black' &&
      (selectedValues['Size']  || '').toLowerCase() === 'medium'
    );
  }

  /* ============================================================
     5. ADD TO CART CLICK HANDLER
     ============================================================ */

  atcBtn.addEventListener('click', function () {
    setStatus('', '');

    /* Validate: all options must be selected */
    var allPicked = currentOptions.every(function (opt) {
      return !!selectedValues[opt.name];
    });

    if (!allPicked) {
      setStatus('Please select all options before adding to cart.', 'is-error');
      return;
    }

    var variant = findMatchingVariant();

    if (!variant) {
      setStatus('This combination is unavailable.', 'is-error');
      return;
    }

    if (variant.available === false) {
      setStatus('Sorry, this variant is out of stock.', 'is-error');
      return;
    }

    /* Loading state */
    atcBtn.classList.add('is-loading');
    setStatus('Adding…', '');

    /* Build array of cart additions */
    var addJacket = shouldAutoAdd();
    var tasks = [addToCart(variant.id, 1)];

    if (addJacket) {
      tasks.push(
        fetchJacketVariantId().then(function (jacketId) {
          if (jacketId) return addToCart(jacketId, 1);
        })
      );
    }

    Promise.all(tasks)
      .then(function () {
        atcBtn.classList.remove('is-loading');
        var msg = 'Added to cart!';
        if (addJacket) msg += ' Soft Winter Jacket also added.';
        setStatus(msg, 'is-success');
        setTimeout(closePopup, 1800);
      })
      .catch(function (err) {
        atcBtn.classList.remove('is-loading');
        setStatus(err.message || 'Something went wrong. Please try again.', 'is-error');
      });
  });

  /* ============================================================
     6. UTILITY
     ============================================================ */

  /**
   * Update the status paragraph.
   * @param {string} msg
   * @param {string} cls — 'is-success' | 'is-error' | ''
   */
  function setStatus(msg, cls) {
    statusEl.textContent = msg;
    statusEl.className   = 'dh-popup__status' + (cls ? ' ' + cls : '');
  }

}()); /* end IIFE */
