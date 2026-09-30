self.addEventListener('push', function (event) {
  var payload = {}
  try { payload = event.data ? event.data.json() : {} } catch (_) {}
  var base = self.registration.scope
  var target = new URL(payload.url || './', base)
  if (target.origin !== self.location.origin || !target.pathname.startsWith(new URL(base).pathname)) target = new URL(base)
  event.waitUntil(self.registration.showNotification(payload.title || 'NEXUS', {
    body: payload.body || 'You have a new update.',
    tag: payload.tag || 'nexus',
    icon: new URL('brand/nexus-app-icon.svg', base).href,
    data: { url: target.href },
  }))
})

self.addEventListener('notificationclick', function (event) {
  event.notification.close()
  var target = new URL(event.notification.data?.url || './', self.registration.scope)
  if (target.origin !== self.location.origin || !target.pathname.startsWith(new URL(self.registration.scope).pathname)) target = new URL(self.registration.scope)
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async function (clients) {
    var client = clients.find(function (c) { return c.url.startsWith(self.registration.scope) })
    if (client) {
      if (client.navigate) await client.navigate(target.href)
      return client.focus()
    }
    return self.clients.openWindow(target.href)
  }))
})
