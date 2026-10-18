/* Authorization codes (never access tokens) are delivered only to our own opener. */
(() => {
  const params = new URLSearchParams(location.search)
  const message = {type:'respite-calendar-code',code:params.get('code'),state:params.get('state'),error:params.get('error')}
  history.replaceState(null,'',location.pathname)
  if (window.opener) { window.opener.postMessage(message,location.origin); window.close() }
})()
