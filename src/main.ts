import './styles.css'

const app = document.querySelector<HTMLDivElement>('#app')

if (!app) throw new Error('App root not found')

app.innerHTML = `
      <div class="stars"></div>
      <main class="shell">
        <section class="hero">
          <div class="eyebrow">SCIENCE BY HUGs</div>
          <h1>NEXUS</h1>
          <p class="tagline">Explore. Connect. Order.</p>
          <p class="copy">Your gateway to the Science By HUGs research catalog, account, orders, invoices, memberships, and referrals.</p>
          <div class="actions">
            <button class="primary">Enter Nexus</button>
            <button class="secondary">View Catalog</button>
          </div>
        </section>
        <section class="grid">
          <article><span>01</span><h2>Research Catalog</h2><p>Live product data synced through Supabase.</p></article>
          <article><span>02</span><h2>Account</h2><p>Secure profiles, memberships, referrals, and order history.</p></article>
          <article><span>03</span><h2>Orders</h2><p>A streamlined path from discovery to invoice.</p></article>
        </section>
      </main>`
