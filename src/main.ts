import './styles.css'
import { registerSW } from 'virtual:pwa-register'
import { fetchCatalog, type CatalogProduct } from './services/catalog'
import {
  getCurrentUser,
  getMyProfile,
  onAuthChange,
  requestPasswordReset,
  changePassword,
  updatePassword,
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
import { createCheckoutOrder, type CheckoutOrderResult } from './services/checkout'
import { getMyOrderHistory, type NexusOrderHistory } from './services/accountHistory'
import { capturePayPalOrder, createPayPalOrder, getPayPalSdk } from './services/paypal'
import { getZelleConfig, submitZellePayment } from './services/zelle'
import { getInvoicePdfLink } from './services/invoicePdf'
import {
  buildReferralLink,
  claimReferral,
  getReferralDashboard,
  submitReferral,
  type ReferralDashboard,
} from './services/referrals'

const updateServiceWorker = registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return
    void registration.update()
    window.setInterval(() => {
      void registration.update()
    }, 60 * 60 * 1000)
  },
  onNeedRefresh() {
    void updateServiceWorker(true)
  },
})

const app = document.querySelector<HTMLDivElement>('#app')
if (!app) throw new Error('App root not found')

let products: CatalogProduct[] = []
let selectedCategory = 'All'
let query = ''
let currentProfile: NexusProfile | null = null
let accountHistory: NexusOrderHistory[] = []
let cart: CartItem[] = loadCart()
let activeCheckoutOrder: CheckoutOrderResult | null = null
let recoveryMode = new URLSearchParams(window.location.search).get('mode') === 'recovery'
let referralDashboard: ReferralDashboard | null = null

const incomingReferralCode = new URLSearchParams(window.location.search).get('ref')
if (incomingReferralCode) {
  window.localStorage.setItem('sbh_referral_code', incomingReferralCode.trim())
}

const brandMarkUrl = `${import.meta.env.BASE_URL}brand-mark.svg`

app.innerHTML = `
  <div class="stars" aria-hidden="true"></div>

  <header class="topbar">
    <a class="brand" href="#" aria-label="Science By HUGs Nexus home">
      <img src="${brandMarkUrl}" alt="" />
      <div>
        <span>SCIENCE BY HUGs</span>
        <strong>NEXUS</strong>
      </div>
    </a>

    <div class="top-actions">
      <span class="system-status"><i></i> CATALOG LIVE</span>
      <button id="menuButton" class="account-button menu-button" type="button">Menu</button>
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

  <nav class="mobile-bottom-nav" aria-label="Mobile navigation">
    <button id="mobileHomeButton" class="mobile-nav-item active" type="button">
      <span class="mobile-nav-icon">⌂</span>
      <span>Home</span>
    </button>
    <button id="mobileAccountButton" class="mobile-nav-item" type="button">
      <span class="mobile-nav-icon">◉</span>
      <span>Account</span>
    </button>
    <button id="mobileSupportButton" class="mobile-nav-item" type="button">
      <span class="mobile-nav-icon">?</span>
      <span>Support</span>
    </button>
    <button id="mobileCartButton" class="mobile-nav-item" type="button">
      <span class="mobile-nav-icon">◇</span>
      <span>Cart</span>
      <b id="mobileCartCount">0</b>
    </button>
  </nav>

  <div id="toast" class="toast" role="status" aria-live="polite"></div>


  <dialog id="menuDialog" class="menu-dialog">
    <button id="closeMenuDialog" class="dialog-close" aria-label="Close">×</button>
    <div class="menu-head">
      <span class="eyebrow">NEXUS NAVIGATION</span>
      <h2>Explore Nexus.</h2>
      <p>Everything connected to your Science By HUGs account in one place.</p>
    </div>
    <nav class="menu-grid" aria-label="Nexus menu">
      <button class="menu-card" type="button" data-menu-target="catalog">
        <span>CATALOG</span><strong>Research Catalog</strong><small>Browse available products.</small>
      </button>
      <button class="menu-card" type="button" data-menu-target="account">
        <span>ACCOUNT</span><strong>My Account</strong><small>Orders, invoices, profile, and security.</small>
      </button>
      <button class="menu-card" type="button" data-menu-target="referral">
        <span>REFERRALS</span><strong>Refer a Friend</strong><small>Referral rewards and progress.</small>
      </button>
      <button class="menu-card" type="button" data-menu-target="support">
        <span>SUPPORT</span><strong>Get Support</strong><small>Order, payment, and account help.</small>
      </button>
      <button class="menu-card" type="button" data-menu-target="policies">
        <span>POLICIES</span><strong>Policy Library</strong><small>Terms, privacy, shipping, and research policies.</small>
      </button>
    </nav>
    <section id="menuInfoPanel" class="menu-info-panel" hidden></section>
  </dialog>

  <dialog id="supportDialog" class="support-dialog">
    <button id="closeSupportDialog" class="dialog-close" aria-label="Close">×</button>
    <div class="support-page">
      <div class="support-hero">
        <span class="eyebrow">NEXUS SUPPORT</span>
        <h2>How can we help?</h2>
        <p>Reach Science By HUGs support or save our contact card directly to your phone.</p>
      </div>

      <div class="support-grid">
        <a class="support-action-card" href="mailto:support@sciencebyhugs.com">
          <div class="support-action-icon">✉</div>
          <div>
            <span>EMAIL SUPPORT</span>
            <strong>support@sciencebyhugs.com</strong>
            <small>Open your email app with our support address ready.</small>
          </div>
        </a>

        <button id="downloadContactButton" class="support-action-card support-action-button" type="button">
          <div class="support-action-icon">＋</div>
          <div>
            <span>SAVE CONTACT</span>
            <strong>Download Our Contact</strong>
            <small>Save our official Science By HUGs vCard on iPhone or Android.</small>
          </div>
        </button>
      </div>

      <div class="support-info-card">
        <span class="eyebrow">SCIENCE BY HUGs</span>
        <strong>Customer Support</strong>
        <p>For account, order, invoice, payment, or general questions, include your customer ID or order number when available.</p>
      </div>
    </div>
  </dialog>

  <dialog id="referralDialog" class="referral-dialog">
    <button id="closeReferralDialog" class="dialog-close" aria-label="Close">×</button>
    <div id="referralDialogContent" class="referral-dialog-content"></div>
  </dialog>

  <dialog id="productDialog" class="product-dialog">
    <button id="closeDialog" class="dialog-close" aria-label="Close">×</button>
    <div id="dialogContent"></div>
  </dialog>

  <dialog id="cartDialog" class="cart-dialog">
    <button id="closeCartDialog" class="dialog-close" aria-label="Close">×</button>

    <div class="cart-heading">
      <span class="eyebrow">NEXUS CHECKOUT</span>
      <h2>Your research cart.</h2>
      <p>Review your items, acknowledge the policies, then pay now or request an invoice by email.</p>
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
        <div class="checkout-title">Checkout Customer</div>
        <div id="customerSignedOut" class="customer-signed-out">
          <p>Sign in before checking out. Nexus will fill your customer information automatically.</p>
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
            Notes for this order
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

      <section class="checkout-choice">
        <button id="payNowButton" class="request-invoice-button" type="button">
          Pay Now
        </button>
        <button id="requestInvoiceButton" class="auth-secondary checkout-invoice-button" type="button">
          Request Invoice by Email
        </button>
        <p>Pay now with PayPal, Venmo, or Zelle — or request an invoice and pay later.</p>
      </section>

      <section id="cartPayPanel" class="cart-pay-panel" hidden>
        <div class="checkout-title">Choose Payment Method</div>
        <p class="cart-pay-copy">Your final total is revalidated securely before a payment order is created.</p>
        <div class="nexus-wallet-buttons">
          <paypal-button id="cartPayPalButton" class="nexus-paypal-button" hidden></paypal-button>
          <venmo-button id="cartVenmoButton" class="nexus-venmo-button" type="pay" hidden></venmo-button>
          <button id="cartZelleStartButton" class="zelle-submit-button" type="button" hidden>Pay with Zelle</button>
        </div>
        <div id="cartPayMessage" class="paypal-message" aria-live="polite"></div>

        <div id="cartZellePanel" class="zelle-shell" hidden>
          <div class="zelle-head">
            <strong>Pay with Zelle</strong>
            <small>Send the exact server-verified total, then report the payment below.</small>
          </div>
          <div id="cartZelleDetails" class="zelle-details"></div>
          <label class="zelle-confirmation-label">
            Confirmation / reference
            <input id="cartZelleConfirmation" class="zelle-confirmation" type="text" maxlength="120" placeholder="Optional">
          </label>
          <button id="cartZelleSubmitButton" class="zelle-submit-button" type="button">
            I Sent the Zelle Payment
          </button>
          <div id="cartZelleMessage" class="zelle-message"></div>
        </div>
      </section>

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

    <div id="payNowSuccess" class="invoice-success" hidden>
      <div class="success-orbit">✓</div>
      <span class="eyebrow">CHECKOUT RECEIVED</span>
      <h2 id="payNowSuccessTitle">Payment received.</h2>
      <p id="payNowSuccessCopy">Your order has been sent to Science By HUGs Core.</p>
      <div class="success-number">
        <span>Order</span>
        <strong id="payNowOrderNumber">—</strong>
      </div>
      <button id="payNowSuccessCloseButton" class="auth-primary" type="button">Return to Nexus</button>
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
        <button id="forgotPasswordButton" class="auth-link" type="button">Forgot password?</button>
        <div id="loginMessage" class="auth-message" aria-live="polite"></div>
      </form>

      <form id="forgotPasswordForm" class="auth-form recovery-form" hidden>
        <span class="eyebrow">PASSWORD RECOVERY</span>
        <h3>Reset your password.</h3>
        <p class="account-copy">Enter the email connected to your Science By HUGs account.</p>
        <label>
          Email
          <input id="forgotPasswordEmail" type="email" autocomplete="email" required />
        </label>
        <button id="forgotPasswordSubmit" class="auth-primary" type="submit">Send Reset Email</button>
        <button id="forgotPasswordBack" class="auth-link" type="button">Back to sign in</button>
        <div id="forgotPasswordMessage" class="auth-message" aria-live="polite"></div>
      </form>

      <form id="recoveryPasswordForm" class="auth-form recovery-form" hidden>
        <span class="eyebrow">SECURE RECOVERY</span>
        <h3>Choose a new password.</h3>
        <label>
          New password
          <input id="recoveryPassword" type="password" autocomplete="new-password" minlength="10" required />
        </label>
        <label>
          Confirm new password
          <input id="recoveryPasswordConfirm" type="password" autocomplete="new-password" minlength="10" required />
        </label>
        <button id="recoveryPasswordSubmit" class="auth-primary" type="submit">Set New Password</button>
        <div id="recoveryPasswordMessage" class="auth-message" aria-live="polite"></div>
      </form>
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

      <section class="account-security-shell">
        <div class="account-history-heading">
          <div>
            <span class="eyebrow">SECURITY</span>
            <h3>Change password</h3>
          </div>
        </div>
        <form id="changePasswordForm" class="auth-form compact-auth-form">
          <label>
            Current password
            <input id="currentPassword" type="password" autocomplete="current-password" required />
          </label>
          <label>
            New password
            <input id="newPassword" type="password" autocomplete="new-password" minlength="10" required />
          </label>
          <label>
            Confirm new password
            <input id="confirmNewPassword" type="password" autocomplete="new-password" minlength="10" required />
          </label>
          <button id="changePasswordSubmit" class="auth-primary" type="submit">Change Password</button>
          <div id="changePasswordMessage" class="auth-message" aria-live="polite"></div>
        </form>
      </section>

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
const menuDialog = document.querySelector<HTMLDialogElement>('#menuDialog')!
const supportDialog = document.querySelector<HTMLDialogElement>('#supportDialog')!
const referralDialog = document.querySelector<HTMLDialogElement>('#referralDialog')!
const referralDialogContent = document.querySelector<HTMLDivElement>('#referralDialogContent')!
const downloadContactButton = document.querySelector<HTMLButtonElement>('#downloadContactButton')!
const menuButton = document.querySelector<HTMLButtonElement>('#menuButton')!
const menuInfoPanel = document.querySelector<HTMLElement>('#menuInfoPanel')!
const accountButton = document.querySelector<HTMLButtonElement>('#accountButton')!
const cartButton = document.querySelector<HTMLButtonElement>('#cartButton')!
const cartCount = document.querySelector<HTMLSpanElement>('#cartCount')!
const mobileCartCount = document.querySelector<HTMLElement>('#mobileCartCount')!
const mobileHomeButton = document.querySelector<HTMLButtonElement>('#mobileHomeButton')!
const mobileAccountButton = document.querySelector<HTMLButtonElement>('#mobileAccountButton')!
const mobileSupportButton = document.querySelector<HTMLButtonElement>('#mobileSupportButton')!
const mobileCartButton = document.querySelector<HTMLButtonElement>('#mobileCartButton')!
const signedOutView = document.querySelector<HTMLDivElement>('#signedOutView')!
const signedInView = document.querySelector<HTMLDivElement>('#signedInView')!
const loginForm = document.querySelector<HTMLFormElement>('#loginForm')!
const loginEmail = document.querySelector<HTMLInputElement>('#loginEmail')!
const loginPassword = document.querySelector<HTMLInputElement>('#loginPassword')!
const loginSubmit = document.querySelector<HTMLButtonElement>('#loginSubmit')!
const loginMessage = document.querySelector<HTMLDivElement>('#loginMessage')!
const forgotPasswordButton = document.querySelector<HTMLButtonElement>('#forgotPasswordButton')!
const forgotPasswordForm = document.querySelector<HTMLFormElement>('#forgotPasswordForm')!
const forgotPasswordEmail = document.querySelector<HTMLInputElement>('#forgotPasswordEmail')!
const forgotPasswordSubmit = document.querySelector<HTMLButtonElement>('#forgotPasswordSubmit')!
const forgotPasswordBack = document.querySelector<HTMLButtonElement>('#forgotPasswordBack')!
const forgotPasswordMessage = document.querySelector<HTMLDivElement>('#forgotPasswordMessage')!
const recoveryPasswordForm = document.querySelector<HTMLFormElement>('#recoveryPasswordForm')!
const recoveryPassword = document.querySelector<HTMLInputElement>('#recoveryPassword')!
const recoveryPasswordConfirm = document.querySelector<HTMLInputElement>('#recoveryPasswordConfirm')!
const recoveryPasswordSubmit = document.querySelector<HTMLButtonElement>('#recoveryPasswordSubmit')!
const recoveryPasswordMessage = document.querySelector<HTMLDivElement>('#recoveryPasswordMessage')!
const changePasswordForm = document.querySelector<HTMLFormElement>('#changePasswordForm')!
const currentPassword = document.querySelector<HTMLInputElement>('#currentPassword')!
const newPassword = document.querySelector<HTMLInputElement>('#newPassword')!
const confirmNewPassword = document.querySelector<HTMLInputElement>('#confirmNewPassword')!
const changePasswordSubmit = document.querySelector<HTMLButtonElement>('#changePasswordSubmit')!
const changePasswordMessage = document.querySelector<HTMLDivElement>('#changePasswordMessage')!
const cartEmpty = document.querySelector<HTMLDivElement>('#cartEmpty')!
const cartContent = document.querySelector<HTMLDivElement>('#cartContent')!
const cartItems = document.querySelector<HTMLDivElement>('#cartItems')!
const customerSignedOut = document.querySelector<HTMLDivElement>('#customerSignedOut')!
const customerSignedIn = document.querySelector<HTMLDivElement>('#customerSignedIn')!
const policyAcknowledgment = document.querySelector<HTMLInputElement>('#policyAcknowledgment')!
const contactMethod = document.querySelector<HTMLSelectElement>('#contactMethod')!
const customerNotes = document.querySelector<HTMLTextAreaElement>('#customerNotes')!
const payNowButton = document.querySelector<HTMLButtonElement>('#payNowButton')!
const requestInvoiceButton = document.querySelector<HTMLButtonElement>('#requestInvoiceButton')!
const cartPayPanel = document.querySelector<HTMLElement>('#cartPayPanel')!
const cartPayPalButton = document.querySelector<HTMLElement>('#cartPayPalButton')!
const cartVenmoButton = document.querySelector<HTMLElement>('#cartVenmoButton')!
const cartZelleStartButton = document.querySelector<HTMLButtonElement>('#cartZelleStartButton')!
const cartZellePanel = document.querySelector<HTMLElement>('#cartZellePanel')!
const cartZelleDetails = document.querySelector<HTMLElement>('#cartZelleDetails')!
const cartZelleConfirmation = document.querySelector<HTMLInputElement>('#cartZelleConfirmation')!
const cartZelleSubmitButton = document.querySelector<HTMLButtonElement>('#cartZelleSubmitButton')!
const cartZelleMessage = document.querySelector<HTMLElement>('#cartZelleMessage')!
const cartPayMessage = document.querySelector<HTMLElement>('#cartPayMessage')!
const invoiceRequestMessage = document.querySelector<HTMLDivElement>('#invoiceRequestMessage')!
const invoiceSuccess = document.querySelector<HTMLDivElement>('#invoiceSuccess')!
const payNowSuccess = document.querySelector<HTMLDivElement>('#payNowSuccess')!
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


function showLoginView() {
  loginForm.hidden = false
  forgotPasswordForm.hidden = true
  recoveryPasswordForm.hidden = true
}

function showForgotPasswordView() {
  loginForm.hidden = true
  forgotPasswordForm.hidden = false
  recoveryPasswordForm.hidden = true
  forgotPasswordEmail.value = loginEmail.value.trim()
  forgotPasswordMessage.textContent = ''
}

function showRecoveryPasswordView() {
  loginForm.hidden = true
  forgotPasswordForm.hidden = true
  recoveryPasswordForm.hidden = false
  signedOutView.hidden = false
  signedInView.hidden = true
  recoveryPasswordMessage.textContent = ''
  if (!accountDialog.open) accountDialog.showModal()
}

async function maybeClaimStoredReferral() {
  const referralCode = window.localStorage.getItem('sbh_referral_code')?.trim()
  if (!referralCode) return

  try {
    await claimReferral(referralCode)
    window.localStorage.removeItem('sbh_referral_code')

    const url = new URL(window.location.href)
    url.searchParams.delete('ref')
    window.history.replaceState({}, document.title, url.pathname + url.search + url.hash)
    showToast('Referral connected')
  } catch (error) {
    console.info('Referral attribution unavailable', error)
  }
}

function referralStatusLabel(status: string) {
  const normalized = status.toLowerCase()
  if (normalized === 'qualified') return 'Qualified'
  if (normalized === 'registered') return 'Registered'
  return 'Pending'
}

async function openReferralDashboard() {
  if (menuDialog.open) menuDialog.close()
  if (!referralDialog.open) referralDialog.showModal()

  if (!currentProfile) {
    referralDialogContent.innerHTML = `
      <span class="eyebrow">REFERRAL LAB</span>
      <h3>Refer a Friend</h3>
      <p>Sign in to access your personal referral code, rewards, and referral progress.</p>
      <button id="referralSignInButton" class="auth-primary referral-action" type="button">Sign In</button>
    `
    document.querySelector<HTMLButtonElement>('#referralSignInButton')?.addEventListener('click', () => {
      referralDialog.close()
      accountDialog.showModal()
    })
    return
  }

  referralDialogContent.innerHTML = `
    <div class="referral-loading">
      <div class="loader"></div>
      <p>Loading your referral lab…</p>
    </div>
  `

  try {
    referralDashboard = await getReferralDashboard()
  } catch (error) {
    referralDialogContent.innerHTML = `
      <span class="eyebrow">REFERRAL LAB</span>
      <h3>Referral dashboard unavailable.</h3>
      <p>${escapeHtml(error instanceof Error ? error.message : 'Please try again.')}</p>
    `
    return
  }

  const data = referralDashboard
  const referralLink = buildReferralLink(data.referralCode)
  const nextThreshold = data.nextMilestone?.threshold || 20
  const progress = Math.min(100, Math.round((data.qualifiedCount / nextThreshold) * 100))

  const milestones = data.milestones.map(milestone => `
    <div class="referral-milestone ${milestone.reached ? 'reached' : ''}">
      <div class="referral-milestone-count">${milestone.threshold}</div>
      <div>
        <strong>${escapeHtml(milestone.title)}</strong>
        <span>${escapeHtml(milestone.reward)}</span>
      </div>
      <b>${milestone.reached ? '✓' : ''}</b>
    </div>
  `).join('')

  const referralRows = data.referrals.length
    ? data.referrals.map(referral => `
        <div class="referral-row">
          <div>
            <strong>${escapeHtml(referral.name || 'Referral')}</strong>
            <small>${escapeHtml(historyDate(referral.referredAt))}</small>
          </div>
          <span class="referral-state ${referral.status === 'qualified' ? 'qualified' : ''}">
            ${escapeHtml(referralStatusLabel(referral.status))}
          </span>
        </div>
      `).join('')
    : '<div class="referral-empty">No referrals tracked yet. Share your link to get started.</div>'

  const availableRewards = data.availablePercentageRewards.length
    ? data.availablePercentageRewards.map(reward => `
        <div class="referral-reward-card">
          <div>
            <span>AVAILABLE</span>
            <strong>${escapeHtml(reward.title)}</strong>
            <small>${escapeHtml(reward.description || '')}</small>
          </div>
          <b>${reward.value}%</b>
        </div>
      `).join('')
    : '<div class="referral-empty">No percentage rewards available right now.</div>'

  referralDialogContent.innerHTML = `
    <div class="referral-dashboard">
      <div class="referral-hero">
        <span class="eyebrow">REFERRAL LAB</span>
        <h3>Refer a Friend</h3>
        <p>Share your Nexus referral link. Qualified referrals count toward your Science By HUGs rewards.</p>
      </div>

      <div class="referral-code-card">
        <span>Your Referral Code</span>
        <strong>${escapeHtml(data.referralCode)}</strong>
        <div class="referral-link">${escapeHtml(referralLink)}</div>
        <div class="referral-actions">
          <button id="copyReferralButton" class="auth-primary" type="button">Copy Link</button>
          <button id="shareReferralButton" class="auth-secondary" type="button">Share</button>
        </div>
      </div>

      <div class="referral-stats">
        <div><span>Qualified</span><strong>${data.qualifiedCount}</strong></div>
        <div><span>Pending</span><strong>${data.pendingCount}</strong></div>
        <div><span>Total</span><strong>${data.totalCount}</strong></div>
      </div>

      <div class="referral-earned-rewards">
        <div class="referral-section-title">Your Rewards</div>
        ${data.freeShippingActive ? '<div class="referral-benefit-chip">✓ Free Shipping Unlocked</div>' : ''}
        ${availableRewards}
      </div>

      <div class="referral-progress-card">
        <div>
          <span>Reward Progress</span>
          <strong>${data.nextMilestone ? `${data.qualifiedCount} / ${data.nextMilestone.threshold}` : 'All milestones reached'}</strong>
        </div>
        <div class="referral-progress"><i style="width:${progress}%"></i></div>
        <small>${
          data.nextMilestone
            ? `${Math.max(0, data.nextMilestone.threshold - data.qualifiedCount)} more qualified referral(s) until ${escapeHtml(data.nextMilestone.reward)}.`
            : 'You reached every current referral milestone.'
        }</small>
      </div>

      <div class="referral-milestones">
        <div class="referral-section-title">Reward Milestones</div>
        ${milestones}
      </div>

      <form id="trackReferralForm" class="referral-track-form">
        <div class="referral-section-title">Track a Friend</div>
        <p>Add someone you referred. This does not send them an email; it simply lets Nexus track their progress.</p>
        <label>
          Name
          <input id="referralName" type="text" maxlength="120" placeholder="Optional">
        </label>
        <label>
          Email
          <input id="referralEmail" type="email" autocomplete="email" required placeholder="friend@example.com">
        </label>
        <label class="referral-consent">
          <input id="referralConsent" type="checkbox" required>
          <span>I confirm that I have permission to provide this person's contact information to Science By HUGs for referral tracking purposes.</span>
        </label>
        <button id="trackReferralSubmit" class="auth-primary" type="submit">Track Referral</button>
        <div id="trackReferralMessage" class="auth-message"></div>
      </form>

      <div class="referral-history">
        <div class="referral-section-title">Your Referrals</div>
        ${referralRows}
      </div>
    </div>
  `

  document.querySelector<HTMLButtonElement>('#copyReferralButton')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(referralLink)
      showToast('Referral link copied')
    } catch {
      showToast('Could not copy referral link')
    }
  })

  const shareButton = document.querySelector<HTMLButtonElement>('#shareReferralButton')
  if (shareButton) {
    if (navigator.share) {
      shareButton.addEventListener('click', async () => {
        try {
          await navigator.share({
            title: 'Science By HUGs Nexus',
            text: 'Join me on Science By HUGs Nexus.',
            url: referralLink,
          })
        } catch {
          // User cancellation is intentionally silent.
        }
      })
    } else {
      shareButton.textContent = 'Copy Code'
      shareButton.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(data.referralCode)
          showToast('Referral code copied')
        } catch {
          showToast('Could not copy referral code')
        }
      })
    }
  }

  const trackForm = document.querySelector<HTMLFormElement>('#trackReferralForm')
  trackForm?.addEventListener('submit', async event => {
    event.preventDefault()
    const nameInput = document.querySelector<HTMLInputElement>('#referralName')!
    const emailInput = document.querySelector<HTMLInputElement>('#referralEmail')!
    const submitButton = document.querySelector<HTMLButtonElement>('#trackReferralSubmit')!
    const message = document.querySelector<HTMLElement>('#trackReferralMessage')!
    const consent = document.querySelector<HTMLInputElement>('#referralConsent')!

    message.textContent = ''

    if (!consent.checked) {
      message.textContent = 'Please confirm you have permission to provide this contact information.'
      return
    }
    submitButton.disabled = true
    submitButton.textContent = 'Saving…'

    try {
      const result = await submitReferral(
        nameInput.value.trim(),
        emailInput.value.trim(),
        consent.checked,
      )
      message.textContent = result.alreadyTracked
        ? 'That referral is already being tracked.'
        : 'Referral added to your dashboard.'
      showToast(result.alreadyTracked ? 'Referral already tracked' : 'Referral tracked')
      await openReferralDashboard()
    } catch (error) {
      message.textContent = error instanceof Error ? error.message : 'Could not save referral.'
      submitButton.disabled = false
      submitButton.textContent = 'Track Referral'
    }
  })
}

function openSupportDialog() {
  if (menuDialog.open) menuDialog.close()
  supportDialog.showModal()
}

async function downloadSupportContact() {
  const contactCardUrl = `${import.meta.env.BASE_URL}science-by-hugs-contact.vcf`
  downloadContactButton.disabled = true

  try {
    const response = await fetch(contactCardUrl, { cache: 'no-store' })
    if (!response.ok) throw new Error('Contact card could not be loaded.')

    const text = await response.text()
    if (!text.trim().startsWith('BEGIN:VCARD')) {
      throw new Error('Contact card response was not a valid vCard.')
    }

    const blob = new Blob([text], { type: 'text/vcard;charset=utf-8' })
    const objectUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = objectUrl
    link.download = 'Science-By-HUGs.vcf'
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
    showToast('Contact card downloaded')
  } catch (error) {
    console.error('Contact card download failed', error)
    showToast('Could not download contact card')
  } finally {
    downloadContactButton.disabled = false
  }
}

function openMenuInfo(kind: 'policies') {
  const copy = {
    policies: {
      eyebrow: 'POLICY LIBRARY',
      title: 'Science By HUGs Policies',
      body: 'Terms, privacy, shipping, returns/reships, and research-use policies will be organized here in one customer-facing library.',
    },
  }[kind]

  menuInfoPanel.innerHTML = `
    <span class="eyebrow">${copy.eyebrow}</span>
    <h3>${copy.title}</h3>
    <p>${copy.body}</p>
  `
  menuInfoPanel.hidden = false
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
            : '<img src="${brandMarkUrl}" alt="" class="fallback-mark" />'}
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
        : '<img src="${brandMarkUrl}" alt="" class="fallback-mark" />'}
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
  const quantity = cartQuantity(cart)
  cartCount.textContent = String(quantity)
  mobileCartCount.textContent = String(quantity)
  mobileCartCount.hidden = quantity === 0

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
    payNowButton.disabled = true
    requestInvoiceButton.disabled = true
    payNowButton.textContent = 'Pay Now'
    requestInvoiceButton.textContent = 'Request Invoice by Email'
    return
  }

  if (!currentProfile) {
    payNowButton.disabled = false
    requestInvoiceButton.disabled = false
    payNowButton.textContent = 'Sign In to Pay'
    requestInvoiceButton.textContent = 'Sign In to Request Invoice'
    return
  }

  const locked = Boolean(activeCheckoutOrder)
  payNowButton.textContent = locked ? 'Pay Now Order Started' : 'Pay Now'
  requestInvoiceButton.textContent = locked ? 'Pay Now Order Started' : 'Request Invoice by Email'
  payNowButton.disabled = !policyAcknowledgment.checked || locked
  requestInvoiceButton.disabled = !policyAcknowledgment.checked || locked
}

async function ensureCheckoutOrder() {
  if (activeCheckoutOrder) return activeCheckoutOrder

  const result = await createCheckoutOrder(cart, {
    policyAcknowledged: policyAcknowledgment.checked,
    contactMethod: contactMethod.value,
    customerNotes: customerNotes.value.trim(),
  })

  activeCheckoutOrder = result
  document.querySelector<HTMLElement>('#cartSubtotal')!.textContent = money(result.totals.subtotal)
  document.querySelector<HTMLElement>('#cartDiscount')!.textContent = '-' + money(result.totals.discount)
  document.querySelector<HTMLElement>('#cartShipping')!.textContent = money(result.totals.shipping)
  document.querySelector<HTMLElement>('#cartTax')!.textContent = money(result.totals.tax)
  document.querySelector<HTMLElement>('#cartTotal')!.textContent = money(result.totals.total)

  cartItems.querySelectorAll<HTMLButtonElement>('button').forEach(button => {
    button.disabled = true
  })
  updateRequestButton()
  return result
}

async function finishPayNow(
  title: string,
  copy: string,
) {
  const orderNumber = activeCheckoutOrder?.orderNumber || 'Pending'

  clearCart()
  cart = []
  policyAcknowledgment.checked = false
  customerNotes.value = ''
  cartPayPanel.hidden = true
  cartZellePanel.hidden = true
  cartContent.hidden = true
  cartEmpty.hidden = true

  document.querySelector<HTMLElement>('#payNowSuccessTitle')!.textContent = title
  document.querySelector<HTMLElement>('#payNowSuccessCopy')!.textContent = copy
  document.querySelector<HTMLElement>('#payNowOrderNumber')!.textContent = orderNumber
  invoiceSuccess.hidden = true
  payNowSuccess.hidden = false

  activeCheckoutOrder = null
  updateCartUI()
  await refreshOrderHistory()
}

async function setupCartPayNow() {
  cartPayMessage.textContent = ''

  try {
    const sdk = await getPayPalSdk()
    const methods = await sdk.findEligibleMethods({ currencyCode: 'USD' })
    const paypalEligible = methods.isEligible('paypal')
    const venmoEligible = methods.isEligible('venmo')

    const paypalSession = sdk.createPayPalOneTimePaymentSession({
      onApprove: async ({ orderId: paypalOrderId }: { orderId: string }) => {
        if (!activeCheckoutOrder) return
        cartPayMessage.textContent = 'Finalizing PayPal payment…'
        try {
          await capturePayPalOrder(activeCheckoutOrder.orderId, paypalOrderId, 'PayPal')
          await finishPayNow(
            'Payment received.',
            'Your PayPal payment was verified and your order is now processing.',
          )
        } catch (error) {
          cartPayMessage.textContent =
            error instanceof Error ? error.message : 'PayPal capture failed.'
        }
      },
      onCancel: () => {
        cartPayMessage.textContent = 'PayPal checkout was cancelled. You can choose another option.'
      },
      onError: (error: unknown) => {
        console.error('Cart PayPal checkout error', error)
        cartPayMessage.textContent = 'PayPal checkout could not be completed.'
      },
    })

    const venmoSession = sdk.createVenmoOneTimePaymentSession({
      onApprove: async ({ orderId: paypalOrderId }: { orderId: string }) => {
        if (!activeCheckoutOrder) return
        cartPayMessage.textContent = 'Finalizing Venmo payment…'
        try {
          await capturePayPalOrder(activeCheckoutOrder.orderId, paypalOrderId, 'Venmo')
          await finishPayNow(
            'Payment received.',
            'Your Venmo payment was verified and your order is now processing.',
          )
        } catch (error) {
          cartPayMessage.textContent =
            error instanceof Error ? error.message : 'Venmo capture failed.'
        }
      },
      onCancel: () => {
        cartPayMessage.textContent = 'Venmo checkout was cancelled. You can choose another option.'
      },
      onError: (error: unknown) => {
        console.error('Cart Venmo checkout error', error)
        cartPayMessage.textContent = 'Venmo checkout could not be completed.'
      },
    })

    if (paypalEligible) {
      cartPayPalButton.hidden = false
      if (!cartPayPalButton.dataset.bound) {
        cartPayPalButton.dataset.bound = 'true'
        cartPayPalButton.addEventListener('click', async () => {
          cartPayMessage.textContent = 'Preparing secure PayPal checkout…'
          try {
            const checkout = await ensureCheckoutOrder()
            const paypalOrder = await createPayPalOrder(checkout.orderId, 'PayPal')
            await paypalSession.start(
              { presentationMode: 'auto' },
              Promise.resolve({ orderId: paypalOrder.orderId }),
            )
          } catch (error) {
            cartPayMessage.textContent =
              error instanceof Error ? error.message : 'Could not start PayPal checkout.'
          }
        })
      }
    }

    if (venmoEligible) {
      cartVenmoButton.hidden = false
      if (!cartVenmoButton.dataset.bound) {
        cartVenmoButton.dataset.bound = 'true'
        cartVenmoButton.addEventListener('click', async () => {
          cartPayMessage.textContent = 'Preparing secure Venmo checkout…'
          try {
            const checkout = await ensureCheckoutOrder()
            const paypalOrder = await createPayPalOrder(checkout.orderId, 'Venmo')
            await venmoSession.start(
              { presentationMode: 'auto' },
              Promise.resolve({ orderId: paypalOrder.orderId }),
            )
          } catch (error) {
            cartPayMessage.textContent =
              error instanceof Error ? error.message : 'Could not start Venmo checkout.'
          }
        })
      }
    }

    if (!paypalEligible && !venmoEligible) {
      cartPayMessage.textContent = 'PayPal and Venmo are unavailable for this session.'
    }
  } catch (error) {
    console.error('Cart wallet setup unavailable', error)
    cartPayMessage.textContent = 'PayPal/Venmo are unavailable right now.'
  }

  try {
    const zelle = await getZelleConfig()
    cartZelleStartButton.hidden = false

    if (!cartZelleStartButton.dataset.bound) {
      cartZelleStartButton.dataset.bound = 'true'
      cartZelleStartButton.addEventListener('click', async () => {
        cartZelleStartButton.disabled = true
        cartZelleStartButton.textContent = 'Preparing Zelle…'
        try {
          const checkout = await ensureCheckoutOrder()
          cartZelleDetails.innerHTML = `
            <div><span>Recipient</span><strong>${escapeHtml(zelle.displayName)}</strong></div>
            <div><span>Send to</span><strong>${escapeHtml(zelle.contact)}</strong></div>
            <div><span>Exact total</span><strong>${money(checkout.totals.total)}</strong></div>
          `
          cartZellePanel.hidden = false
          cartZelleStartButton.hidden = true
        } catch (error) {
          cartZelleStartButton.disabled = false
          cartZelleStartButton.textContent = 'Pay with Zelle'
          cartPayMessage.textContent =
            error instanceof Error ? error.message : 'Could not prepare Zelle payment.'
        }
      })
    }

    if (!cartZelleSubmitButton.dataset.bound) {
      cartZelleSubmitButton.dataset.bound = 'true'
      cartZelleSubmitButton.addEventListener('click', async () => {
        if (!activeCheckoutOrder) return

        const confirmed = window.confirm(
          'Confirm that you already sent the Zelle payment?\n\nThis submits the payment for manual verification. It does not mark the order paid.'
        )
        if (!confirmed) return

        cartZelleSubmitButton.disabled = true
        cartZelleSubmitButton.textContent = 'Submitting…'
        cartZelleMessage.textContent = 'Submitting Zelle payment for verification…'

        try {
          await submitZellePayment(
            activeCheckoutOrder.orderId,
            cartZelleConfirmation.value.trim(),
          )
          await finishPayNow(
            'Payment submitted.',
            'Your Zelle payment is waiting for Science By HUGs verification before processing.',
          )
        } catch (error) {
          cartZelleMessage.textContent =
            error instanceof Error ? error.message : 'Could not submit Zelle payment.'
          cartZelleSubmitButton.disabled = false
          cartZelleSubmitButton.textContent = 'I Sent the Zelle Payment'
        }
      })
    }
  } catch (error) {
    console.info('Cart Zelle setup unavailable', error)
  }
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
    checkout_pending: 'Awaiting payment',
    processing: 'Processing',
    ordered: 'Ordered',
    shipped: 'Shipped',
    delivered: 'Delivered',
    delayed: 'Delayed',
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
    const invoiceSent = order.invoice?.send_status === 'sent'
    const directCheckout = order.invoice?.status === 'direct_checkout'
    const paymentVerified =
      order.payment?.status === 'verified' ||
      order.payment_status === 'paid'
    const paymentSubmitted =
      order.payment?.status === 'submitted' &&
      !paymentVerified

    const fulfillmentStatus =
      ['ordered', 'shipped', 'delivered', 'delayed', 'cancelled'].includes(order.status)
        ? friendlyOrderStatus(order.status)
        : 'Paid · Processing'

    const status =
      paymentVerified
        ? fulfillmentStatus
        : paymentSubmitted
          ? 'Payment submitted'
          : friendlyOrderStatus(order.status)

    const items = order.items.map(item => `
      <div class="history-line">
        <span>${escapeHtml(item.product_name)} <small>× ${item.quantity}</small></span>
        <strong>${money(item.line_total)}</strong>
      </div>
    `).join('')

    const paymentText =
      paymentVerified
        ? `Paid${order.payment?.provider ? ` via ${order.payment.provider}` : ''}`
        : paymentSubmitted
          ? `Submitted${order.payment?.provider ? ` via ${order.payment.provider}` : ''} · awaiting verification`
          : invoiceSent || directCheckout
            ? 'Waiting for payment'
            : 'Payment opens after invoice delivery'

    return `
      <article class="history-card">
        <div class="history-card-top">
          <div>
            <span class="history-number">${escapeHtml(invoiceLabel)}</span>
            <small>${escapeHtml(historyDate(order.created_at))}</small>
          </div>
          <span class="history-status ${order.status === 'delayed' ? 'delayed' : order.status === 'cancelled' ? 'cancelled' : order.status === 'delivered' ? 'paid' : paymentVerified ? 'paid' : paymentSubmitted ? 'submitted' : invoiceSent ? 'sent' : ''}">
            ${escapeHtml(status)}
          </span>
        </div>

        <div class="history-lines">${items || '<span class="history-muted">Item details unavailable.</span>'}</div>

        <div class="history-total">
          <span>Total</span>
          <strong>${money(order.total)}</strong>
        </div>

        ${order.invoice ? `
          <div class="history-invoice">
            <span>${directCheckout ? 'Order type' : 'Invoice status'}</span>
            <strong>${escapeHtml(
              directCheckout
                ? 'Pay Now'
                : invoiceSent
                  ? 'Sent by email'
                  : order.invoice.pdf_status === 'created'
                    ? 'PDF ready'
                    : friendlyOrderStatus(order.invoice.status)
            )}</strong>
          </div>
        ` : ''}

        ${directCheckout && order.invoice?.pdf_status === 'created' ? `
          <button
            class="history-pdf-button"
            type="button"
            data-invoice-pdf-id="${escapeHtml(order.invoice.id)}"
          >
            View Invoice PDF
          </button>
        ` : ''}

        <div class="history-payment ${paymentVerified ? 'paid' : paymentSubmitted ? 'submitted' : ''}">
          <div>
            <span>Payment status</span>
            <strong>${escapeHtml(paymentText)}</strong>
          </div>
          ${paymentVerified && (order.payment?.verified_at || order.paid_at) ? `
            <small>Verified ${escapeHtml(historyDate(order.payment?.verified_at || order.paid_at || order.created_at))}</small>
          ` : ''}
        </div>

        ${(invoiceSent || directCheckout) && !paymentVerified && !paymentSubmitted ? `
          <div class="history-paypal-shell">
            <div>
              <span class="eyebrow">PAY SECURELY</span>
              <strong>PayPal or Venmo Sandbox</strong>
              <small>Choose an eligible payment method. No live money is moved while Sandbox mode is enabled.</small>
            </div>
            <div class="nexus-wallet-buttons">
              <paypal-button
                class="nexus-paypal-button"
                data-order-id="${escapeHtml(order.id)}"
                hidden
              ></paypal-button>
              <venmo-button
                class="nexus-venmo-button"
                data-order-id="${escapeHtml(order.id)}"
                type="pay"
                hidden
              ></venmo-button>
            </div>
            <div class="paypal-message" data-paypal-message="${escapeHtml(order.id)}"></div>
            <div class="zelle-shell" data-zelle-shell="${escapeHtml(order.id)}" hidden>
              <div class="zelle-head">
                <strong>Pay with Zelle</strong>
                <small>Send the exact invoice total, then report the payment below.</small>
              </div>
              <div class="zelle-details" data-zelle-details="${escapeHtml(order.id)}"></div>
              <label class="zelle-confirmation-label">
                Confirmation / reference
                <input
                  class="zelle-confirmation"
                  data-zelle-confirmation="${escapeHtml(order.id)}"
                  type="text"
                  maxlength="120"
                  placeholder="Optional"
                >
              </label>
              <button
                class="zelle-submit-button"
                data-zelle-submit="${escapeHtml(order.id)}"
                type="button"
              >
                I Sent the Zelle Payment
              </button>
              <div class="zelle-message" data-zelle-message="${escapeHtml(order.id)}"></div>
            </div>
          </div>
        ` : ''}
      </article>
    `
  }).join('')

  accountHistoryList.querySelectorAll<HTMLButtonElement>('[data-invoice-pdf-id]').forEach(button => {
    button.addEventListener('click', async () => {
      const invoiceId = button.dataset.invoicePdfId
      if (!invoiceId) return

      const popup = window.open('', '_blank')
      const original = button.textContent
      button.disabled = true
      button.textContent = 'Opening PDF…'

      try {
        const result = await getInvoicePdfLink(invoiceId)
        if (popup) popup.location.href = result.url
        else window.location.href = result.url
      } catch (error) {
        if (popup) popup.close()
        showToast(error instanceof Error ? error.message : 'Could not open invoice PDF')
      } finally {
        button.disabled = false
        button.textContent = original || 'View Invoice PDF'
      }
    })
  })

  void Promise.all([
    setupPayPalCheckout(),
    setupZelleCheckout(),
  ])
}

async function setupPayPalCheckout() {
  const paypalButtons = [
    ...document.querySelectorAll<HTMLElement>('.nexus-paypal-button'),
  ]
  const venmoButtons = [
    ...document.querySelectorAll<HTMLElement>('.nexus-venmo-button'),
  ]

  if (!paypalButtons.length && !venmoButtons.length) return

  try {
    const sdk = await getPayPalSdk()
    const methods = await sdk.findEligibleMethods({ currencyCode: 'USD' })
    const paypalEligible = methods.isEligible('paypal')
    const venmoEligible = methods.isEligible('venmo')

    const setupButton = (
      button: HTMLElement,
      paymentMethod: 'PayPal' | 'Venmo',
    ) => {
      const orderId = button.dataset.orderId
      if (!orderId) return

      const message = document.querySelector<HTMLElement>(
        `[data-paypal-message="${CSS.escape(orderId)}"]`,
      )

      const session =
        paymentMethod === 'Venmo'
          ? sdk.createVenmoOneTimePaymentSession({
              onApprove: async ({ orderId: paypalOrderId }: { orderId: string }) => {
                if (message) message.textContent = 'Finalizing Venmo payment…'

                try {
                  await capturePayPalOrder(orderId, paypalOrderId, 'Venmo')
                  if (message) message.textContent = 'Venmo payment completed.'
                  showToast('Venmo payment completed')
                  await refreshOrderHistory()
                } catch (error) {
                  if (message) {
                    message.textContent =
                      error instanceof Error ? error.message : 'Venmo capture failed.'
                  }
                }
              },
              onCancel: () => {
                if (message) message.textContent = 'Venmo checkout was cancelled.'
              },
              onError: (error: unknown) => {
                console.error('Venmo checkout error', error)
                if (message) message.textContent = 'Venmo checkout could not be completed.'
              },
            })
          : sdk.createPayPalOneTimePaymentSession({
              onApprove: async ({ orderId: paypalOrderId }: { orderId: string }) => {
                if (message) message.textContent = 'Finalizing PayPal payment…'

                try {
                  await capturePayPalOrder(orderId, paypalOrderId, 'PayPal')
                  if (message) message.textContent = 'PayPal payment completed.'
                  showToast('PayPal payment completed')
                  await refreshOrderHistory()
                } catch (error) {
                  if (message) {
                    message.textContent =
                      error instanceof Error ? error.message : 'PayPal capture failed.'
                  }
                }
              },
              onCancel: () => {
                if (message) message.textContent = 'PayPal checkout was cancelled.'
              },
              onError: (error: unknown) => {
                console.error('PayPal checkout error', error)
                if (message) message.textContent = 'PayPal checkout could not be completed.'
              },
            })

      button.hidden = false
      button.addEventListener('click', async () => {
        if (message) {
          message.textContent =
            paymentMethod === 'Venmo'
              ? 'Opening Venmo Sandbox…'
              : 'Opening PayPal Sandbox…'
        }

        try {
          const paypalOrder = await createPayPalOrder(orderId, paymentMethod)
          await session.start(
            { presentationMode: 'auto' },
            Promise.resolve({ orderId: paypalOrder.orderId }),
          )
        } catch (error) {
          if (message) {
            message.textContent =
              error instanceof Error
                ? error.message
                : `Could not start ${paymentMethod} checkout.`
          }
        }
      })
    }

    if (paypalEligible) {
      paypalButtons.forEach(button => setupButton(button, 'PayPal'))
    } else {
      paypalButtons.forEach(button => {
        button.hidden = true
      })
    }

    if (venmoEligible) {
      venmoButtons.forEach(button => setupButton(button, 'Venmo'))
    } else {
      venmoButtons.forEach(button => {
        button.hidden = true
      })
    }

    if (!paypalEligible && !venmoEligible) {
      paypalButtons.forEach(button => {
        const orderId = button.dataset.orderId || ''
        const message = document.querySelector<HTMLElement>(
          `[data-paypal-message="${CSS.escape(orderId)}"]`,
        )
        if (message) {
          message.textContent = 'PayPal and Venmo are not available for this session.'
        }
      })
    } else if (!venmoEligible) {
      venmoButtons.forEach(button => {
        const orderId = button.dataset.orderId || ''
        const message = document.querySelector<HTMLElement>(
          `[data-paypal-message="${CSS.escape(orderId)}"]`,
        )
        if (message && !message.textContent) {
          message.textContent = 'Venmo is unavailable on this device/session; PayPal is still available.'
        }
      })
    }
  } catch (error) {
    console.error('PayPal/Venmo setup unavailable', error)

    ;[...paypalButtons, ...venmoButtons].forEach(button => {
      const orderId = button.dataset.orderId || ''
      const message = document.querySelector<HTMLElement>(
        `[data-paypal-message="${CSS.escape(orderId)}"]`,
      )
      if (message) {
        message.textContent = 'PayPal/Venmo Sandbox setup is unavailable right now.'
      }
    })
  }
}


async function setupZelleCheckout() {
  const shells = [
    ...document.querySelectorAll<HTMLElement>('[data-zelle-shell]'),
  ]
  if (!shells.length) return

  try {
    const config = await getZelleConfig()

    shells.forEach(shell => {
      const orderId = shell.dataset.zelleShell
      if (!orderId) return

      const details = document.querySelector<HTMLElement>(
        `[data-zelle-details="${CSS.escape(orderId)}"]`,
      )
      const input = document.querySelector<HTMLInputElement>(
        `[data-zelle-confirmation="${CSS.escape(orderId)}"]`,
      )
      const button = document.querySelector<HTMLButtonElement>(
        `[data-zelle-submit="${CSS.escape(orderId)}"]`,
      )
      const message = document.querySelector<HTMLElement>(
        `[data-zelle-message="${CSS.escape(orderId)}"]`,
      )

      if (details) {
        details.innerHTML = `
          <div><span>Recipient</span><strong>${escapeHtml(config.displayName)}</strong></div>
          <div><span>Send to</span><strong>${escapeHtml(config.contact)}</strong></div>
          ${config.qrUrl ? `<img src="${escapeHtml(config.qrUrl)}" alt="Zelle QR code">` : ''}
        `
      }

      shell.hidden = false

      button?.addEventListener('click', async () => {
        const confirmed = window.confirm(
          'Confirm that you already sent the Zelle payment?\n\nThis does not mark the order paid. Science By HUGs will verify it before processing.'
        )
        if (!confirmed) return

        button.disabled = true
        button.textContent = 'Submitting…'
        if (message) message.textContent = 'Sending payment notice to Science By HUGs…'

        try {
          await submitZellePayment(orderId, input?.value.trim() || '')
          if (message) message.textContent = 'Payment submitted for verification.'
          showToast('Zelle payment submitted')
          await refreshOrderHistory()
        } catch (error) {
          if (message) {
            message.textContent =
              error instanceof Error ? error.message : 'Could not submit Zelle payment.'
          }
          button.disabled = false
          button.textContent = 'I Sent the Zelle Payment'
        }
      })
    })
  } catch (error) {
    console.info('Zelle setup unavailable', error)
  }
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

  if (recoveryMode) {
    currentProfile = null
    showRecoveryPasswordView()
    updateCheckoutCustomer()
    updateCartUI()
    return
  }

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
  if (event.target === accountDialog && !recoveryMode) accountDialog.close()
})
menuDialog.addEventListener('click', event => {
  if (event.target === menuDialog) menuDialog.close()
})
supportDialog.addEventListener('click', event => {
  if (event.target === supportDialog) supportDialog.close()
})
referralDialog.addEventListener('click', event => {
  if (event.target === referralDialog) referralDialog.close()
})

document.querySelector<HTMLButtonElement>('#closeDialog')!.addEventListener('click', () => productDialog.close())
document.querySelector<HTMLButtonElement>('#closeCartDialog')!.addEventListener('click', () => cartDialog.close())
document.querySelector<HTMLButtonElement>('#closeAccountDialog')!.addEventListener('click', () => {
  if (!recoveryMode) accountDialog.close()
})
document.querySelector<HTMLButtonElement>('#closeMenuDialog')!.addEventListener('click', () => menuDialog.close())
document.querySelector<HTMLButtonElement>('#closeSupportDialog')!.addEventListener('click', () => supportDialog.close())
document.querySelector<HTMLButtonElement>('#closeReferralDialog')!.addEventListener('click', () => referralDialog.close())
downloadContactButton.addEventListener('click', () => {
  void downloadSupportContact()
})
document.querySelector<HTMLButtonElement>('#successCloseButton')!.addEventListener('click', () => cartDialog.close())
document.querySelector<HTMLButtonElement>('#payNowSuccessCloseButton')!.addEventListener('click', () => cartDialog.close())

menuButton.addEventListener('click', () => {
  menuInfoPanel.hidden = true
  menuDialog.showModal()
})

menuDialog.querySelectorAll<HTMLButtonElement>('[data-menu-target]').forEach(button => {
  button.addEventListener('click', () => {
    const target = button.dataset.menuTarget

    if (target === 'catalog') {
      menuDialog.close()
      document.querySelector('.catalog-shell')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }

    if (target === 'account') {
      menuDialog.close()
      accountDialog.showModal()
      return
    }

    if (target === 'referral') {
      void openReferralDashboard()
      return
    }

    if (target === 'support') {
      openSupportDialog()
      return
    }

    if (target === 'policies') {
      openMenuInfo(target)
    }
  })
})

accountButton.addEventListener('click', () => {
  openAccountDialog()
})

function openCartDialog() {
  invoiceSuccess.hidden = true
  payNowSuccess.hidden = true
  cartEmpty.hidden = cart.length > 0
  cartContent.hidden = cart.length === 0
  cartDialog.showModal()
}

function openAccountDialog() {
  if (!recoveryMode) showLoginView()
  accountDialog.showModal()
}

function setMobileNavActive(active: 'home' | 'account' | 'support' | 'cart') {
  const items = [
    [mobileHomeButton, 'home'],
    [mobileAccountButton, 'account'],
    [mobileSupportButton, 'support'],
    [mobileCartButton, 'cart'],
  ] as const

  items.forEach(([button, key]) => {
    button.classList.toggle('active', key === active)
  })
}

mobileHomeButton.addEventListener('click', () => {
  setMobileNavActive('home')
  window.scrollTo({ top: 0, behavior: 'smooth' })
})

mobileAccountButton.addEventListener('click', () => {
  setMobileNavActive('account')
  openAccountDialog()
})

mobileSupportButton.addEventListener('click', () => {
  setMobileNavActive('support')
  openSupportDialog()
})

mobileCartButton.addEventListener('click', () => {
  setMobileNavActive('cart')
  openCartDialog()
})

cartButton.addEventListener('click', () => {
  invoiceSuccess.hidden = true
  payNowSuccess.hidden = true
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

payNowButton.addEventListener('click', async () => {
  invoiceSuccess.hidden = true
  payNowSuccess.hidden = true
  if (!currentProfile) {
    cartDialog.close()
    accountDialog.showModal()
    return
  }

  if (!policyAcknowledgment.checked) {
    showToast('Please acknowledge the policies first.')
    return
  }

  cartPayPanel.hidden = false
  cartPayPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  await setupCartPayNow()
})

refreshHistoryButton.addEventListener('click', () => {
  void refreshOrderHistory()
})

requestInvoiceButton.addEventListener('click', async () => {
  cartPayPanel.hidden = true
  cartZellePanel.hidden = true
  payNowSuccess.hidden = true
  invoiceSuccess.hidden = true
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

    payNowSuccess.hidden = true
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
    requestInvoiceButton.textContent = currentProfile ? 'Request Invoice by Email' : 'Sign In to Request Invoice'
  }
})


forgotPasswordButton.addEventListener('click', () => {
  showForgotPasswordView()
})

forgotPasswordBack.addEventListener('click', () => {
  showLoginView()
})

forgotPasswordForm.addEventListener('submit', async event => {
  event.preventDefault()
  forgotPasswordMessage.textContent = ''
  forgotPasswordSubmit.disabled = true
  forgotPasswordSubmit.textContent = 'Sending…'

  try {
    await requestPasswordReset(forgotPasswordEmail.value)
    forgotPasswordMessage.textContent =
      'If that email is connected to a Nexus account, a secure reset link has been sent.'
    forgotPasswordSubmit.textContent = 'Email Sent'
  } catch (error) {
    forgotPasswordMessage.textContent =
      error instanceof Error ? error.message : 'Could not send the reset email.'
    forgotPasswordSubmit.disabled = false
    forgotPasswordSubmit.textContent = 'Send Reset Email'
  }
})

recoveryPasswordForm.addEventListener('submit', async event => {
  event.preventDefault()
  recoveryPasswordMessage.textContent = ''

  if (recoveryPassword.value.length < 10) {
    recoveryPasswordMessage.textContent = 'Use at least 10 characters.'
    return
  }

  if (recoveryPassword.value !== recoveryPasswordConfirm.value) {
    recoveryPasswordMessage.textContent = 'The new passwords do not match.'
    return
  }

  recoveryPasswordSubmit.disabled = true
  recoveryPasswordSubmit.textContent = 'Updating…'

  try {
    await updatePassword(recoveryPassword.value)
    recoveryPassword.value = ''
    recoveryPasswordConfirm.value = ''
    recoveryMode = false
    const cleanUrl = new URL(window.location.href)
    cleanUrl.searchParams.delete('mode')
    window.history.replaceState({}, document.title, cleanUrl.pathname + cleanUrl.search + cleanUrl.hash)
    await refreshAccount()
    showToast('Password updated successfully')
    if (accountDialog.open) accountDialog.close()
  } catch (error) {
    recoveryPasswordMessage.textContent =
      error instanceof Error ? error.message : 'Could not update the password.'
  } finally {
    recoveryPasswordSubmit.disabled = false
    recoveryPasswordSubmit.textContent = 'Set New Password'
  }
})

changePasswordForm.addEventListener('submit', async event => {
  event.preventDefault()
  changePasswordMessage.textContent = ''

  if (newPassword.value.length < 10) {
    changePasswordMessage.textContent = 'Use at least 10 characters for the new password.'
    return
  }

  if (newPassword.value !== confirmNewPassword.value) {
    changePasswordMessage.textContent = 'The new passwords do not match.'
    return
  }

  if (currentPassword.value === newPassword.value) {
    changePasswordMessage.textContent = 'Choose a new password that is different from your current password.'
    return
  }

  changePasswordSubmit.disabled = true
  changePasswordSubmit.textContent = 'Changing…'

  try {
    await changePassword(currentPassword.value, newPassword.value)
    currentPassword.value = ''
    newPassword.value = ''
    confirmNewPassword.value = ''
    changePasswordMessage.textContent = 'Password changed successfully.'
    showToast('Password changed')
  } catch (error) {
    changePasswordMessage.textContent =
      error instanceof Error ? error.message : 'Could not change the password.'
  } finally {
    changePasswordSubmit.disabled = false
    changePasswordSubmit.textContent = 'Change Password'
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

onAuthChange((event) => {
  if (event === 'PASSWORD_RECOVERY') {
    recoveryMode = true
    showRecoveryPasswordView()
    return
  }

  if (!recoveryMode) {
    void refreshAccount()
  }
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
