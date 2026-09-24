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
import {
  addProduct,
  calculateCart,
  cartQuantity,
  changeQuantity,
  clearCart,
  loadCart,
  type CartItem,
} from './services/cart'
import { requestInvoice } from './services/invoiceRequests'
import { getMyOrderHistory, type NexusOrderHistory } from './services/accountHistory'

const app = document.querySelector<HTMLDivElement>('#app')
if (!app) throw new Error('App root not found')

let products: CatalogProduct[] = []
let selectedCategory = 'All'
let query = ''
let currentProfile: NexusProfile | null = null
let accountHistory: NexusOrderHistory[] = []
let cart: CartItem[] = loadCart()

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
      <button id="cartButton" class="cart-button" type="button">
        Cart <span id="cartCount">0</span>
      </button>
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

  <div id="toast" class="toast" role="status" aria-live="polite"></div>

  <dialog id="productDialog" class="product-dialog">
    <button id="closeDialog" class="dialog-close" aria-label="Close">×</button>
    <div id="dialogContent"></div>
  </dialog>

  <dialog id="cartDialog" class="cart-dialog">
    <button id="closeCartDialog" class="dialog-close" aria-label="Close">×</button>

    <div class="cart-heading">
      <span class="eyebrow">NEXUS CHECKOUT</span>
      <h2>Your research cart.</h2>
      <p>Review your items and request an invoice without re-entering your customer information.</p>
    </div>

    <div id="cartEmpty" class="cart-empty">
      <div class="cart-empty-icon">◇</div>
      <strong>Your cart is empty.</strong>
      <p>Add products from the catalog to get started.</p>
    </div>

    <div id="cartContent" hidden>
      <div id="cartItems" class="cart-items"></div>

      <section class="checkout-panel">
        <div class="checkout-title">Order Summary</div>
        <div class="summary-row"><span>Subtotal</span><strong id="cartSubtotal">$0.00</strong></div>
        <div class="summary-row"><span>Discounts</span><strong id="cartDiscount">-$0.00</strong></div>
        <div class="summary-row"><span>Shipping</span><strong id="cartShipping">$0.00</strong></div>
        <div class="summary-row"><span>Taxes</span><strong id="cartTax">$0.00</strong></div>
        <div class="summary-row total-row"><span>Total</span><strong id="cartTotal">$0.00</strong></div>
        <div class="server-note">Final pricing is revalidated securely when the request is submitted.</div>
      </section>

      <section id="customerPreview" class="checkout-panel customer-preview">
        <div class="checkout-title">Invoice Customer</div>
        <div id="customerSignedOut" class="customer-signed-out">
          <p>Sign in before requesting an invoice. Nexus will fill your customer information automatically.</p>
          <button id="cartSignInButton" class="auth-secondary" type="button">Sign In</button>
        </div>

        <div id="customerSignedIn" hidden>
          <div class="customer-name" id="checkoutCustomerName">—</div>
          <div class="customer-detail" id="checkoutCustomerId">—</div>
          <div class="customer-detail" id="checkoutCustomerEmail">—</div>
          <div class="customer-detail" id="checkoutCustomerPhone">—</div>

          <label class="checkout-field">
            Preferred Contact
            <select id="contactMethod">
              <option value="">Choose one</option>
              <option value="Text">Text</option>
              <option value="Email">Email</option>
              <option value="Phone">Phone</option>
            </select>
          </label>

          <label class="checkout-field">
            Notes for this invoice
            <textarea id="customerNotes" rows="3" maxlength="500" placeholder="Optional"></textarea>
          </label>
        </div>
      </section>

      <section class="policy-panel">
        <label class="policy-check">
          <input id="policyAcknowledgment" type="checkbox" />
          <span>
            I have read, acknowledged, and agree to comply with all Science By HUGs policies.
          </span>
        </label>
      </section>

      <button id="requestInvoiceButton" class="request-invoice-button" type="button">
        Request Invoice
      </button>
      <div id="invoiceRequestMessage" class="invoice-request-message" aria-live="polite"></div>
    </div>

    <div id="invoiceSuccess" class="invoice-success" hidden>
      <div class="success-orbit">✓</div>
      <span class="eyebrow">REQUEST RECEIVED</span>
      <h2>Invoice queued.</h2>
      <p>Your invoice request is waiting for Science By HUGs approval.</p>
      <div class="success-number">
        <span>Invoice</span>
        <strong id="successInvoiceNumber">—</strong>
      </div>
      <button id="successCloseButton" class="auth-primary" type="button">Return to Nexus</button>
    </div>
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

      <section class="account-history-shell">
        <div class="account-history-heading">
          <div>
            <span class="eyebrow">ORDER ARCHIVE</span>
            <h3>Orders & invoices</h3>
          </div>
          <button id="refreshHistoryButton" class="history-refresh" type="button">Refresh</button>
        </div>
        <div id="accountHistory" class="account-history">
          <div class="history-state">Loading history…</div>
        </div>
      </section>

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
const cartDialog = document.querySelector<HTMLDialogElement>('#cartDialog')!
const accountDialog = document.querySelector<HTMLDialogElement>('#accountDialog')!
const accountButton = document.querySelector<HTMLButtonElement>('#accountButton')!
const cartButton = document.querySelector<HTMLButtonElement>('#cartButton')!
const cartCount = document.querySelector<HTMLSpanElement>('#cartCount')!
const signedOutView = document.querySelector<HTMLDivElement>('#signedOutView')!
const signedInView = document.querySelector<HTMLDivElement>('#signedInView')!
const loginForm = document.querySelector<HTMLFormElement>('#loginForm')!
const loginEmail = document.querySelector<HTMLInputElement>('#loginEmail')!
const loginPassword = document.querySelector<HTMLInputElement>('#loginPassword')!
const loginSubmit = document.querySelector<HTMLButtonElement>('#loginSubmit')!
const loginMessage = document.querySelector<HTMLDivElement>('#loginMessage')!
const cartEmpty = document.querySelector<HTMLDivElement>('#cartEmpty')!
const cartContent = document.querySelector<HTMLDivElement>('#cartContent')!
const cartItems = document.querySelector<HTMLDivElement>('#cartItems')!
const customerSignedOut = document.querySelector<HTMLDivElement>('#customerSignedOut')!
const customerSignedIn = document.querySelector<HTMLDivElement>('#customerSignedIn')!
const policyAcknowledgment = document.querySelector<HTMLInputElement>('#policyAcknowledgment')!
const contactMethod = document.querySelector<HTMLSelectElement>('#contactMethod')!
const customerNotes = document.querySelector<HTMLTextAreaElement>('#customerNotes')!
const requestInvoiceButton = document.querySelector<HTMLButtonElement>('#requestInvoiceButton')!
const invoiceRequestMessage = document.querySelector<HTMLDivElement>('#invoiceRequestMessage')!
const invoiceSuccess = document.querySelector<HTMLDivElement>('#invoiceSuccess')!
const toast = document.querySelector<HTMLDivElement>('#toast')!
const accountHistoryList = document.querySelector<HTMLDivElement>('#accountHistory')!
const refreshHistoryButton = document.querySelector<HTMLButtonElement>('#refreshHistoryButton')!

const money = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value || 0)

const escapeHtml = (value: unknown) =>
  String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[char] as string))

function showToast(message: string) {
  toast.textContent = message
  toast.classList.add('show')
  window.setTimeout(() => toast.classList.remove('show'), 1800)
}

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
          <button
            class="add-cart-button"
            data-add-id="${product.id}"
            type="button"
            ${available ? '' : 'disabled'}
          >
            ${available ? 'Add to Cart' : 'Unavailable'}
          </button>
        </div>
      </article>
    `
  }).join('')

  grid.querySelectorAll<HTMLElement>('.product-card').forEach(card => {
    card.addEventListener('click', event => {
      if ((event.target as HTMLElement).closest('[data-add-id]')) return
      openProduct(card.dataset.id || '')
    })
  })

  grid.querySelectorAll<HTMLButtonElement>('[data-add-id]').forEach(button => {
    button.addEventListener('click', () => {
      const product = products.find(item => item.id === button.dataset.addId)
      if (!product) return
      cart = addProduct(cart, product)
      updateCartUI()
      showToast('Added to cart')
    })
  })
}

function openProduct(id: string) {
  const product = products.find(item => item.id === id)
  if (!product) return

  const category = product.product_categories?.name || 'Research'
  const available = (product.storefront_status || '').toLowerCase() === 'available'

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
    <button id="dialogAddToCart" class="request-invoice-button" type="button" ${available ? '' : 'disabled'}>
      ${available ? 'Add to Cart' : 'Unavailable'}
    </button>
  `

  document.querySelector<HTMLButtonElement>('#dialogAddToCart')?.addEventListener('click', () => {
    if (!available) return
    cart = addProduct(cart, product)
    updateCartUI()
    showToast('Added to cart')
  })

  productDialog.showModal()
}

function isFoundingMember() {
  return currentProfile?.memberships?.name?.trim().toLowerCase() === 'founding member'
}

function updateCartUI() {
  cartCount.textContent = String(cartQuantity(cart))

  if (!cart.length) {
    cartEmpty.hidden = false
    cartContent.hidden = true
    return
  }

  cartEmpty.hidden = true
  cartContent.hidden = false

  cartItems.innerHTML = cart.map(item => `
    <div class="cart-row">
      <div class="cart-copy">
        <strong>${escapeHtml(item.product)}</strong>
        <span>${money(item.price)} each</span>
      </div>
      <div class="quantity-control">
        <button type="button" data-qty-id="${item.id}" data-delta="-1">−</button>
        <b>${item.quantity}</b>
        <button type="button" data-qty-id="${item.id}" data-delta="1">+</button>
      </div>
      <strong class="line-total">${money(item.price * item.quantity)}</strong>
    </div>
  `).join('')

  cartItems.querySelectorAll<HTMLButtonElement>('[data-qty-id]').forEach(button => {
    button.addEventListener('click', () => {
      cart = changeQuantity(
        cart,
        button.dataset.qtyId || '',
        Number(button.dataset.delta || 0),
      )
      updateCartUI()
    })
  })

  const totals = calculateCart(cart, isFoundingMember())
  document.querySelector<HTMLElement>('#cartSubtotal')!.textContent = money(totals.subtotal)
  document.querySelector<HTMLElement>('#cartDiscount')!.textContent = '-' + money(totals.discount)
  document.querySelector<HTMLElement>('#cartShipping')!.textContent = money(totals.shipping)
  document.querySelector<HTMLElement>('#cartTax')!.textContent = money(totals.tax)
  document.querySelector<HTMLElement>('#cartTotal')!.textContent = money(totals.total)

  updateCheckoutCustomer()
  updateRequestButton()
}

function updateCheckoutCustomer() {
  if (!currentProfile) {
    customerSignedOut.hidden = false
    customerSignedIn.hidden = true
    updateRequestButton()
    return
  }

  customerSignedOut.hidden = true
  customerSignedIn.hidden = false

  const name = [currentProfile.first_name, currentProfile.last_name].filter(Boolean).join(' ')
  document.querySelector<HTMLElement>('#checkoutCustomerName')!.textContent = name || 'Science By HUGs Customer'
  document.querySelector<HTMLElement>('#checkoutCustomerId')!.textContent =
    currentProfile.customer_number ? `Customer ID: ${currentProfile.customer_number}` : 'Customer ID: —'
  document.querySelector<HTMLElement>('#checkoutCustomerEmail')!.textContent =
    currentProfile.email || 'Email: —'
  document.querySelector<HTMLElement>('#checkoutCustomerPhone')!.textContent =
    currentProfile.phone ? `Phone: ${currentProfile.phone}` : 'Phone: —'

  if (!contactMethod.value && currentProfile.preferred_contact_method) {
    const preferred = currentProfile.preferred_contact_method
    if ([...contactMethod.options].some(option => option.value === preferred)) {
      contactMethod.value = preferred
    }
  }

  updateRequestButton()
}

function updateRequestButton() {
  if (!cart.length) {
    requestInvoiceButton.disabled = true
    requestInvoiceButton.textContent = 'Request Invoice'
    return
  }

  if (!currentProfile) {
    requestInvoiceButton.disabled = false
    requestInvoiceButton.textContent = 'Sign In to Request Invoice'
    return
  }

  requestInvoiceButton.textContent = 'Request Invoice'
  requestInvoiceButton.disabled = !policyAcknowledgment.checked
}

const historyDate = (value: string) =>
  new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value))

function friendlyOrderStatus(status: string) {
  const labels: Record<string, string> = {
    invoice_bridge_pending: 'Creating invoice',
    invoice_requested: 'Awaiting approval',
    invoice_ready: 'Invoice ready',
    invoice_sent: 'Invoice sent',
    pending: 'Pending',
    paid: 'Paid',
    completed: 'Completed',
    cancelled: 'Cancelled',
  }

  return labels[status] || status.replaceAll('_', ' ')
}

function renderAccountHistory() {
  if (!currentProfile) {
    accountHistoryList.innerHTML = '<div class="history-state">Sign in to view your order history.</div>'
    return
  }

  if (!accountHistory.length) {
    accountHistoryList.innerHTML = '<div class="history-state">No Nexus orders yet.</div>'
    return
  }

  accountHistoryList.innerHTML = accountHistory.map(order => {
    const invoiceLabel = order.invoice?.invoice_number || order.order_number || 'Pending'
    const status = friendlyOrderStatus(order.status)
    const invoiceSent = order.invoice?.send_status === 'sent'
    const items = order.items.map(item => `
      <div class="history-line">
        <span>${escapeHtml(item.product_name)} <small>× ${item.quantity}</small></span>
        <strong>${money(item.line_total)}</strong>
      </div>
    `).join('')

    return `
      <article class="history-card">
        <div class="history-card-top">
          <div>
            <span class="history-number">${escapeHtml(invoiceLabel)}</span>
            <small>${escapeHtml(historyDate(order.created_at))}</small>
          </div>
          <span class="history-status ${invoiceSent ? 'sent' : ''}">${escapeHtml(status)}</span>
        </div>
        <div class="history-lines">${items || '<span class="history-muted">Item details unavailable.</span>'}</div>
        <div class="history-total">
          <span>Total</span>
          <strong>${money(order.total)}</strong>
        </div>
        ${order.invoice ? `
          <div class="history-invoice">
            <span>Invoice status</span>
            <strong>${escapeHtml(
              invoiceSent
                ? 'Sent by email'
                : order.invoice.pdf_status === 'created'
                  ? 'PDF ready'
                  : friendlyOrderStatus(order.invoice.status)
            )}</strong>
          </div>
        ` : ''}
      </article>
    `
  }).join('')
}

async function refreshOrderHistory() {
  if (!currentProfile) {
    accountHistory = []
    renderAccountHistory()
    return
  }

  accountHistoryList.innerHTML = '<div class="history-state">Loading history…</div>'
  refreshHistoryButton.disabled = true

  try {
    accountHistory = await getMyOrderHistory(currentProfile.id)
    renderAccountHistory()
  } catch (error) {
    console.error('Order history load failed', error)
    accountHistoryList.innerHTML =
      '<div class="history-state history-error">Order history could not be loaded.</div>'
  } finally {
    refreshHistoryButton.disabled = false
  }
}

async function refreshAccount() {
  const user = await getCurrentUser()

  if (!user) {
    currentProfile = null
    accountButton.textContent = 'Account'
    signedOutView.hidden = false
    signedInView.hidden = true
    accountHistory = []
    renderAccountHistory()
    updateCheckoutCustomer()
    updateCartUI()
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

  await refreshOrderHistory()
  updateCheckoutCustomer()
  updateCartUI()
}

productDialog.addEventListener('click', event => {
  if (event.target === productDialog) productDialog.close()
})
cartDialog.addEventListener('click', event => {
  if (event.target === cartDialog) cartDialog.close()
})
accountDialog.addEventListener('click', event => {
  if (event.target === accountDialog) accountDialog.close()
})

document.querySelector<HTMLButtonElement>('#closeDialog')!.addEventListener('click', () => productDialog.close())
document.querySelector<HTMLButtonElement>('#closeCartDialog')!.addEventListener('click', () => cartDialog.close())
document.querySelector<HTMLButtonElement>('#closeAccountDialog')!.addEventListener('click', () => accountDialog.close())
document.querySelector<HTMLButtonElement>('#successCloseButton')!.addEventListener('click', () => cartDialog.close())

accountButton.addEventListener('click', () => accountDialog.showModal())
cartButton.addEventListener('click', () => {
  invoiceSuccess.hidden = true
  cartEmpty.hidden = cart.length > 0
  cartContent.hidden = cart.length === 0
  invoiceRequestMessage.textContent = ''
  updateCartUI()
  cartDialog.showModal()
})

document.querySelector<HTMLButtonElement>('#cartSignInButton')!.addEventListener('click', () => {
  cartDialog.close()
  accountDialog.showModal()
})

policyAcknowledgment.addEventListener('change', updateRequestButton)
refreshHistoryButton.addEventListener('click', () => {
  void refreshOrderHistory()
})

requestInvoiceButton.addEventListener('click', async () => {
  if (!currentProfile) {
    cartDialog.close()
    accountDialog.showModal()
    return
  }

  if (!policyAcknowledgment.checked) {
    showToast('Please acknowledge the policies first.')
    return
  }

  invoiceRequestMessage.textContent = ''
  requestInvoiceButton.disabled = true
  requestInvoiceButton.textContent = 'Creating Request…'

  try {
    const result = await requestInvoice(cart, {
      policyAcknowledged: true,
      contactMethod: contactMethod.value,
      customerNotes: customerNotes.value.trim(),
    })

    clearCart()
    cart = []
    policyAcknowledgment.checked = false
    customerNotes.value = ''
    updateCartUI()

    document.querySelector<HTMLElement>('#successInvoiceNumber')!.textContent =
      result.invoiceNumber || 'Pending'
    cartContent.hidden = true
    cartEmpty.hidden = true
    invoiceSuccess.hidden = false
    await refreshOrderHistory()
  } catch (error) {
    invoiceRequestMessage.textContent =
      error instanceof Error ? error.message : 'Invoice request failed.'
    updateRequestButton()
  } finally {
    if (!invoiceSuccess.hidden) return
    requestInvoiceButton.textContent = currentProfile ? 'Request Invoice' : 'Sign In to Request Invoice'
  }
})

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
    accountDialog.close()

    if (cart.length) {
      updateCartUI()
      cartDialog.showModal()
    }
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

updateCartUI()

void Promise.all([
  loadCatalog(),
  refreshAccount(),
])
