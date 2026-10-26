(function () {
  if (!window.mermaid) return;

  window.mermaid.initialize({ startOnLoad: false });

  function renderMermaid() {
    const diagrams = Array.from(
      document.querySelectorAll('.mermaid:not([data-processed])')
    );

    diagrams.forEach((diagram) => {
      const code = diagram.querySelector(':scope > code');
      if (code) {
        diagram.textContent = code.textContent;
      }
    });

    if (diagrams.length) {
      window.mermaid.run({ nodes: diagrams });
    }
  }

  if (typeof document$ !== 'undefined') {
    document$.subscribe(renderMermaid);
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderMermaid, { once: true });
  } else {
    renderMermaid();
  }
}());
