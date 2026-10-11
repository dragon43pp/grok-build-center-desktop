/* Fullscreen wiring for the landing page's hero video.
 *
 * The site is served with CSP script-src 'self', so there is no inline handler here
 * and no inline script on the page. The hero's fullscreen button requests fullscreen
 * on the <video> itself; if the Fullscreen API is missing, or the request rejects, the
 * file is opened in a new tab instead. It must never leave an uncaught error behind, so
 * every path is wrapped.
 *
 * Loaded on index.html after landing.js (which applies the language). */
;(function () {
  'use strict'

  var FALLBACK_SRC = './assets/demo.mp4'

  function openInNewTab(src) {
    try {
      var win = window.open(src, '_blank', 'noopener')
      if (win) win.opener = null
    } catch (error) {
      /* Popup blocked or a sandboxed frame: there is nothing left to try, and
         nothing worth logging — the button simply did not change the view. */
    }
  }

  function requestFullscreen(video) {
    return video.requestFullscreen ||
      video.webkitRequestFullscreen ||
      video.webkitEnterFullscreen ||
      video.msRequestFullscreen
  }

  function wire() {
    var button = document.querySelector('.lp-hero-full')
    var video = document.querySelector('.lp-hero-shot video')
    if (!button || !video) return

    button.addEventListener('click', function () {
      var request = requestFullscreen(video)
      if (typeof request !== 'function') {
        openInNewTab(FALLBACK_SRC)
        return
      }
      try {
        var result = request.call(video)
        if (result && typeof result.then === 'function') {
          result.catch(function () { openInNewTab(FALLBACK_SRC) })
        }
      } catch (error) {
        openInNewTab(FALLBACK_SRC)
      }
    })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire)
  } else {
    wire()
  }
})()
