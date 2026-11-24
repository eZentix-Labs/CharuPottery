const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// @desc    Handle Stripe webhook events (payment confirmations, failures)
// @route   POST /api/v1/webhooks/stripe
// @access  Public (verified via Stripe signature)
// NOTE: This route must receive the RAW request body — see server.js for the
// special middleware ordering required (express.raw() before express.json()).
exports.stripeWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error(`Webhook signature verification failed: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  switch (event.type) {
    case 'payment_intent.succeeded': {
      const paymentIntent = event.data.object;
      console.log(`✅ PaymentIntent succeeded: ${paymentIntent.id}`);
      // Order creation already happens client-side via /orders after confirmation.
      // This is where you'd add idempotent server-side order reconciliation
      // or send a payment confirmation email if desired.
      break;
    }
    case 'payment_intent.payment_failed': {
      const paymentIntent = event.data.object;
      console.log(`❌ Payment failed: ${paymentIntent.id}`);
      break;
    }
    default:
      console.log(`Unhandled Stripe event type: ${event.type}`);
  }

  res.status(200).json({ received: true });
};
