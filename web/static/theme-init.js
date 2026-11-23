// Runs before first paint (CSP allows scripts from 'self' only): applies the stored theme so there is no flash.
try {
  var t = localStorage.getItem('zview.theme');
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
} catch {
  // Storage blocked: follow the system.
}
