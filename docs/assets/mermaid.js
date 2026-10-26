(function () {
  if (!window.mermaid) return;

  window.mermaid.initialize({ startOnLoad: false });

  function renderMermaid() {
    window.mermaid.run({ querySelector: '.mermaid' });
  }

  if (typeof document$ !== 'undefined') {
    document$.subscribe(renderMermaid);
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderMermaid, { once: true });
  } else {
    renderMermaid();
  }
}());
