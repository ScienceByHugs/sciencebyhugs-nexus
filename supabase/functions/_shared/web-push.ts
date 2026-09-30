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

async function removeSubscription(admin: any, table: string, id: string, sql?: any) {
  if (!sql) { await admin.from(table).delete().eq('id', id); return }
  if (table === 'push_subscriptions') await sql`delete from public.push_subscriptions where id=${id}`
  else await sql`delete from public.app_push_subscriptions where id=${id}`
}

export async function deliver(admin: any, table: string, sub: any, payload: any, sql?: any) {
  if (!validEndpoint(sub.endpoint)) {
    await removeSubscription(admin, table, sub.id, sql)
    return false
  }
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), { TTL: 3600, timeout: 10000 })
    return true
  } catch (error: any) {
    if (error.statusCode === 404 || error.statusCode === 410) {
      await removeSubscription(admin, table, sub.id, sql)
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
  const rows = fixedApp
    ? await sql`select * from public.push_subscriptions where endpoint=${endpoint} and user_id=${user.id} limit 1`
    : await sql`select * from public.app_push_subscriptions where endpoint=${endpoint} and user_id=${user.id} and app=${app} limit 1`
  const existing = rows[0]
  if (action === 'status') return respond({ enabled: Boolean(existing) })
  if (action === 'unsubscribe') {
    if (existing) {
      await removeSubscription(admin, table, existing.id, sql)
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
    await sql.begin(async (tx: any) => {
      await tx`select pg_advisory_xact_lock(hashtext(${endpoint}))`
      if (fixedApp) {
        await tx`delete from public.push_subscriptions where endpoint=${endpoint} and user_id<>${user.id}`
        await tx`insert into public.push_subscriptions(user_id,endpoint,p256dh,auth,updated_at)
          values(${user.id},${endpoint},${keys.p256dh},${keys.auth},now())
          on conflict(user_id,endpoint) do update set p256dh=excluded.p256dh,auth=excluded.auth,updated_at=now()`
        await tx`insert into public.notification_preferences(user_id) values(${user.id}) on conflict(user_id) do nothing`
      } else {
        await tx`insert into public.app_push_subscriptions(user_id,app,endpoint,p256dh,auth,updated_at)
          values(${user.id},${app},${endpoint},${keys.p256dh},${keys.auth},now())
          on conflict(app,endpoint) do update set user_id=excluded.user_id,p256dh=excluded.p256dh,auth=excluded.auth,updated_at=now()`
      }
    })
    return respond({ success: true })
  }
  if (!existing) return respond({ error: 'Enable notifications on this device first.' }, 400)
  // Atomically limit tests to one per minute per device.
  const claimed = fixedApp
    ? await sql`update public.push_subscriptions set last_test_at=now() where id=${existing.id} and (last_test_at is null or last_test_at<now()-interval '1 minute') returning id`
    : await sql`update public.app_push_subscriptions set last_test_at=now() where id=${existing.id} and (last_test_at is null or last_test_at<now()-interval '1 minute') returning id`
  if (!claimed.length) return respond({ error: 'Wait a minute before sending another test.' }, 429)
  const { publicKey, privateKey } = await ensureKeys(sql, prefix)
  webpush.setVapidDetails('mailto:notifications@sciencebyhugs.com', publicKey, privateKey)
  const sent = await deliver(admin, table, existing, { title: app.toUpperCase(), body: 'Push notifications are working on this device.', tag: 'push-test', url: './' }, sql)
  return respond({ sent })
}
