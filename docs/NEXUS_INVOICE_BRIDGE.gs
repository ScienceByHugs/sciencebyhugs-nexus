/**
 * SCIENCE BY HUGs — NEXUS INVOICE BRIDGE
 *
 * Add this file to the SAME Apps Script project as the existing
 * invoice workflow. It reuses CONFIG, getNextInvoiceNumber(),
 * createUniqueSheetName(), and addInvoiceToLog().
 *
 * The Supabase Edge Function authenticates the customer and validates
 * products/pricing before this endpoint is called.
 */

function handleNexusInvoiceRequest_(e) {
  try {
    const raw =
      e &&
      e.postData &&
      e.postData.contents
        ? e.postData.contents
        : '';

    if (!raw) {
      return nexusInvoiceJson_({
        success: false,
        error: 'Missing request body.'
      });
    }

    const payload = JSON.parse(raw);

    const expectedKey =
      PropertiesService
        .getScriptProperties()
        .getProperty('SUPABASE_SECRET_KEY');

    if (
      !expectedKey ||
      !payload.bridgeKey ||
      payload.bridgeKey !== expectedKey
    ) {
      return nexusInvoiceJson_({
        success: false,
        error: 'Unauthorized invoice bridge request.'
      });
    }

    const requestToken =
      String(payload.requestToken || '').trim();

    if (!requestToken) {
      return nexusInvoiceJson_({
        success: false,
        error: 'Missing request token.'
      });
    }

    /*
     * Idempotency:
     * If Supabase retries the same request, return the invoice
     * we already created instead of creating a duplicate.
     */
    const props =
      PropertiesService.getScriptProperties();

    const idempotencyKey =
      'NEXUS_INVOICE_' + requestToken;

    const previous =
      props.getProperty(idempotencyKey);

    if (previous) {
      try {
        return nexusInvoiceJson_(
          JSON.parse(previous)
        );
      } catch (ignore) {}
    }

    const customer =
      payload.customer || {};

    const customerName =
      String(customer.name || '').trim();

    const customerEmail =
      String(customer.email || '').trim();

    const customerPhone =
      String(customer.phone || '').trim();

    const customerMethod =
      String(customer.contactMethod || '').trim();

    const items =
      Array.isArray(payload.items)
        ? payload.items
        : [];

    const totals =
      payload.totals || {};

    const customerNotes =
      String(payload.notes || '').trim();

    if (!customerName || !customerEmail) {
      return nexusInvoiceJson_({
        success: false,
        error: 'Customer name and email are required.'
      });
    }

    if (!items.length || items.length > 5) {
      return nexusInvoiceJson_({
        success: false,
        error: 'Invoice must contain 1 to 5 products.'
      });
    }

    const lock =
      LockService.getScriptLock();

    lock.waitLock(30000);

    try {
      const ss =
        SpreadsheetApp.openById(
          CONFIG.spreadsheetId
        );

      const templateSheet =
        ss.getSheetByName(
          CONFIG.invoiceTemplate
        );

      if (!templateSheet) {
        throw new Error(
          'Could not find INVOICE-MASTER.'
        );
      }

      const invoiceNumber =
        getNextInvoiceNumber(
          ss,
          customerName
        );

      const invoiceSheet =
        templateSheet.copyTo(ss);

      const invoiceSheetName =
        createUniqueSheetName(
          ss,
          'Invoice ' +
          invoiceNumber +
          ' - ' +
          customerName
        );

      invoiceSheet.setName(
        invoiceSheetName
      );

      /*
       * Header
       */
      invoiceSheet
        .getRange('B2')
        .setValue(customerName);

      invoiceSheet
        .getRange('E2')
        .setValue(invoiceNumber);

      invoiceSheet
        .getRange('B3')
        .setValue(new Date());

      invoiceSheet
        .getRange('E3')
        .setValue('Pending Payment');

      /*
       * Product lines
       */
      const invoiceRows =
        items.map(function(item) {
          return [
            String(item.productName || ''),
            Number(item.quantity || 0),
            Number(item.unitPrice || 0),
            Number(item.lineTotal || 0)
          ];
        });

      while (
        invoiceRows.length <
        CONFIG.maxProducts
      ) {
        invoiceRows.push([
          '',
          '',
          '',
          ''
        ]);
      }

      invoiceSheet
        .getRange('A6:D10')
        .setValues(invoiceRows);

      /*
       * Server-calculated totals.
       * Do not recalculate these from browser input.
       */
      invoiceSheet
        .getRange('D11')
        .setValue(
          Number(totals.subtotal || 0)
        );

      invoiceSheet
        .getRange('D12')
        .setValue(
          Number(totals.discount || 0)
        );

      invoiceSheet
        .getRange('D13')
        .setValue(
          Number(totals.shipping || 0)
        );

      invoiceSheet
        .getRange('D14')
        .setValue(
          Number(totals.tax || 0)
        );

      invoiceSheet
        .getRange('D15')
        .setValue(
          Number(totals.total || 0)
        );

      /*
       * Notes and customer contact block
       */
      invoiceSheet
        .getRange('B17')
        .setValue(
          customerNotes ||
          'Requested through Science By HUGs Nexus.'
        );

      invoiceSheet
        .getRange('B23')
        .setValue(
          'Email: ' +
          customerEmail +
          '\nPhone: ' +
          customerPhone +
          '\nContact Method: ' +
          customerMethod +
          '\n\nRequested through Science By HUGs Nexus.'
        );

      /*
       * Log the invoice now so numbering/history stay consistent.
       */
      addInvoiceToLog(
        ss,
        invoiceNumber,
        customerName,
        customerEmail,
        customerPhone,
        customerMethod,
        'Invoice Request',
        invoiceSheetName,
        'Pending Payment'
      );

      /*
       * Approval queue:
       * IMPORTANT — this is intentionally NOT "Pending".
       * processInvoicePDF() only processes Pending rows.
       */
      addNexusInvoiceApprovalQueue_(
        ss,
        invoiceNumber,
        invoiceSheetName,
        customerName
      );

      SpreadsheetApp.flush();

      const result = {
        success: true,
        invoiceNumber: invoiceNumber,
        invoiceSheet: invoiceSheetName,
        invoiceSheetUrl:
          ss.getUrl() +
          '#gid=' +
          invoiceSheet.getSheetId(),
        status: 'Awaiting Approval'
      };

      props.setProperty(
        idempotencyKey,
        JSON.stringify(result)
      );

      return nexusInvoiceJson_(result);

    } finally {
      lock.releaseLock();
    }

  } catch (error) {
    console.error(
      'Nexus invoice request failed: ' +
      error.message
    );

    return nexusInvoiceJson_({
      success: false,
      error:
        error &&
        error.message
          ? error.message
          : 'Invoice request failed.'
    });
  }
}


function addNexusInvoiceApprovalQueue_(
  ss,
  invoiceNumber,
  invoiceSheetName,
  customerName
) {
  let queueSheet =
    ss.getSheetByName(
      CONFIG.processingSheet
    );

  if (!queueSheet) {
    queueSheet =
      ss.insertSheet(
        CONFIG.processingSheet
      );

    queueSheet
      .getRange('A1:E1')
      .setValues([[
        'Invoice #',
        'Invoice Sheet',
        'Customer',
        'Status',
        'Created'
      ]]);
  }

  const nextRow =
    queueSheet.getLastRow() + 1;

  queueSheet
    .getRange(
      nextRow,
      1,
      1,
      5
    )
    .setValues([[
      invoiceNumber,
      invoiceSheetName,
      customerName,
      'Awaiting Approval',
      new Date()
    ]]);
}


function nexusInvoiceJson_(data) {
  return ContentService
    .createTextOutput(
      JSON.stringify(data)
    )
    .setMimeType(
      ContentService.MimeType.JSON
    );
}


/*
 * WEB APP ROUTING
 *
 * If your Apps Script project does NOT already have doPost(e),
 * you may use this:
 *
 * function doPost(e) {
 *   const params =
 *     e && e.parameter
 *       ? e.parameter
 *       : {};
 *
 *   if (params.api === 'nexusInvoiceRequest') {
 *     return handleNexusInvoiceRequest_(e);
 *   }
 *
 *   return nexusInvoiceJson_({
 *     success: false,
 *     error: 'Unknown POST API.'
 *   });
 * }
 *
 * If doPost(e) already exists, DO NOT create a second one.
 * Add this route near the top of the existing doPost(e):
 *
 * if (params.api === 'nexusInvoiceRequest') {
 *   return handleNexusInvoiceRequest_(e);
 * }
 */
