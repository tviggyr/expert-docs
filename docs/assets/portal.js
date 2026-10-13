(function () {
  const storagePrefix = 'expert24:docs-tree:v3:';
  function getStorage() {
    try { return window.localStorage; } catch (error) { return null; }
  }
  function stateKey(branch) {
    return storagePrefix + branch.dataset.treeId;
  }
  function savedState(storage, branch) {
    try {
      const value = storage.getItem(stateKey(branch));
      return value === 'true' ? true : value === 'false' ? false : null;
    } catch (error) { return null; }
  }
  function persistState(storage, branch) {
    if (!storage) return;
    try {
      storage.setItem(stateKey(branch), branch.open ? 'true' : 'false');
    } catch (error) { /* Storage can be disabled by browser policy. */ }
  }
  function restoreTree(tree, storage) {
    const restored = new Map();
    tree.querySelectorAll('details[data-tree-id]').forEach((branch) => {
      const isOpen = storage ? savedState(storage, branch) : null;
      if (isOpen !== null) {
        if (branch.open !== isOpen) {
          restored.set(branch.dataset.treeId, isOpen);
          branch.open = isOpen;
        }
      }
      if (storage) {
        branch.addEventListener('toggle', () => {
          if (restored.get(branch.dataset.treeId) === branch.open) {
            restored.delete(branch.dataset.treeId);
            return;
          }
          restored.delete(branch.dataset.treeId);
          persistState(storage, branch);
        });
      }
    });
  }
  function configureModuleToggle(tree, storage) {
    if (tree.dataset.treeScope !== 'home') return;
    const button = document.querySelector('[data-tree-action="toggle-modules"]');
    const modules = Array.from(tree.querySelectorAll('details[data-tree-level="module"]'));
    if (!button || !modules.length) return;
    const label = button.querySelector('span');
    const updateLabel = () => {
      const action = modules.every((module) => module.open) ? 'Згорнути все' : 'Розгорнути все';
      if (label) label.textContent = action;
      button.setAttribute('aria-label', action);
    };
    modules.forEach((module) => module.addEventListener('toggle', updateLabel));
    button.addEventListener('click', () => {
      const shouldOpen = modules.some((module) => !module.open);
      modules.forEach((module) => {
        if (module.open === shouldOpen) return;
        module.open = shouldOpen;
        persistState(storage, module);
      });
      updateLabel();
    });
    updateLabel();
  }
  function initializeTrees() {
    const storage = getStorage();
    document.querySelectorAll('.expert-docs-tree[data-tree-scope]').forEach((tree) => {
      restoreTree(tree, storage);
      configureModuleToggle(tree, storage);
    });
  }
  if (document.querySelector('.expert-docs-tree[data-tree-scope]')) {
    initializeTrees();
  } else {
    document.addEventListener('DOMContentLoaded', initializeTrees, { once: true });
  }
  document.addEventListener('click', function (event) {
    const module = event.target.closest('.expert-docs-tree__module');
    if (module) {
      event.preventDefault();
      event.stopPropagation();
      window.location.assign(module.href);
      return;
    }
    const image = event.target.closest('.md-content img');
    if (!image) return;
    event.preventDefault();
    const dialog = document.createElement('dialog');
    dialog.className = 'portal-lightbox';
    const preview = image.cloneNode();
    preview.removeAttribute('width');
    preview.removeAttribute('height');
    dialog.append(preview);
    dialog.addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => dialog.remove());
    document.body.append(dialog);
    dialog.showModal();
  });
})();
