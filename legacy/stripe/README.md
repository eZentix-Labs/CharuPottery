# Legacy Stripe integration (disabled)

Status: **not loaded by the application.** Kept for reference only.

| File | Original location | Why disabled |
|---|---|---|
| `stripeWebhookController.original.js` | `controllers/webhookController.js` | Only logged events; never linked a payment to an order |
| `webhookRoutes.original.js` | `routes/webhookRoutes.js` | Was never mounted |
| `createPaymentIntent` (removed from `controllers/orderController.js`) | — | Created PaymentIntents that nothing confirmed; checkout marked orders paid without payment |

The `stripe` npm dependency is still listed in `package.json` but is no longer
required by any loaded module. Removing it is a dependency change and is left
for the owner to approve (DEC-20).
