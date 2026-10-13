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
          try {
            storage.setItem(stateKey(branch), branch.open ? 'true' : 'false');
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
