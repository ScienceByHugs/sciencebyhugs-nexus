import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.117.1";

const APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbzvED4G5C_Lm14qxv0BY8uhsv1tRtON6_sempQu2Zn0B3IxE_mBkfAmNh7mIZsq-icsGA/exec";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://nexus.sciencebyhugs.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SHIPPING_RATES: Record<string, number> = {
  "Shipping - Emlin (L)": 70,
  "Shipping - Emlin (S)": 50,
  "Shipping - Emlin (US)": 20,
  "Shipping - Amazon": 3,
  "Shipping - Ella (US)": 20,
  "Shipping - Ella (CN)": 50,
  "Shipping Gigi": 16,
  "Shipping": 0,
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const money = (value: number) => Math.round(value * 100) / 100;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Authentication required" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const publishableKeys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")!);
  const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")!);

  const userClient = createClient(
    supabaseUrl,
    publishableKeys.default,
    {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );

  const admin = createClient(
    supabaseUrl,
    secretKeys.default,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return json({ error: "Invalid session" }, 401);
  if (!user.email_confirmed_at) return json({ error: "Verified email required" }, 403);

  let body: {
    items?: Array<{ productId?: string; quantity?: number }>;
    policyAcknowledged?: boolean;
    contactMethod?: string | null;
    customerNotes?: string | null;
    paymentMethod?: string | null;
  };

  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }

  if (body.policyAcknowledged !== true) {
    return json({ error: "Policy acknowledgment is required" }, 400);
  }

  const requestedPaymentMethod = String(body.paymentMethod || "").trim().toLowerCase();
  const paymentMethod =
    requestedPaymentMethod === "paypal" ? "PayPal" :
    requestedPaymentMethod === "venmo" ? "Venmo" :
    requestedPaymentMethod === "apple pay" || requestedPaymentMethod === "applepay" ? "Apple Pay" :
    requestedPaymentMethod === "zelle" ? "Zelle" :
    null;

  if (!paymentMethod) {
    return json({ error: "Choose PayPal, Venmo, Apple Pay, or Zelle before starting checkout" }, 400);
  }

  const requestedItems = Array.isArray(body.items) ? body.items : [];
  if (!requestedItems.length) return json({ error: "Your cart is empty" }, 400);
  if (requestedItems.length > 5) {
    return json({ error: "Please limit an order to 5 different products" }, 400);
  }

  const quantityById = new Map<string, number>();
  for (const item of requestedItems) {
    const id = String(item.productId || "").trim();
    const quantity = Number(item.quantity);
    if (!id || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      return json({ error: "Invalid cart item" }, 400);
    }
    quantityById.set(id, (quantityById.get(id) || 0) + quantity);
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id,customer_number,first_name,last_name,email,phone,account_status,memberships(name)")
    .eq("auth_user_id", user.id)
    .single();

  if (profileError || !profile) return json({ error: "Customer profile not found" }, 404);
  if (String(profile.account_status || "").toLowerCase() !== "active") {
    return json({ error: "This customer account is not active" }, 403);
  }

  const productIds = [...quantityById.keys()];
  const { data: products, error: productError } = await admin
    .from("products")
    .select("id,name,product_code,price,active,storefront_status,shipping_from")
    .in("id", productIds);

  if (productError) return json({ error: "Catalog validation failed" }, 500);
  if (!products || products.length !== productIds.length) {
    return json({ error: "One or more products are no longer available" }, 409);
  }

  const validatedItems = [];
  for (const product of products) {
    if (!product.active || String(product.storefront_status || "").toLowerCase() !== "available") {
      return json({ error: `${product.name} is no longer available` }, 409);
    }

    const quantity = quantityById.get(product.id)!;
    const unitPrice = Number(product.price || 0);
    validatedItems.push({
      productId: product.id,
      productCode: product.product_code,
      productName: product.name,
      quantity,
      unitPrice,
      lineTotal: money(unitPrice * quantity),
      shippingFrom: product.shipping_from || "",
    });
  }

  const subtotal = money(validatedItems.reduce((sum, item) => sum + item.lineTotal, 0));
  const discount = 0;
  const membershipName = String(profile.memberships?.name || "");
  const isFoundingMember = membershipName.trim().toLowerCase() === "founding member";

  const shippingSources = new Set(
    validatedItems.map(item => item.shippingFrom.trim()).filter(Boolean),
  );

  let shipping = 0;
  for (const source of shippingSources) {
    if (isFoundingMember && source.toLowerCase() === "shipping gigi") continue;
    shipping += SHIPPING_RATES[source] || 0;
  }
  shipping = money(shipping);

  const taxableMerchandise = money(Math.max(0, subtotal - discount));
  const processingFee =
    paymentMethod === "PayPal" || paymentMethod === "Venmo" || paymentMethod === "Apple Pay"
      ? money(taxableMerchandise * 0.05)
      : 0;
  const tax = money((taxableMerchandise + processingFee) * 0.08);
  const total = money(subtotal - discount + shipping + processingFee + tax);
  const now = new Date().toISOString();
  const requestToken = crypto.randomUUID();
  const customerName = [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim();

  const { data: order, error: orderError } = await admin
    .from("orders")
    .insert({
      customer_id: profile.id,
      status: "checkout_pending",
      subtotal,
      discount_total: discount,
      shipping_total: shipping,
      tax_total: tax,
      processing_fee_total: processingFee,
      total,
      payment_method: paymentMethod,
      payment_status: "pending",
      customer_notes: body.customerNotes?.trim() || null,
      contact_method: body.contactMethod?.trim() || null,
      submitted_at: now,
      admin_notes: "Nexus Pay Now checkout",
    })
.select("id,created_at")
    .single();

  if (orderError || !order) return json({ error: "Could not create checkout order" }, 500);

  const orderItems = validatedItems.map(item => ({
    order_id: order.id,
    product_id: item.productId,
    product_code: item.productCode,
    product_name: item.productName,
    quantity: item.quantity,
    unit_price: item.unitPrice,
    line_total: item.lineTotal,
  }));

  const { error: itemsError } = await admin.from("order_items").insert(orderItems);
  if (itemsError) {
    await admin.from("orders").update({
      status: "checkout_error",
      admin_notes: "Nexus Pay Now checkout: order item insert failed",
    }).eq("id", order.id);
    return json({ error: "Could not save checkout items" }, 500);
  }

  // PayPal/Venmo/Apple Pay fast path: return as soon as the secure Science By Hugs
  // order and line items exist. Branded invoice/PDF generation is finalized
  // after the provider confirms payment in paypal-capture-order.
  if (paymentMethod === "PayPal" || paymentMethod === "Venmo" || paymentMethod === "Apple Pay") {
    return json({
      success: true,
      orderId: order.id,
      orderNumber: "",
      invoicePdfReady: false,
      totals: { subtotal, discount, shipping, processingFee, tax, total },
    });
  }

  const bridgePayload = {
    bridgeKey: secretKeys.default,
    requestToken,
    orderId: order.id,
    paymentMethod,
    paymentStatus: "Pending Payment",
    customer: {
      customerId: profile.customer_number || "",
      firstName: profile.first_name || "",
      lastName: profile.last_name || "",
      name: customerName,
      email: profile.email || user.email || "",
      phone: profile.phone || "",
      membership: membershipName,
      accountStatus: profile.account_status || "Active",
      contactMethod: body.contactMethod?.trim() || "",
    },
    items: validatedItems,
    totals: { subtotal, discount, shipping, processingFee, tax, total },
    notes: body.customerNotes?.trim() || "",
  };

  let sheetResponse: Response;
  let sheetData: {
    success?: boolean;
    invoiceNumber?: string;
    invoiceSheet?: string;
    invoiceSheetUrl?: string;
    error?: string;
  };

  try {
    sheetResponse = await fetch(
      `${APPS_SCRIPT_URL}?api=nexusInvoiceRequest`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bridgePayload),
        redirect: "follow",
      },
    );
    sheetData = await sheetResponse.json();
  } catch {
    await admin.from("orders").update({
      status: "checkout_sync_error",
      admin_notes: "Nexus Pay Now checkout: branded invoice bridge unavailable",
    }).eq("id", order.id);
    return json({ error: "Could not create the branded invoice" }, 503);
  }

  if (!sheetResponse.ok || !sheetData.success || !sheetData.invoiceNumber || !sheetData.invoiceSheet) {
    await admin.from("orders").update({
      status: "checkout_sync_error",
      admin_notes: `Nexus Pay Now checkout: ${sheetData.error || "branded invoice bridge rejected request"}`,
    }).eq("id", order.id);
    return json({ error: sheetData.error || "Could not create the branded invoice" }, 502);
  }

  const pdfPayload = {
    bridgeKey: secretKeys.default,
    invoiceNumber: sheetData.invoiceNumber,
    invoiceSheet: sheetData.invoiceSheet,
  };

  let pdfResponse: Response;
  let pdfData: {
    success?: boolean;
    pdfFileId?: string;
    pdfUrl?: string;
    pdfName?: string;
    error?: string;
  };

  try {
    pdfResponse = await fetch(
      `${APPS_SCRIPT_URL}?api=approveNexusInvoice`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pdfPayload),
        redirect: "follow",
      },
    );
    pdfData = await pdfResponse.json();
  } catch {
    await admin.from("orders").update({
      order_number: sheetData.invoiceNumber,
      status: "checkout_sync_error",
      admin_notes: "Nexus Pay Now checkout: branded PDF bridge unavailable",
    }).eq("id", order.id);
    return json({
      error: "Branded invoice was created, but its PDF could not be generated",
      invoiceNumber: sheetData.invoiceNumber,
    }, 503);
  }

  if (!pdfResponse.ok || !pdfData.success || !pdfData.pdfUrl) {
    await admin.from("orders").update({
      order_number: sheetData.invoiceNumber,
      status: "checkout_sync_error",
      admin_notes: `Nexus Pay Now checkout: ${pdfData.error || "branded PDF bridge failed"}`,
    }).eq("id", order.id);
    return json({
      error: pdfData.error || "Branded invoice was created, but its PDF could not be generated",
      invoiceNumber: sheetData.invoiceNumber,
    }, 502);
  }

  const { data: record, error: recordError } = await admin
    .from("invoices")
    .insert({
      invoice_number: sheetData.invoiceNumber,
      order_id: order.id,
      customer_id: profile.id,
      status: "direct_checkout",
      subtotal,
      shipping_total: shipping,
      discount_total: discount,
      tax_total: tax,
      processing_fee_total: processingFee,
      total,
      payment_method: paymentMethod,
      google_sheet_name: sheetData.invoiceSheet,
      google_sheet_url: sheetData.invoiceSheetUrl || null,
      pdf_status: "created",
      pdf_url: pdfData.pdfUrl,
      pdf_created_at: now,
      send_status: "not_sent",
      contact_method: body.contactMethod?.trim() || null,
      customer_name_snapshot: customerName,
      customer_email_snapshot: profile.email || user.email || "",
      customer_phone_snapshot: profile.phone || "",
    })
.select("id,invoice_number")
    .single();

  if (recordError || !record) {
    await admin.from("orders").update({
      status: "checkout_sync_error",
      admin_notes: "Nexus Pay Now checkout created, but Core operation record failed",
    }).eq("id", order.id);
    return json({ error: "Checkout order created but Core synchronization needs review" }, 500);
  }

  await admin.from("orders").update({
    order_number: sheetData.invoiceNumber,
    status: "checkout_pending",
    admin_notes: `Nexus Pay Now checkout ${requestToken}: branded invoice PDF ready`,
  }).eq("id", order.id);

  await admin.from("invoice_events").insert({
    invoice_id: record.id,
    event_type: "direct_checkout_created",
    description: "Customer started Pay Now checkout and branded invoice PDF was created automatically.",
    metadata: {
      source: "nexus_pay_now",
      requestToken,
      autoApproved: true,
      pdfFileId: pdfData.pdfFileId || null,
      pdfUrl: pdfData.pdfUrl,
    },
  });

  return json({
    success: true,
    orderId: order.id,
    orderNumber: sheetData.invoiceNumber,
    invoicePdfReady: true,
    pdfUrl: pdfData.pdfUrl,
    totals: { subtotal, discount, shipping, processingFee, tax, total },
  });
});
