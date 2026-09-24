import './styles.css'
import { fetchCatalog, type CatalogProduct } from './services/catalog'
import {
  getCurrentUser,
  getMyProfile,
  onAuthChange,
  signIn,
  signOut,
  type NexusProfile,
} from './services/auth'

const app = document.querySelector<HTMLDivElement>('#app')
if (!app) throw new Error('App root not found')

let products: CatalogProduct[] = []
let selectedCategory = 'All'
let query = ''
let currentProfile: NexusProfile | null = null

app.innerHTML = `
  <div class="stars" aria-hidden="true"></div>

  <header class="topbar">
    <a class="brand" href="#" aria-label="Science By HUGs Nexus home">
      <img src="/brand-mark.svg" alt="" />
      <div>
        <span>SCIENCE BY HUGs</span>
        <strong>NEXUS</strong>
      </div>
    </a>

    <div class="top-actions">
      <span class="system-status"><i></i> CATALOG LIVE</span>
      <button id="accountButton" class="account-button" type="button">Account</button>
    </div>
  </header>

  <main class="shell">
    <section class="hero">
      <div class="eyebrow">SCIENCE • RESEARCH • DISCOVERY</div>
      <h1>Enter the <em>Nexus.</em></h1>
      <p>Explore the live Science By HUGs catalog, powered by our continuously synced research database.</p>
    </section>

    <section class="catalog-shell">
      <div class="toolbar">
        <label class="search">
          <span>⌕</span>
          <input id="searchInput" type="search" placeholder="Search the catalog…" autocomplete="off" />
        </label>
        <div id="categoryChips" class="chips" aria-label="Catalog categories"></div>
      </div>

      <div class="section-heading">
        <div>
          <span class="eyebrow">LIVE DATABASE</span>
          <h2>Research Catalog</h2>
        </div>
        <span id="productCount" class="count"></span>
      </div>

      <div id="catalogGrid" class="grid">
        <div class="state"><div class="loader"></div><p>Connecting to Nexus…</p></div>
      </div>
    </section>
  </main>

  <dialog id="productDialog" class="product-dialog">
    <button id="closeDialog" class="dialog-close" aria-label="Close">×</button>
    <div id="dialogContent"></div>
  </dialog>

  <dialog id="accountDialog" class="account-dialog">
    <button id="closeAccountDialog" class="dialog-close" aria-label="Close">×</button>

    <div id="signedOutView">
      <span class="eyebrow">NEXUS IDENTITY</span>
      <h2>Welcome back.</h2>
      <p class="account-copy">Sign in with your Science By HUGs account.</p>

      <form id="loginForm" class="auth-form">
        <label>
          Email
          <input id="loginEmail" type="email" autocomplete="email" required />
        </label>
        <label>
          Password
          <input id="loginPassword" type="password" autocomplete="current-password" required />
        </label>
        <button id="loginSubmit" class="auth-primary" type="submit">Sign In</button>
        <div id="loginMessage" class="auth-message" aria-live="polite"></div>
      </form>

      <div class="activation-note">
        <strong>Existing customer?</strong>
        <p>Account activation and password setup will be enabled after we finish the verified-email migration test.</p>
      </div>
    </div>

    <div id="signedInView" hidden>
      <span class="eyebrow">NEXUS IDENTITY</span>
      <h2 id="accountName">Your account</h2>
      <p id="accountEmail" class="account-copy"></p>

      <div class="account-data">
        <div><span>Customer ID</span><strong id="accountCustomerId">—</strong></div>
        <div><span>Membership</span><strong id="accountMembership">—</strong></div>
        <div><span>Status</span><strong id="accountStatus">—</strong></div>
      </div>

      <button id="logoutButton" class="auth-secondary" type="button">Sign Out</button>
    </div>
  </dialog>
`

const grid = document.querySelector<HTMLDivElement>('#catalogGrid')!
const chips = document.querySelector<HTMLDivElement>('#categoryChips')!
const count = document.querySelector<HTMLSpanElement>('#productCount')!
const searchInput = document.querySelector<HTMLInputElement>('#searchInput')!
const productDialog = document.querySelector<HTMLDialogElement>('#productDialog')!
const dialogContent = document.querySelector<HTMLDivElement>('#dialogContent')!
const accountDialog = document.querySelector<HTMLDialogElement>('#accountDialog')!
const accountButton = document.querySelector<HTMLButtonElement>('#accountButton')!
const signedOutView = document.querySelector<HTMLDivElement>('#signedOutView')!
const signedInView = document.querySelector<HTMLDivElement>('#signedInView')!
const loginForm = document.querySelector<HTMLFormElement>('#loginForm')!
const loginEmail = document.querySelector<HTMLInputElement>('#loginEmail')!
const loginPassword = document.querySelector<HTMLInputElement>('#loginPassword')!
const loginSubmit = document.querySelector<HTMLButtonElement>('#loginSubmit')!
const loginMessage = document.querySelector<HTMLDivElement>('#loginMessage')!

const money = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value || 0)

const escapeHtml = (value: unknown) =>
  String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[char] as string))

function categories() {
  return ['All', ...new Set(products.map(p => p.product_categories?.name).filter(Boolean) as string[])]
}

function renderChips() {
  chips.innerHTML = categories().map(category => `
    <button class="chip ${category === selectedCategory ? 'active' : ''}" data-category="${escapeHtml(category)}">
      ${escapeHtml(category)}
    </button>
  `).join('')

  chips.querySelectorAll<HTMLButtonElement>('.chip').forEach(button => {
    button.addEventListener('click', () => {
      selectedCategory = button.dataset.category || 'All'
      renderChips()
      renderProducts()
    })
  })
}

function visibleProducts() {
  const normalized = query.trim().toLowerCase()
  return products.filter(product => {
    const category = product.product_categories?.name || 'Uncategorized'
    const categoryMatch = selectedCategory === 'All' || category === selectedCategory
    const searchMatch = !normalized || [
      product.name,
      product.product_type,
      product.description,
      category,
    ].join(' ').toLowerCase().includes(normalized)

    return categoryMatch && searchMatch
  })
}

function renderProducts() {
  const list = visibleProducts()
  count.textContent = `${list.length} item${list.length === 1 ? '' : 's'}`

  if (!list.length) {
    grid.innerHTML = '<div class="state"><p>No products match this search.</p></div>'
    return
  }

  grid.innerHTML = list.map(product => {
    const category = product.product_categories?.name || 'Research'
    const available = (product.storefront_status || '').toLowerCase() === 'available'

    return `
      <article class="product-card" data-id="${product.id}">
        <div class="product-image">
          ${product.image_url
            ? `<img src="${escapeHtml(product.image_url)}" alt="" loading="lazy" />`
            : '<img src="/brand-mark.svg" alt="" class="fallback-mark" />'}
          ${product.featured ? '<span class="featured">FEATURED</span>' : ''}
        </div>
        <div class="product-body">
          <span class="category">${escapeHtml(category)}</span>
          <h3>${escapeHtml(product.name)}</h3>
          <p class="type">${escapeHtml(product.product_type || 'Research Product')}</p>
          <div class="product-footer">
            <strong>${money(Number(product.price))}</strong>
            <span class="availability ${available ? '' : 'unavailable'}">${escapeHtml(product.storefront_status || 'Available')}</span>
          </div>
        </div>
      </article>
    `
  }).join('')

  grid.querySelectorAll<HTMLElement>('.product-card').forEach(card => {
    card.addEventListener('click', () => openProduct(card.dataset.id || ''))
  })
}

function openProduct(id: string) {
  const product = products.find(item => item.id === id)
  if (!product) return

  const category = product.product_categories?.name || 'Research'

  dialogContent.innerHTML = `
    <div class="dialog-image">
      ${product.image_url
        ? `<img src="${escapeHtml(product.image_url)}" alt="" />`
        : '<img src="/brand-mark.svg" alt="" class="fallback-mark" />'}
    </div>
    <span class="category">${escapeHtml(category)}</span>
    <h2>${escapeHtml(product.name)}</h2>
    <div class="dialog-price">${money(Number(product.price))}</div>
    <p class="dialog-description">${escapeHtml(product.description || 'Product information is being prepared.')}</p>
    <div class="research-notice">For research use only. Catalog availability is synchronized with the Science By HUGs research database.</div>
  `

  productDialog.showModal()
}

async function refreshAccount() {
  const user = await getCurrentUser()

  if (!user) {
    currentProfile = null
    accountButton.textContent = 'Account'
    signedOutView.hidden = false
    signedInView.hidden = true
    return
  }

  try {
    currentProfile = await getMyProfile()
  } catch (error) {
    console.error('Profile load failed', error)
    currentProfile = null
  }

  signedOutView.hidden = true
  signedInView.hidden = false

  const fullName = currentProfile
    ? [currentProfile.first_name, currentProfile.last_name].filter(Boolean).join(' ')
    : ''

  accountButton.textContent = fullName || 'My Account'
  document.querySelector<HTMLElement>('#accountName')!.textContent = fullName || 'Your account'
  document.querySelector<HTMLElement>('#accountEmail')!.textContent = currentProfile?.email || user.email || ''
  document.querySelector<HTMLElement>('#accountCustomerId')!.textContent = currentProfile?.customer_number || '—'
  document.querySelector<HTMLElement>('#accountMembership')!.textContent = currentProfile?.memberships?.name || '—'
  document.querySelector<HTMLElement>('#accountStatus')!.textContent = currentProfile?.account_status || 'Active'
}

productDialog.addEventListener('click', event => {
  if (event.target === productDialog) productDialog.close()
})

accountDialog.addEventListener('click', event => {
  if (event.target === accountDialog) accountDialog.close()
})

document.querySelector<HTMLButtonElement>('#closeDialog')!.addEventListener('click', () => productDialog.close())
document.querySelector<HTMLButtonElement>('#closeAccountDialog')!.addEventListener('click', () => accountDialog.close())

accountButton.addEventListener('click', () => accountDialog.showModal())

document.querySelector<HTMLButtonElement>('#logoutButton')!.addEventListener('click', async () => {
  await signOut()
  await refreshAccount()
})

loginForm.addEventListener('submit', async event => {
  event.preventDefault()
  loginMessage.textContent = ''
  loginSubmit.disabled = true
  loginSubmit.textContent = 'Signing In…'

  try {
    await signIn(loginEmail.value, loginPassword.value)
    loginPassword.value = ''
    await refreshAccount()
  } catch (error) {
    loginMessage.textContent = error instanceof Error ? error.message : 'Sign in failed.'
  } finally {
    loginSubmit.disabled = false
    loginSubmit.textContent = 'Sign In'
  }
})

searchInput.addEventListener('input', () => {
  query = searchInput.value
  renderProducts()
})

onAuthChange(() => {
  void refreshAccount()
})

async function loadCatalog() {
  try {
    products = await fetchCatalog()
    renderChips()
    renderProducts()
  } catch (error) {
    console.error(error)
    grid.innerHTML = `
      <div class="state error">
        <strong>Nexus could not reach the catalog.</strong>
        <p>Please refresh and try again.</p>
      </div>
    `
  }
}

void Promise.all([
  loadCatalog(),
  refreshAccount(),
])
