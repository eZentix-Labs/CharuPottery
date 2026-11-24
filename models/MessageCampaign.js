const mongoose = require('mongoose');

/**
 * Outbound marketing campaign (e.g. WhatsApp offers). Recipients are only
 * customers with a recorded opt-in; every recipient outcome is logged.
 * No provider is configured yet, so campaigns are recorded as BLOCKED.
 */
const messageCampaignSchema = new mongoose.Schema(
  {
    channel: { type: String, enum: ['whatsapp'], required: true },
    templateName: { type: String, required: true, maxlength: 100 },
    templateParams: [{ type: String, maxlength: 200 }],
    status: { type: String, enum: ['DRAFT', 'BLOCKED', 'SENT', 'PARTIAL', 'FAILED'], default: 'DRAFT' },
    statusReason: String,
    eligibleCount: { type: Number, default: 0 },
    suppressedCount: { type: Number, default: 0 },
    results: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        outcome: { type: String, enum: ['SENT', 'FAILED', 'SKIPPED_NO_CONSENT', 'BLOCKED'] },
        providerMessageId: String,
        at: Date,
      },
    ],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('MessageCampaign', messageCampaignSchema);
