(function () {
  "use strict";

  function createResult() {
    return { isValid: true, errors: {}, summary: [] };
  }

  function addError(result, field, message, summaryMessage = message) {
    if (!result || !field || result.errors[field]) return result;
    result.isValid = false;
    result.errors[field] = message;
    result.summary.push({ field, message: summaryMessage });
    return result;
  }

  function isEmpty(value) {
    return value == null || (typeof value === "string" && !value.trim());
  }

  function required(result, field, value, message) {
    if (isEmpty(value)) addError(result, field, message || "This field is required.");
    return result;
  }

  function number(result, field, value, options = {}) {
    const label = options.label || "This value";
    if (isEmpty(value)) {
      if (options.required !== false) addError(result, field, options.requiredMessage || `Enter ${label.toLowerCase()}.`);
      return result;
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      addError(result, field, options.numberMessage || `${label} must be a number.`);
      return result;
    }
    if (options.integer && !Number.isInteger(parsed)) addError(result, field, options.integerMessage || `${label} must be a whole number.`);
    if (options.min != null && parsed < options.min) addError(result, field, options.minMessage || `${label} must be at least ${options.min}.`);
    if (options.max != null && parsed > options.max) addError(result, field, options.maxMessage || `${label} must be no more than ${options.max}.`);
    return result;
  }

  function related(result, field, condition, message, summaryMessage) {
    if (!condition) addError(result, field, message, summaryMessage);
    return result;
  }

  function collection(result, field, items, options = {}) {
    const minimum = options.min == null ? 1 : options.min;
    if (!Array.isArray(items) || items.length < minimum) {
      addError(result, field, options.message || `Add at least ${minimum} item${minimum === 1 ? "" : "s"}.`);
    }
    return result;
  }

  function merge(...results) {
    const merged = createResult();
    results.filter(Boolean).forEach(result => result.summary.forEach(item => addError(merged, item.field, result.errors[item.field], item.message)));
    return merged;
  }

  function fieldFor(root, key) {
    if (!root) return null;
    return [...root.querySelectorAll("[data-validation-key]")].find(element => element.dataset.validationKey === key) || null;
  }

  function removeDescribedBy(element, id) {
    const ids = (element.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean).filter(value => value !== id);
    if (ids.length) element.setAttribute("aria-describedby", ids.join(" "));
    else element.removeAttribute("aria-describedby");
  }

  function clearField(element) {
    if (!element) return;
    const key = element.dataset.validationKey;
    element.classList.remove("field-invalid");
    element.removeAttribute("aria-invalid");
    const errorId = element.dataset.validationErrorId;
    if (errorId) {
      const message = document.getElementById(errorId);
      if (message) message.remove();
      removeDescribedBy(element, errorId);
      delete element.dataset.validationErrorId;
    }
    const wrapper = element.closest("label, .validation-field, .exercise-editor-card, .exercise-meso-card, .day-builder, .meso-workout-card");
    if (wrapper && !wrapper.querySelector(".field-invalid")) wrapper.classList.remove("validation-invalid");
    if (key) {
      const summary = element.closest("form, dialog, .dialog-card")?.querySelector(".validation-summary");
      summary?.querySelector(`[data-summary-field="${key.replace(/"/g, "&quot;")}"]`)?.remove();
      if (summary && !summary.querySelector("li")) summary.remove();
    }
  }

  function clearKey(root, key) {
    clearField(fieldFor(root, key));
  }

  function clearAll(root) {
    if (!root) return;
    root.querySelectorAll(".field-invalid").forEach(clearField);
    root.querySelectorAll(".validation-invalid").forEach(element => element.classList.remove("validation-invalid"));
    root.querySelectorAll(".field-error, .validation-summary").forEach(element => element.remove());
  }

  function createSummary(result, title) {
    const summary = document.createElement("div");
    summary.className = "validation-summary";
    summary.setAttribute("role", "alert");
    summary.setAttribute("aria-live", "assertive");
    summary.tabIndex = -1;
    const heading = document.createElement("h3");
    heading.textContent = title || "Please fix the highlighted fields.";
    const list = document.createElement("ul");
    result.summary.forEach(item => {
      const entry = document.createElement("li");
      entry.dataset.summaryField = item.field;
      entry.textContent = item.message;
      list.appendChild(entry);
    });
    summary.append(heading, list);
    return summary;
  }

  function apply(root, result, options = {}) {
    clearAll(root);
    if (!result || result.isValid) return true;

    const summary = createSummary(result, options.summaryTitle);
    const summaryContainer = options.summaryContainer || root;
    const summaryAfter = options.summaryAfter || summaryContainer.querySelector?.(".dialog-header");
    if (summaryAfter) summaryAfter.insertAdjacentElement("afterend", summary);
    else summaryContainer.prepend(summary);

    let firstField = null;
    result.summary.forEach((item, index) => {
      const field = (options.resolveField && options.resolveField(item.field)) || fieldFor(root, item.field);
      if (!field) return;
      if (!firstField) firstField = field;
      const errorId = `validation-error-${Date.now()}-${index}`;
      const message = document.createElement("p");
      message.className = "field-error";
      message.id = errorId;
      message.textContent = result.errors[item.field];
      field.classList.add("field-invalid");
      field.setAttribute("aria-invalid", "true");
      field.dataset.validationErrorId = errorId;
      const describedBy = new Set((field.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean));
      describedBy.add(errorId);
      field.setAttribute("aria-describedby", [...describedBy].join(" "));
      const wrapper = field.closest("label, .validation-field, .exercise-editor-card, .exercise-meso-card, .day-builder, .meso-workout-card");
      wrapper?.classList.add("validation-invalid");
      field.insertAdjacentElement("afterend", message);
    });

    if (firstField) {
      if (!firstField.matches("input, select, textarea, button, [tabindex]")) firstField.tabIndex = -1;
      firstField.scrollIntoView({ behavior: options.scrollBehavior || "smooth", block: "center", inline: "nearest" });
      window.setTimeout(() => firstField.focus({ preventScroll: true }), options.focusDelay == null ? 250 : options.focusDelay);
    } else {
      summary.focus({ preventScroll: false });
    }
    return false;
  }

  function bindLiveClear(root, options = {}) {
    if (!root || root.dataset.validationLiveClearBound === "true") return;
    root.dataset.validationLiveClearBound = "true";
    const handle = event => {
      const field = event.target.closest?.("[data-validation-key]");
      if (!field || !root.contains(field)) return;
      if (options.isCorrected && !options.isCorrected(field, event)) return;
      clearField(field);
      (field.dataset.validationClears || "").split(/\s+/).filter(Boolean).forEach(key => {
        const relatedField = fieldFor(root, key);
        if (!options.isCorrected || !relatedField || options.isCorrected(relatedField, event)) clearField(relatedField);
      });
    };
    root.addEventListener("input", handle);
    root.addEventListener("change", handle);
  }

  function setKey(element, key, clears = []) {
    if (!element) return element;
    element.dataset.validationKey = key;
    if (clears.length) element.dataset.validationClears = clears.join(" ");
    return element;
  }

  window.FormValidation = {
    createResult,
    addError,
    required,
    number,
    related,
    collection,
    merge,
    apply,
    clearAll,
    clearField,
    clearKey,
    bindLiveClear,
    setKey
  };
})();
