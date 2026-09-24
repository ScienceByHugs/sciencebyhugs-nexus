# Nexus Invoice Bridge

The Nexus request-invoice flow is built to create an authenticated order in Supabase and then create a draft invoice in the existing Google invoice system.

## Google Apps Script setup

1. Open the existing Science By HUGs invoice Apps Script project.
2. Create a new script file named `NEXUS_INVOICE_BRIDGE.gs`.
3. Copy the contents of `docs/NEXUS_INVOICE_BRIDGE.gs` into it.
4. The existing Script Property `SUPABASE_SECRET_KEY` is reused to authenticate the server-to-server bridge. Do not expose it in Nexus or GitHub.
5. If the project does not already have `doPost(e)`, enable the commented `doPost(e)` wrapper at the bottom of the bridge file.
6. If the project already has `doPost(e)`, add the `nexusInvoiceRequest` route to the existing function instead of creating a duplicate.
7. Deploy a new Web App version so the production `/exec` endpoint receives the new POST route.

## Workflow

Nexus -> Supabase request-invoice Edge Function -> Apps Script -> INVOICE-MASTER copy -> Invoice Log -> Invoice Queue (Awaiting Approval)

`processInvoicePDF()` will not process an Awaiting Approval row. Core will later change that queue row to `Pending` when the admin chooses Send Invoice.
