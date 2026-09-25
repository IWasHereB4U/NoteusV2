import mongoose from 'mongoose';

// A comment attaches either to a specific spot (a highlighted text range in
// a fixed document, or an element on a free canvas) or to the card as a
// whole. `commentId` is the client-generated id shared with the TipTap
// "comment" mark (fixed mode) or the canvas element's own id (free mode),
// so the editor can find what a comment is pointing at. `quote` snapshots
// the highlighted text at comment time so the thread still reads sensibly
// even if that text is later edited or the mark is stripped.
const commentSchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    authorName: String,
    authorColor: String,
    text: { type: String, required: true },
    resolved: { type: Boolean, default: false },
    anchor: {
      type: { type: String, enum: ['text', 'element', 'card'], default: 'card' },
      commentId: String,
      quote: String,
    },
  },
  { timestamps: true }
);

// Free mode: an array of absolutely-positioned elements on a canvas.
// Fixed mode: a single flowing rich-text document (HTML from the editor).
const noteCardSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    folder: { type: mongoose.Schema.Types.ObjectId, ref: 'NoteFolder', required: true, index: true },
    title: { type: String, default: 'Untitled' },
    mode: { type: String, enum: ['free', 'fixed'], required: true },

    // free mode
    elements: [
      {
        _id: false,
        id: String,
        type: { type: String, enum: ['text', 'image', 'video'] },
        x: Number,
        y: Number,
        w: Number,
        h: Number,
        rotation: { type: Number, default: 0 },
        z: { type: Number, default: 1 },
        html: String, // for text elements (rich text HTML)
        mediaId: { type: mongoose.Schema.Types.ObjectId, ref: 'MediaAsset' }, // for image/video
      },
    ],

    // fixed mode
    html: { type: String, default: '' },

    comments: [commentSchema],

    // Circle members granted edit access to just this one card's content
    // (title/html/elements) — not delete, not move, not the editors list
    // itself. See NoteFolder.editors for the broader "whole folder"
    // version, and routes/noteCards.js for how the two combine.
    editors: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
);

export default mongoose.model('NoteCard', noteCardSchema);
