import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.117.1";

const APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbzvED4G5C_Lm14qxv0BY8uhsv1tRtON6_sempQu2Zn0B3IxE_mBkfAmNh7mIZsq-icsGA/exec";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });


async function qualifyReferral(
  admin: ReturnType<typeof createClient>,
  customerId: string | null,
  orderNumber: string | null,
) {
  if (!customerId) return;

  const { data: referral } = await admin
    .from("referrals")
    .select("id,referrer_id,qualified_at")
    .eq("referred_customer_id", customerId)
    .maybeSingle();

  if (!referral || referral.qualified_at) return;

  const qualifiedAt = new Date().toISOString();

  const { error: qualifyError } = await admin
    .from("referrals")
    .update({
      status: "qualified",
      qualified_at: qualifiedAt,
      converted_at: qualifiedAt,
      qualifying_order_number: orderNumber || null,
      updated_at: qualifiedAt,
    })
    .eq("id", referral.id)
    .is("qualified_at", null);

  if (qualifyError) return;

  const { count } = await admin
    .from("referrals")
    .select("id", { count: "exact", head: true })
    .eq("referrer_id", referral.referrer_id)
    .not("qualified_at", "is", null);

  if ((count || 0) >= 20) {
    const { data: membership } = await admin
      .from("memberships")
      .select("id")
      .eq("name", "Principal Scientist")
      .maybeSingle();

    if (membership?.id) {
      await admin
        .from("profiles")
        .update({ membership_id: membership.id })
        .eq("id", referral.referrer_id);
    }
  }
}


async function finalizeBrandedInvoice(
  admin: ReturnType<typeof createClient>,
  bridgeKey: string,
  userEmail: string,
  profile: any,
  order: any,
  provider: "PayPal" | "Venmo",
  now: string,
) {
  const { data: existingInvoice } = await admin
    .from("invoices")
    .select("id,invoice_number,pdf_url")
    .eq("order_id", order.id)
    .maybeSingle();

  if (existingInvoice?.id) {
    await admin
      .from("invoices")
      .update({ payment_method: provider, paid_at: now })
      .eq("id", existingInvoice.id);

    return {
      success: true,
      invoiceId: existingInvoice.id,
      orderNumber: existingInvoice.invoice_number || order.order_number || null,
      pdfUrl: existingInvoice.pdf_url || null,
      existing: true,
    };
  }

  try {
    const { data: itemRows, error: itemError } = await admin
      .from("order_items")
      .select("product_id,product_code,product_name,quantity,unit_price,line_total")
      .eq("order_id", order.id)
      .order("created_at", { ascending: true });

    if (itemError || !itemRows?.length) {
      throw new Error("Checkout items could not be loaded for invoice generation");
    }

    const customerName = [profile.first_name, profile.last_name]
      .filter(Boolean)
      .join(" ")
      .trim();
    const membershipName = String(profile.memberships?.name || "");
    const requestToken = `nexus-paid-${order.id}`;

    const bridgePayload = {
      bridgeKey,
      requestToken,
      orderId: order.id,
      paymentMethod: provider,
      paymentStatus: "Paid",
      customer: {
        customerId: profile.customer_number || "",
        firstName: profile.first_name || "",
        lastName: profile.last_name || "",
        name: customerName,
        email: profile.email || userEmail || "",
        phone: profile.phone || "",
        membership: membershipName,
        accountStatus: profile.account_status || "Active",
        contactMethod: order.contact_method || "",
      },
      items: itemRows.map((item: any) => ({
        productId: item.product_id,
        productCode: item.product_code,
        productName: item.product_name,
        quantity: Number(item.quantity || 0),
        unitPrice: Number(item.unit_price || 0),
        lineTotal: Number(item.line_total || 0),
      })),
      totals: {
        subtotal: Number(order.subtotal || 0),
        discount: Number(order.discount_total || 0),
        shipping: Number(order.shipping_total || 0),
        processingFee: Number(order.processing_fee_total || 0),
        tax: Number(order.tax_total || 0),
        total: Number(order.total || 0),
      },
      notes: order.customer_notes || "",
    };

    const sheetResponse = await fetch(
      `${APPS_SCRIPT_URL}?api=nexusInvoiceRequest`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bridgePayload),
        redirect: "follow",
      },
    );
    const sheetData = await sheetResponse.json();

    if (
      !sheetResponse.ok ||
      !sheetData?.success ||
      !sheetData?.invoiceNumber ||
      !sheetData?.invoiceSheet
    ) {
      throw new Error(sheetData?.error || "Branded invoice bridge rejected request");
    }

    const pdfResponse = await fetch(
      `${APPS_SCRIPT_URL}?api=approveNexusInvoice`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bridgeKey,
          invoiceNumber: sheetData.invoiceNumber,
          invoiceSheet: sheetData.invoiceSheet,
        }),
        redirect: "follow",
      },
    );
    const pdfData = await pdfResponse.json();

    if (!pdfResponse.ok || !pdfData?.success || !pdfData?.pdfUrl) {
      throw new Error(pdfData?.error || "Branded invoice PDF could not be generated");
    }

    const { data: invoiceRecord, error: invoiceError } = await admin
      .from("invoices")
      .insert({
        invoice_number: sheetData.invoiceNumber,
        order_id: order.id,
        customer_id: profile.id,
        status: "direct_checkout",
        subtotal: Number(order.subtotal || 0),
        shipping_total: Number(order.shipping_total || 0),
        discount_total: Number(order.discount_total || 0),
        tax_total: Number(order.tax_total || 0),
        processing_fee_total: Number(order.processing_fee_total || 0),
        total: Number(order.total || 0),
        payment_method: provider,
        paid_at: now,
        google_sheet_name: sheetData.invoiceSheet,
        google_sheet_url: sheetData.invoiceSheetUrl || null,
        pdf_status: "created",
        pdf_url: pdfData.pdfUrl,
        pdf_created_at: now,
        send_status: "not_sent",
        contact_method: order.contact_method || null,
        customer_name_snapshot: customerName,
        customer_email_snapshot: profile.email || userEmail || "",
        customer_phone_snapshot: profile.phone || "",
      })
      .select("id,invoice_number")
      .single();

    if (invoiceError || !invoiceRecord) {
      throw new Error("Core invoice record could not be created");
    }

    await admin
      .from("orders")
      .update({
        order_number: sheetData.invoiceNumber,
        admin_notes: `Nexus Pay Now: payment captured and branded invoice PDF ready`,
        updated_at: now,
      })
      .eq("id", order.id);

    await admin.from("invoice_events").insert({
      invoice_id: invoiceRecord.id,
      event_type: "direct_checkout_created",
      description: "Branded invoice PDF created after verified Nexus payment.",
      metadata: {
        source: "nexus_pay_now_post_payment",
        requestToken,
        autoApproved: true,
        pdfFileId: pdfData.pdfFileId || null,
        pdfUrl: pdfData.pdfUrl,
      },
    });

    return {
      success: true,
      invoiceId: invoiceRecord.id,
      orderNumber: sheetData.invoiceNumber,
      pdfUrl: pdfData.pdfUrl,
      existing: false,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invoice synchronization failed";

    await admin
      .from("orders")
      .update({
        admin_notes:
          "Payment captured successfully; branded invoice synchronization needs review: " +
          message,
        updated_at: now,
      })
      .eq("id", order.id);

    return { success: false, error: message, orderNumber: order.order_number || null };
  }
}

function paypalBaseUrl() {
  return (Deno.env.get("PAYPAL_ENV") || "sandbox").toLowerCase() === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

async function getAccessToken() {
  const clientId = Deno.env.get("PAYPAL_CLIENT_ID") || "";
  const secret = Deno.env.get("PAYPAL_CLIENT_SECRET") || "";
  if (!clientId || !secret) throw new Error("PayPal credentials are not configured");

  const auth = btoa(`${clientId}:${secret}`);
  const response = await fetch(`${paypalBaseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  const data = await response.json();
  if (!response.ok || !data.access_token) throw new Error("Could not authenticate with PayPal");
  return data.access_token as string;
}

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

  let body: { orderId?: string; paypalOrderId?: string; paymentMethod?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }

  const orderId = String(body.orderId || "").trim();
  const paypalOrderId = String(body.paypalOrderId || "").trim();
  const requestedMethod = String(body.paymentMethod || "PayPal").trim();
  const provider = requestedMethod.toLowerCase() === "venmo" ? "Venmo" : "PayPal";

  if (!orderId || !paypalOrderId) {
    return json({ error: "Order ID and PayPal order ID are required" }, 400);
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("id,customer_number,first_name,last_name,email,phone,account_status,memberships(name)")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!profile) return json({ error: "Customer profile not found" }, 403);

  const { data: order, error: orderError } = await admin
    .from("orders")
    .select("id,order_number,customer_id,subtotal,discount_total,shipping_total,processing_fee_total,tax_total,total,payment_status,customer_notes,contact_method")
    .eq("id", orderId)
    .eq("customer_id", profile.id)
    .single();

  if (orderError || !order) return json({ error: "Order not found" }, 404);

  if (order.payment_status === "paid") {
    return json({ success: true, alreadyPaid: true, orderId: order.id });
  }

  const { data: payment } = await admin
    .from("payments")
    .select("id,provider,provider_order_id,status")
    .eq("order_id", order.id)
    .maybeSingle();

  if (!payment || payment.provider !== provider || payment.provider_order_id !== paypalOrderId) {
    return json({ error: provider + " order does not match this Science By HUGs order" }, 409);
  }

  const accessToken = await getAccessToken();

  const response = await fetch(
    `${paypalBaseUrl()}/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "PayPal-Request-Id": `sbh-capture-${order.id}`,
      },
      body: "{}",
    },
  );

  const captured = await response.json();

  if (!response.ok || captured?.status !== "COMPLETED") {
    return json({
      error: captured?.message || "PayPal capture was not completed",
    }, 502);
  }

  const capture =
    captured?.purchase_units?.[0]?.payments?.captures?.[0];

  const capturedValue = Number(capture?.amount?.value || 0);
  const currency = String(capture?.amount?.currency_code || "");
  const expectedValue = Number(order.total || 0);

  if (
    capture?.status !== "COMPLETED" ||
    currency !== "USD" ||
    Math.abs(capturedValue - expectedValue) > 0.001
  ) {
    return json({ error: "PayPal capture did not match the expected order total" }, 409);
  }

  const now = new Date().toISOString();
  const captureId = String(capture.id || "");

  const { error: paymentError } = await admin
    .from("payments")
    .update({
      provider_capture_id: captureId || null,
      payment_reference: captureId || paypalOrderId,
      status: "verified",
      submitted_at: now,
      verified_at: now,
      verified_by: user.id,
      paid_at: now,
      updated_at: now,
    })
    .eq("id", payment.id);

  if (paymentError) {
    return json({ error: "Payment captured, but Science By HUGs payment sync needs review" }, 500);
  }

  await admin
    .from("orders")
    .update({
      payment_method: provider,
      payment_status: "paid",
      paid_at: now,
      status: "processing",
      updated_at: now,
    })
    .eq("id", order.id);

  const invoiceSync = await finalizeBrandedInvoice(
    admin,
    secretKeys.default,
    user.email || "",
    profile,
    order,
    provider,
    now,
  );

  const { data: invoice } = await admin
    .from("invoices")
    .select("id")
    .eq("order_id", order.id)
    .maybeSingle();

  await qualifyReferral(admin, order.customer_id, invoiceSync.orderNumber || order.order_number);

  if (invoice?.id) {
    await admin
      .from("invoices")
      .update({
        payment_method: provider,
        paid_at: now,
      })
      .eq("id", invoice.id);

    await admin
      .from("invoice_events")
      .insert({
        invoice_id: invoice.id,
        event_type: provider === "Venmo" ? "venmo_payment_captured" : "paypal_payment_captured",
        description: provider + " payment captured in Nexus and order moved to processing.",
        metadata: {
          source: provider === "Venmo" ? "nexus_venmo" : "nexus_paypal",
          provider,
          paypalOrderId,
          captureId,
          amount: capturedValue,
          currency,
        },
      });
  }

  return json({
    success: true,
    orderId: order.id,
    paypalOrderId,
    captureId,
    amount: capturedValue,
    currency,
    status: "paid",
    provider,
    orderNumber: invoiceSync.orderNumber || order.order_number || null,
    invoicePdfReady: invoiceSync.success,
    invoiceSyncError: invoiceSync.success ? null : invoiceSync.error,
  });
});
