(() => {
  const base = '_ds/praxi-app-design-system-421ea7b6-3fda-414b-a9bd-88972c75107c';
  for (const href of [base + '/styles.css', 'theme.css']) {
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = href;
    document.head.appendChild(l);
  }
  const s = document.createElement('script');
  s.src = base + '/_ds_bundle.js';
  s.onerror = () => console.error('ds-base.js: konnte ' + s.src + ' nicht laden');
  document.head.appendChild(s);
})();
