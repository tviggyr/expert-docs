(function () {
  const storagePrefix = 'expert24:docs-tree:v1:';
  function getStorage() {
    try { return window.localStorage; } catch (error) { return null; }
  }
  function restoreTree(tree, storage) {
    const saved = storage ? (() => {
      try {
        const value = JSON.parse(storage.getItem(storagePrefix + tree.dataset.treeScope) || '{}');
        return value && typeof value === 'object' ? value : {};
      } catch (error) { return {}; }
    })() : {};
    tree.querySelectorAll('details[data-tree-id]').forEach((branch) => {
      if (Object.prototype.hasOwnProperty.call(saved, branch.dataset.treeId)) {
        branch.open = saved[branch.dataset.treeId];
      }
      if (storage) {
        branch.addEventListener('toggle', () => {
          try {
            const key = storagePrefix + tree.dataset.treeScope;
            const state = JSON.parse(storage.getItem(key) || '{}');
            const next = state && typeof state === 'object' ? state : {};
            next[branch.dataset.treeId] = branch.open;
            storage.setItem(key, JSON.stringify(next));
          } catch (error) { /* Storage can be disabled by browser policy. */ }
        });
      }
    });
  }
  function initializeTrees() {
    const storage = getStorage();
    document.querySelectorAll('.expert-docs-tree[data-tree-scope]').forEach((tree) => restoreTree(tree, storage));
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
