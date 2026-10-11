/* Landing page bootstrap. The simulator page gets its language wiring from app.js;
   the landing carries no app script, so it applies the resolved language and wires
   the two language buttons itself. Lives in an external file because the site is
   served with CSP script-src 'self', which forbids inline scripts. */
;(function () {
  'use strict'
  var i18n = window.ASCDemo.i18n
  i18n.apply(i18n.resolve())
  var buttons = document.querySelectorAll('.lang-btn')
  for (var index = 0; index < buttons.length; index += 1) {
    buttons[index].addEventListener('click', function (event) {
      i18n.switchTo(event.currentTarget.getAttribute('data-lang'))
    })
  }
})()
