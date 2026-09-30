import webpush from 'npm:web-push@3.6.7'

export function validEndpoint(endpoint: string) {
  try {
    const url = new URL(endpoint)
    return endpoint.length <= 4096 && url.protocol === 'https:' && !url.username && !url.password && (!url.port || url.port === '443') && (
      url.hostname === 'fcm.googleapis.com' ||
      url.hostname === 'updates.push.services.mozilla.com' ||
      url.hostname.endsWith('.push.apple.com') ||
      url.hostname.endsWith('.notify.windows.com')
    )
  } catch { return false }
}

export async function ensureKeys(sql: any, prefix: string) {
  return sql.begin(async (tx: any) => {
    await tx`select pg_advisory_xact_lock(hashtext(${prefix}))`
    const rows = await tx`select name, decrypted_secret from vault.decrypted_secrets where name in (${prefix + '_vapid_public'}, ${prefix + '_vapid_private'})`
    let publicKey = rows.find((r: any) => r.name === prefix + '_vapid_public')?.decrypted_secret
    let privateKey = rows.find((r: any) => r.name === prefix + '_vapid_private')?.decrypted_secret
    if (!publicKey && !privateKey) {
      const keys = webpush.generateVAPIDKeys()
      publicKey = keys.publicKey
      privateKey = keys.privateKey
      await tx`select vault.create_secret(${publicKey}, ${prefix + '_vapid_public'})`
      await tx`select vault.create_secret(${privateKey}, ${prefix + '_vapid_private'})`
    }
    if (!publicKey || !privateKey) throw new Error('Push configuration is incomplete.')
    return { publicKey, privateKey }
  })
}

export async function deliver(admin: any, table: string, sub: any, payload: any) {
  if (!validEndpoint(sub.endpoint)) {
    await admin.from(table).delete().eq('id', sub.id)
    return false
  }
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), { TTL: 3600, timeout: 10000 })
    return true
  } catch (error: any) {
    if (error.statusCode === 404 || error.statusCode === 410) {
      await admin.from(table).delete().eq('id', sub.id)
      return false
    }
    throw error
  }
}

export async function handleSubscription(req: Request, admin: any, sql: any, prefix: string, table: string, cors: Record<string, string>, fixedApp?: string) {
  const respond = (data: any, status = 200) => Response.json(data, { status, headers: cors })
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return respond({ error: 'Unauthorized' }, 401)
  const { data: { user }, error } = await admin.auth.getUser(token)
  if (error || !user) return respond({ error: 'Unauthorized' }, 401)
  const input = req.method === 'POST' ? await req.json() : {}
  const app = fixedApp || input.app
  if (!(fixedApp ? [fixedApp] : ['core', 'nexus']).includes(app)) return respond({ error: 'Invalid app' }, 400)
  const action = input.action || new URL(req.url).searchParams.get('action') || 'config'
  if (app === 'core' && !['status', 'unsubscribe'].includes(action) && !['owner', 'admin'].includes(String(user.app_metadata?.role || '').toLowerCase())) return respond({ error: 'Forbidden' }, 403)
  if (action === 'config') {
    const { publicKey } = await ensureKeys(sql, prefix)
    return respond({ publicKey })
  }
  if (!['status', 'subscribe', 'unsubscribe', 'test'].includes(action)) return respond({ error: 'Invalid action' }, 400)
  const subscription = input.subscription
  if (!subscription || typeof subscription.endpoint !== 'string' || !validEndpoint(subscription.endpoint)) return respond({ error: 'Invalid push endpoint' }, 400)
  const endpoint = subscription.endpoint
  const find = () => {
    let query = admin.from(table).select('*').eq('endpoint', endpoint).eq('user_id', user.id)
    if (!fixedApp) query = query.eq('app', app)
    return query.maybeSingle()
  }
  const { data: existing, error: lookupError } = await find()
  if (lookupError) throw lookupError
  if (action === 'status') return respond({ enabled: Boolean(existing) })
  if (action === 'unsubscribe') {
    if (existing) {
      const { error } = await admin.from(table).delete().eq('id', existing.id).eq('user_id', user.id)
      if (error) throw error
    }
    return respond({ success: true })
  }
  if (action === 'subscribe') {
    const keys = subscription.keys
    const keySize = (key: unknown) => {
      if (typeof key !== 'string' || !/^[A-Za-z0-9_-]+$/.test(key)) return 0
      try { return atob(key.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - key.length % 4) % 4)).length } catch { return 0 }
    }
    if (keySize(keys?.p256dh) !== 65 || keySize(keys?.auth) !== 16) return respond({ error: 'Invalid subscription keys' }, 400)
    const row = { user_id: user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth, updated_at: new Date().toISOString(), ...(fixedApp ? {} : { app }) }
    // One endpoint belongs to one signed-in account, even on a shared device.
    let stale = admin.from(table).delete().eq('endpoint', endpoint).neq('user_id', user.id)
    if (!fixedApp) stale = stale.eq('app', app)
    const { error: deleteError } = await stale
    if (deleteError) throw deleteError
    const { error } = await admin.from(table).upsert(row, { onConflict: fixedApp ? 'user_id,endpoint' : 'app,endpoint' })
    if (error) throw error
    if (fixedApp) {
      const { error: prefsError } = await admin.from('notification_preferences').upsert({ user_id: user.id }, { onConflict: 'user_id', ignoreDuplicates: true })
      if (prefsError) throw prefsError
    }
    return respond({ success: true })
  }
  if (!existing) return respond({ error: 'Enable notifications on this device first.' }, 400)
  // Atomically limit tests to one per minute per device.
  const cutoff = new Date(Date.now() - 60000).toISOString()
  const { data: claimed, error: claimError } = await admin.from(table).update({ last_test_at: new Date().toISOString() }).eq('id', existing.id).or(`last_test_at.is.null,last_test_at.lt.${cutoff}`).select('id')
  if (claimError) throw claimError
  if (!claimed?.length) return respond({ error: 'Wait a minute before sending another test.' }, 429)
  const { publicKey, privateKey } = await ensureKeys(sql, prefix)
  webpush.setVapidDetails('mailto:notifications@sciencebyhugs.com', publicKey, privateKey)
  const sent = await deliver(admin, table, existing, { title: app.toUpperCase(), body: 'Push notifications are working on this device.', tag: 'push-test', url: './' })
  return respond({ sent })
}
