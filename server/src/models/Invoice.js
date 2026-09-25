import mongoose from 'mongoose';

const lineItemSchema = new mongoose.Schema(
  { desc: String, qty: Number, rate: Number },
  { _id: false }
);

const invoiceSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    number: { type: String, required: true },
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client' },
    issueDate: String,
    dueDate: String,
    items: [lineItemSchema],
    status: { type: String, enum: ['draft', 'sent', 'paid', 'overdue'], default: 'draft' },
    paidOn: String,
    notes: String,
  },
  { timestamps: true }
);

invoiceSchema.virtual('total').get(function () {
  return (this.items || []).reduce((sum, i) => sum + (i.qty || 0) * (i.rate || 0), 0);
});
invoiceSchema.set('toJSON', { virtuals: true });

export default mongoose.model('Invoice', invoiceSchema);
