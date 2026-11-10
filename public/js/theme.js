// Applied before first paint to avoid a theme flash.
(function () {
  try {
    var t = localStorage.getItem('vd-theme');
    if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  } catch (e) { /* storage unavailable */ }
})();
