/* Renders the changelog from the data module.
 *
 * The release strings are authored by us, but they are still dynamic data and not
 * key-table entries: they are drawn from window.ASCDemo.changelog[language]. Every node
 * is built with createElement/textContent — never innerHTML — so a stray angle bracket
 * in a bullet cannot become markup. Because the text is per-language, the list has to be
 * re-rendered when the language changes, which is what the i18n.onChange hook is for.
 *
 * Load order on the page: i18n.js -> pages.js -> changelog-data.js -> changelog.js ->
 * landing.js. landing.js is what applies the language, so the first render happens here
 * at load time, and onChange takes over from there. */
;(function () {
  'use strict'

  var i18n = window.ASCDemo && window.ASCDemo.i18n

  function releasesFor(language) {
    var store = window.ASCDemo && window.ASCDemo.changelog
    if (!store || typeof store !== 'object') return null
    var pack = store[language]
    if (!Array.isArray(pack)) pack = store.en
    return Array.isArray(pack) ? pack : null
  }

  function el(tag, className, text) {
    var node = document.createElement(tag)
    if (className) node.className = className
    if (text !== undefined && text !== null && text !== '') node.textContent = String(text)
    return node
  }

  function render(language) {
    var host = document.getElementById('releases')
    if (!host) return
    var empty = document.getElementById('cl-empty')
    var releases = releasesFor(language)

    while (host.firstChild) host.removeChild(host.firstChild)

    if (!releases || releases.length === 0) {
      if (empty) empty.hidden = false
      return
    }
    if (empty) empty.hidden = true

    for (var index = 0; index < releases.length; index += 1) {
      var release = releases[index] || {}
      var article = el('article', 'cl-release')

      var head = el('div', 'cl-release-head')
      head.appendChild(el('h3', 'cl-tag', release.tag))
      var time = el('time', 'cl-date', release.date)
      if (release.date) time.setAttribute('datetime', release.date)
      head.appendChild(time)
      article.appendChild(head)

      article.appendChild(el('p', 'cl-title', release.title))

      var bullets = Array.isArray(release.bullets) ? release.bullets : []
      if (bullets.length) {
        var list = el('ul', 'cl-bullets')
        for (var bullet = 0; bullet < bullets.length; bullet += 1) {
          list.appendChild(el('li', null, bullets[bullet]))
        }
        article.appendChild(list)
      }

      host.appendChild(article)
    }
  }

  var initial = i18n && typeof i18n.resolve === 'function' ? i18n.resolve() : 'en'
  render(initial)

  if (i18n && typeof i18n.onChange === 'function') {
    i18n.onChange(function (language) { render(language) })
  }
})()
