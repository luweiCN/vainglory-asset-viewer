let openSelect = null;
let nextId = 0;

function stopEvent(event) {
  event.preventDefault();
  event.stopPropagation();
}

function visibleOptions(select) {
  return [...select.options].filter((option) => !option.hidden);
}

export function createSelectMenu(select) {
  const id = `ui-select-${nextId++}`;
  const root = document.createElement("div");
  root.className = "ui-select";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "ui-select-button";
  button.setAttribute("aria-haspopup", "listbox");
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-controls", `${id}-menu`);
  const value = document.createElement("span");
  value.className = "ui-select-value";
  const icon = document.createElement("span");
  icon.className = "ui-select-icon";
  icon.setAttribute("aria-hidden", "true");
  const menu = document.createElement("div");
  menu.id = `${id}-menu`;
  menu.className = "ui-select-menu";
  menu.setAttribute("role", "listbox");
  menu.hidden = true;
  button.append(value, icon);
  root.append(button);
  select.classList.add("native-select");
  select.after(root);
  const dialogHost = select.closest("dialog");
  const menuHost = dialogHost || document.body;
  if (dialogHost) menu.classList.add("ui-select-menu-dialog");
  menuHost.append(menu);

  function removeFloatingListeners() {
    window.removeEventListener("resize", placeMenu);
    document.removeEventListener("scroll", placeMenu, true);
  }

  function resetMenuPosition() {
    menu.style.removeProperty("position");
    menu.style.removeProperty("top");
    menu.style.removeProperty("right");
    menu.style.removeProperty("bottom");
    menu.style.removeProperty("left");
    menu.style.removeProperty("width");
    menu.style.removeProperty("max-height");
    menu.removeAttribute("data-placement");
  }

  function placeMenu() {
    if (menu.hidden) return;
    const margin = 8;
    const rect = button.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - margin;
    const spaceAbove = rect.top - margin;
    const openUp = spaceBelow < 220 && spaceAbove > spaceBelow;
    const available = Math.max(160, Math.min(340, (openUp ? spaceAbove : spaceBelow) - margin));
    menu.style.position = "fixed";
    menu.style.left = `${Math.round(rect.left)}px`;
    menu.style.width = `${Math.round(rect.width)}px`;
    menu.style.maxHeight = `${Math.round(available)}px`;
    menu.style.right = "auto";
    menu.style.bottom = "auto";
    if (openUp) {
      menu.style.top = `${Math.max(margin, Math.round(rect.top - available - margin))}px`;
      menu.dataset.placement = "top";
    } else {
      menu.style.top = `${Math.round(rect.bottom + margin)}px`;
      menu.dataset.placement = "bottom";
    }
  }

  function selectedOption() {
    return select.selectedOptions[0] || visibleOptions(select)[0] || null;
  }

  function close() {
    menu.hidden = true;
    button.setAttribute("aria-expanded", "false");
    root.classList.remove("is-open");
    removeFloatingListeners();
    resetMenuPosition();
    if (openSelect === close) openSelect = null;
  }

  function choose(option) {
    if (option.disabled) return;
    select.value = option.value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    close();
    button.focus();
  }

  function optionButtons() {
    return [...menu.querySelectorAll(".ui-select-option:not(:disabled)")];
  }

  function focusOption(delta) {
    const options = optionButtons();
    if (!options.length) return;
    const current = options.indexOf(document.activeElement);
    const next = current < 0 ? 0 : (current + delta + options.length) % options.length;
    options[next].focus();
  }

  function renderMenu() {
    const selected = selectedOption();
    menu.replaceChildren(
      ...visibleOptions(select).map((option) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "ui-select-option";
        item.setAttribute("role", "option");
        item.setAttribute("aria-selected", String(option === selected));
        item.disabled = option.disabled;
        const label = document.createElement("span");
        label.className = "ui-select-option-label";
        label.textContent = option.textContent || option.value;
        item.append(label);
        if (option.dataset.description) {
          const description = document.createElement("span");
          description.className = "ui-select-option-description";
          description.textContent = option.dataset.description;
          item.append(description);
        }
        item.addEventListener("click", (event) => {
          stopEvent(event);
          choose(option);
        });
        item.addEventListener("keydown", (event) => {
          if (event.key === "ArrowDown") {
            stopEvent(event);
            focusOption(1);
          } else if (event.key === "ArrowUp") {
            stopEvent(event);
            focusOption(-1);
          } else if (event.key === "Home") {
            stopEvent(event);
            optionButtons()[0]?.focus();
          } else if (event.key === "End") {
            stopEvent(event);
            const options = optionButtons();
            options[options.length - 1]?.focus();
          } else if (event.key === "Enter" || event.key === " ") {
            stopEvent(event);
            choose(option);
          } else if (event.key === "Escape") {
            stopEvent(event);
            close();
            button.focus();
          }
        });
        return item;
      }),
    );
  }

  function refresh() {
    const selected = selectedOption();
    value.textContent = selected?.textContent || "未选择";
    button.disabled = select.disabled;
    root.classList.toggle("is-disabled", select.disabled);
    renderMenu();
  }

  function open() {
    if (select.disabled) return;
    if (openSelect && openSelect !== close) openSelect();
    refresh();
    menu.hidden = false;
    button.setAttribute("aria-expanded", "true");
    root.classList.add("is-open");
    openSelect = close;
    placeMenu();
    window.addEventListener("resize", placeMenu);
    document.addEventListener("scroll", placeMenu, true);
    const active = menu.querySelector('[aria-selected="true"]') || menu.querySelector(".ui-select-option:not(:disabled)");
    active?.scrollIntoView({ block: "nearest" });
  }

  button.addEventListener("click", (event) => {
    stopEvent(event);
    if (menu.hidden) open();
    else close();
  });
  button.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      stopEvent(event);
      open();
      const active = menu.querySelector('[aria-selected="true"]:not(:disabled)') || menu.querySelector(".ui-select-option:not(:disabled)");
      active?.focus();
    } else if (event.key === "ArrowUp") {
      stopEvent(event);
      open();
      const options = optionButtons();
      options[options.length - 1]?.focus();
    } else if (event.key === "Escape") {
      close();
    }
  });
  select.addEventListener("change", refresh);
  refresh();

  return { close, refresh };
}

export function createCombobox({ input, popup, triggerButton, clearButton, onQueryChange, onSelect, onClear, itemLabel, itemMeta }) {
  let items = [];
  let activeIndex = -1;

  function close() {
    popup.hidden = true;
    input.setAttribute("aria-expanded", "false");
    triggerButton?.setAttribute("aria-expanded", "false");
    activeIndex = -1;
  }

  function open() {
    popup.hidden = false;
    input.setAttribute("aria-expanded", "true");
    triggerButton?.setAttribute("aria-expanded", "true");
  }

  function render(nextItems = items) {
    items = nextItems;
    popup.replaceChildren();
    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "combo-empty";
      empty.textContent = "没有匹配的英雄";
      popup.appendChild(empty);
      return;
    }

    items.forEach((item, index) => {
      const option = document.createElement("button");
      option.type = "button";
      option.className = "combo-option";
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", String(index === activeIndex));
      const title = document.createElement("span");
      title.className = "combo-option-title";
      title.textContent = itemLabel(item);
      const meta = document.createElement("span");
      meta.className = "combo-option-meta";
      meta.textContent = itemMeta(item);
      option.append(title, meta);
      option.addEventListener("mousedown", (event) => event.preventDefault());
      option.addEventListener("click", (event) => {
        stopEvent(event);
        onSelect(item);
        close();
      });
      popup.appendChild(option);
    });
  }

  function setItems(nextItems) {
    activeIndex = Math.min(activeIndex, nextItems.length - 1);
    render(nextItems);
  }

  function moveActive(delta) {
    if (!items.length) return;
    activeIndex = (activeIndex + delta + items.length) % items.length;
    render(items);
    popup.children[activeIndex]?.scrollIntoView({ block: "nearest" });
  }

  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-expanded", "false");
  input.setAttribute("aria-controls", popup.id);
  triggerButton?.setAttribute("aria-haspopup", "listbox");
  triggerButton?.setAttribute("aria-expanded", "false");
  triggerButton?.setAttribute("aria-controls", popup.id);
  input.addEventListener("focus", () => {
    setItems(onQueryChange(input.value));
    open();
  });
  input.addEventListener("input", () => {
    activeIndex = -1;
    setItems(onQueryChange(input.value));
    open();
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      stopEvent(event);
      if (popup.hidden) open();
      moveActive(1);
    } else if (event.key === "ArrowUp") {
      stopEvent(event);
      if (popup.hidden) open();
      moveActive(-1);
    } else if (event.key === "Enter" && activeIndex >= 0) {
      stopEvent(event);
      onSelect(items[activeIndex]);
      close();
    } else if (event.key === "Escape") {
      close();
    }
  });
  triggerButton?.addEventListener("click", (event) => {
    stopEvent(event);
    if (popup.hidden) {
      setItems(onQueryChange(input.value));
      open();
      input.focus();
    } else {
      close();
      input.focus();
    }
  });
  clearButton?.addEventListener("click", (event) => {
    stopEvent(event);
    input.value = "";
    activeIndex = -1;
    setItems(onClear());
    input.focus();
    open();
  });

  document.addEventListener("click", (event) => {
    if (
      popup.contains(event.target) ||
      input.contains(event.target) ||
      triggerButton?.contains(event.target) ||
      clearButton?.contains(event.target)
    ) {
      return;
    }
    close();
  });

  return { close, open, setItems };
}

document.addEventListener("click", (event) => {
  if (event.target.closest(".ui-select")) return;
  if (openSelect) openSelect();
});
