import { supabase } from './services/supabase'
import './avatar.css'

const bucket = () => supabase.storage.from('avatars')
let currentId = ''
let currentName = ''
let photoUrl = ''
let loadedAt = 0
let generation = 0
let editor: HTMLDialogElement | null = null

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return (parts.length > 1 ? parts[0][0] + parts.at(-1)![0] : (parts[0] || '?').slice(0, 2)).toUpperCase()
}
export function avatarMarkup() { return '<span class="profile-avatar" data-profile-avatar aria-hidden="true">?</span>' }
export function avatarPanel(shared = true) {
  return `<section class="profile-photo-panel" data-photo-panel aria-label="Profile photo">
    ${avatarMarkup()}<div class="profile-photo-controls"><strong>Profile photo</strong>
    <p>${shared ? 'Shared between your Nexus and Core accounts.' : 'Your private Pulse profile photo.'}</p>
    <div class="profile-photo-actions"><button type="button" data-photo-choose>Upload photo</button><button type="button" data-photo-remove hidden>Remove</button></div>
    <input type="file" data-photo-file accept="image/jpeg,image/png,image/webp" hidden>
    <small>JPG, PNG or WebP · up to 10 MB</small><p data-photo-status role="status" aria-live="polite"></p></div>
  </section>`
}
export function cropRect(width: number, height: number, zoom: number, x: number, y: number) {
  const side = Math.min(width, height) / Math.max(1, Math.min(3, zoom))
  return { side, x: (width - side) * Math.max(0, Math.min(1, x)), y: (height - side) * Math.max(0, Math.min(1, y)) }
}
export function validatePhoto(file: { type: string; size: number }) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a JPG, PNG or WebP photo.')
  if (!file.size || file.size > 10 * 1024 * 1024) throw new Error('Choose a photo smaller than 10 MB.')
}
function paint() {
  document.querySelectorAll<HTMLElement>('[data-profile-avatar]').forEach(node => {
    node.replaceChildren()
    if (photoUrl) {
      const image = document.createElement('img')
      image.src = photoUrl
      image.alt = ''
      image.addEventListener('error', () => { node.textContent = initials(currentName) }, { once: true })
      node.append(image)
    } else node.textContent = initials(currentName)
  })
  document.querySelectorAll<HTMLButtonElement>('[data-photo-remove]').forEach(button => { button.hidden = !photoUrl })
  document.querySelectorAll<HTMLButtonElement>('[data-photo-choose]').forEach(button => { button.textContent = photoUrl ? 'Replace photo' : 'Upload photo' })
}
function clear() {
  generation++
  currentId = ''; currentName = ''; photoUrl = ''; loadedAt = 0
  editor?.close(); editor?.remove(); editor = null
  paint()
}
supabase.auth.onAuthStateChange((_event, session) => {
  if (!session || (currentId && session.user.id !== currentId)) clear()
})
export async function bindAvatars(name = '') {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) { clear(); return }
  const id = session.user.id
  if (currentId !== id) clear()
  currentId = id
  currentName = name || session.user.user_metadata?.display_name || [session.user.user_metadata?.first_name, session.user.user_metadata?.last_name].filter(Boolean).join(' ') || session.user.email?.split('@')[0] || '?'
  paint()
  const version = generation
  if (Date.now() - loadedAt > 30 * 60 * 1000) {
    const { data, error } = await bucket().createSignedUrl(`${id}/avatar.jpg`, 3600)
    if (currentId !== id || version !== generation) return
    photoUrl = error ? '' : data?.signedUrl || ''
    loadedAt = error ? 0 : Date.now()
    paint()
  }
  const panel = document.querySelector<HTMLElement>('[data-photo-panel]')
  if (!panel || panel.dataset.bound === id) return
  // Abort old handlers if an account is switched without rebuilding the page.
  panel.dispatchEvent(new Event('photo-unbind'))
  const controller = new AbortController()
  panel.addEventListener('photo-unbind', () => controller.abort(), { once: true })
  panel.dataset.bound = id
  const fileInput = panel.querySelector<HTMLInputElement>('[data-photo-file]')!
  const status = panel.querySelector<HTMLElement>('[data-photo-status]')!
  const choose = panel.querySelector<HTMLButtonElement>('[data-photo-choose]')!
  const remove = panel.querySelector<HTMLButtonElement>('[data-photo-remove]')!
  choose.addEventListener('click', () => fileInput.click(), { signal: controller.signal })
  remove.addEventListener('click', async () => {
    if (currentId !== id) return
    remove.disabled = true; choose.disabled = true; status.textContent = 'Removing…'
    try {
      const { error } = await bucket().remove([`${id}/avatar.jpg`])
      if (error) throw error
      if (currentId !== id) return
      generation++; photoUrl = ''; loadedAt = Date.now(); paint()
      status.textContent = 'Photo removed.'
    } catch { status.textContent = 'Could not remove your photo. Please try again.' }
    finally { remove.disabled = false; choose.disabled = false }
  }, { signal: controller.signal })
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0]
    fileInput.value = ''
    if (!file || currentId !== id) return
    status.textContent = ''
    try { validatePhoto(file); await cropPhoto(file, id, status) }
    catch (error) { status.textContent = error instanceof Error ? error.message : 'Could not open your photo.' }
  }, { signal: controller.signal })
}
async function cropPhoto(file: File, id: string, status: HTMLElement) {
  editor?.close(); editor?.remove()
  const objectUrl = URL.createObjectURL(file)
  const image = new Image()
  try { image.src = objectUrl; await image.decode() }
  catch { URL.revokeObjectURL(objectUrl); throw new Error('Could not open this photo. Try another JPG, PNG or WebP.') }
  if (currentId !== id || !status.isConnected) { URL.revokeObjectURL(objectUrl); return }
  if (image.naturalWidth * image.naturalHeight > 40_000_000) { URL.revokeObjectURL(objectUrl); throw new Error('Choose a photo under 40 megapixels.') }
  const dialog = document.createElement('dialog')
  editor = dialog
  dialog.className = 'photo-crop-dialog'
  dialog.setAttribute('aria-labelledby', 'photo-crop-title')
  dialog.innerHTML = `<h2 id="photo-crop-title">Adjust your photo</h2><canvas width="512" height="512" aria-label="Photo crop preview"></canvas>
    <label>Zoom<input data-crop-zoom type="range" min="1" max="3" step="0.01" value="1"></label>
    <label>Horizontal position<input data-crop-x type="range" min="0" max="1" step="0.01" value="0.5"></label>
    <label>Vertical position<input data-crop-y type="range" min="0" max="1" step="0.01" value="0.5"></label>
    <p data-crop-status role="status" aria-live="polite"></p><div class="profile-photo-actions"><button type="button" data-crop-cancel>Cancel</button><button type="button" data-crop-save>Save photo</button></div>`
  const canvas = dialog.querySelector('canvas')!
  const context = canvas.getContext('2d')!
  const zoom = dialog.querySelector<HTMLInputElement>('[data-crop-zoom]')!
  const x = dialog.querySelector<HTMLInputElement>('[data-crop-x]')!
  const y = dialog.querySelector<HTMLInputElement>('[data-crop-y]')!
  const draw = () => {
    const rect = cropRect(image.naturalWidth, image.naturalHeight, +zoom.value, +x.value, +y.value)
    context.fillStyle = '#101923'; context.fillRect(0, 0, 512, 512)
    context.drawImage(image, rect.x, rect.y, rect.side, rect.side, 0, 0, 512, 512)
  }
  dialog.querySelectorAll('input').forEach(input => input.addEventListener('input', draw))
  dialog.addEventListener('close', () => { URL.revokeObjectURL(objectUrl); dialog.remove(); if (editor === dialog) editor = null }, { once: true })
  const cancel = dialog.querySelector<HTMLButtonElement>('[data-crop-cancel]')!
  cancel.addEventListener('click', () => dialog.close())
  const save = dialog.querySelector<HTMLButtonElement>('[data-crop-save]')!
  let saving = false
  dialog.addEventListener('cancel', event => { if (saving) event.preventDefault() })
  save.addEventListener('click', async () => {
    if (saving || currentId !== id) return
    saving = true; save.disabled = true; cancel.disabled = true
    const message = dialog.querySelector<HTMLElement>('[data-crop-status]')!
    message.textContent = 'Saving…'
    try {
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Could not prepare your photo.')), 'image/jpeg', 0.88))
      if (currentId !== id) return
      const { error } = await bucket().upload(`${id}/avatar.jpg`, blob, { contentType: 'image/jpeg', upsert: true, cacheControl: '0' })
      if (error) throw error
      if (currentId !== id) return
      generation++; loadedAt = 0
      const { data, error: urlError } = await bucket().createSignedUrl(`${id}/avatar.jpg`, 3600)
      if (currentId !== id) return
      if (urlError) throw urlError
      photoUrl = data.signedUrl + '&v=' + Date.now(); loadedAt = Date.now(); paint()
      status.textContent = 'Photo saved.'
      dialog.close()
    } catch { message.textContent = 'Could not save your photo. Please try again.' }
    finally { saving = false; save.disabled = false; cancel.disabled = false }
  })
  document.body.append(dialog); draw(); dialog.showModal()
}
