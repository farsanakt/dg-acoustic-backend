const mongoose = require("mongoose");

const equipmentSchema = new mongoose.Schema({
  type: { type: String, trim: true, default: "" },
  tag:  { type: String, trim: true, default: "" },
}, { _id: true });

const versionSchema = new mongoose.Schema({
  versionNo: Number,
  label:     String,
  note:      { type: String, default: "" },
  savedAt:   { type: Date, default: Date.now },
  savedBy:   { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { _id: true });

const projectSchema = new mongoose.Schema({
  /* ── Project Identity ── */
  jobNumber:       { type: String, trim: true, default: "" },
  name:            { type: String, required: [true, "Project name required"], trim: true },
  projectType:     {
    type: String,
    enum: ["residential","hotel","commercial","hospital",
           "industrial","data_centre","mixed_use","other"],
    default: "commercial",
  },

  /* ── Parties ── */
  clientName:      { type: String, required: [true, "Client name required"], trim: true },
  mainContractor:  { type: String, trim: true, default: "" },
  mepContractor:   { type: String, trim: true, default: "" },

  /* ── Report details ── */
  reportNumber:    { type: String, trim: true, default: "" },
  revision:        { type: String, trim: true, default: "R00" },
  reportDate:      { type: String, trim: true, default: "" },  // stored as YYYY-MM-DD string

  /* ── Site ── */
  siteLocation:    { type: String, trim: true, default: "" },

  /* ── Equipment list (up to 4) ── */
  equipment: { type: [equipmentSchema], default: [] },

  /* ── Misc ── */
  description:     { type: String, trim: true, default: "" },
  status: {
    type: String,
    enum: ["draft","in_progress","sent_to_client","client_reviewing",
           "revision_needed","approved","completed"],
    default: "draft",
  },

  /* ── Ownership + versions ── */
  createdBy:       { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  currentVersion:  { type: Number, default: 1 },
  versions:        { type: [versionSchema], default: [] },
}, { timestamps: true });

module.exports = mongoose.model("Project", projectSchema);
