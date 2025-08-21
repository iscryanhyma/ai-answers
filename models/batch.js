import mongoose from 'mongoose';

const BatchSchema = new mongoose.Schema({
  status: { type: String, required: false, default: 'queued' },
  batchId: { type: String, required: true, default: '' },
  type: { type: String, required: true, default: '' },
  name: { type: String, required: true, default: '' },
  aiProvider: { type: String, required: true, default: '' },
  searchProvider: { type: String, required: false, default: '' },
  pageLanguage: { type: String, required: true, default: '' },

  
},{
  timestamps: true, versionKey: false,
  id: false,
});

// Expose model
export const Batch = mongoose.models.Batch || mongoose.model('Batch', BatchSchema);
