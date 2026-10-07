import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['income', 'expense'], required: true },
    date: { type: String, required: true }, // YYYY-MM-DD
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', default: null },
    category: String,
    note: String,
    amount: { type: Number, required: true },
    status: { type: String, enum: ['paid', 'pending'], default: 'paid' },
    // MGOctaviano07Oct2026: `invoice` reference field removed along with the Invoices module.
    // Set when this row was materialized from a RecurringRule occurrence,
    // rather than entered by hand — lets the UI mark it and lets deleting
    // a rule leave its already-generated history intact.
    recurringRuleId: { type: mongoose.Schema.Types.ObjectId, ref: 'RecurringRule', default: null },
  },
  { timestamps: true }
);

// A future-dated entry is always pending — it hasn't happened yet, so it
// can't be marked paid no matter what the form submitted. The reverse
// (pending -> paid once the date arrives) is deliberately NOT enforced
// here: that's a passive, time-based promotion that belongs to the
// reconcile pass in routes/recurringRules.js `run`, not an instant
// override the moment someone saves — see that file for why.
function forceFuturePending(dateStr, doc) {
  const today = new Date().toISOString().slice(0, 10);
  if (dateStr && dateStr > today) doc.status = 'pending';
}

transactionSchema.pre('save', function (next) {
  if (this.isModified('date') || this.isModified('status') || this.isNew) {
    forceFuturePending(this.date, this);
  }
  next();
});

// findOneAndUpdate bypasses document middleware, so the same guard needs
// its own hook here — the generic crudFactory's `update` goes through
// this path, not `.save()`.
transactionSchema.pre('findOneAndUpdate', function (next) {
  const update = this.getUpdate() || {};
  const date = update.date ?? update.$set?.date;
  if (date) {
    const target = update.$set || update;
    forceFuturePending(date, target);
  }
  next();
});

export default mongoose.model('Transaction', transactionSchema);