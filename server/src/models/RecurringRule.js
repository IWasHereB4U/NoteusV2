import mongoose from 'mongoose';

// A recurring rule doesn't post transactions itself — it's just the
// template. Actual Transaction rows get materialized from it (see
// routes/recurringRules.js `run`), so editing history and per-occurrence
// status/edits work exactly like any other transaction.
const recurringRuleSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['income', 'expense'], required: true },
    category: String,
    note: String,
    amount: { type: Number, required: true },
    status: { type: String, enum: ['paid', 'pending'], default: 'paid' }, // applied to each generated occurrence

    frequency: {
      // monthlyDay: fires on `day` of every month (clamped to the month's
      //   actual length — day 31 in a 30-day month lands on the 30th).
      // eom: fires on the last day of every month.
      // everyNDays: fires every `n` days, anchored to startDate.
      kind: { type: String, enum: ['monthlyDay', 'eom', 'everyNDays'], required: true },
      day: { type: Number, min: 1, max: 31 },
      n: { type: Number, min: 1 },
    },

    startDate: { type: String, required: true }, // YYYY-MM-DD — first possible occurrence / everyNDays anchor
    endDate: String, // YYYY-MM-DD, optional — stop generating after this date
    active: { type: Boolean, default: true },
    // Last date a transaction was generated for, so a catch-up run only
    // scans forward from here instead of re-walking from startDate.
    lastGenerated: String,
  },
  { timestamps: true }
);

export default mongoose.model('RecurringRule', recurringRuleSchema);