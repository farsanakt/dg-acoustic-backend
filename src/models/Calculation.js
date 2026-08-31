const mongoose = require("mongoose");

// 8 octave bands: 63, 125, 250, 500, 1000, 2000, 4000, 8000 Hz
const bandSchema = new mongoose.Schema({
  hz63:   { type: Number, default: 0 },
  hz125:  { type: Number, default: 0 },
  hz250:  { type: Number, default: 0 },
  hz500:  { type: Number, default: 0 },
  hz1000: { type: Number, default: 0 },
  hz2000: { type: Number, default: 0 },
  hz4000: { type: Number, default: 0 },
  hz8000: { type: Number, default: 0 },
}, { _id: false });

const attenuatorSchema = new mongoose.Schema({
  model:          { type: String, default: "" },
  width_mm:       { type: Number, default: 0 },
  height_mm:      { type: Number, default: 0 },
  length_mm:      { type: Number, default: 0 },
  pressureDrop_pa:{ type: Number, default: 0 },
  il:             bandSchema,  // insertion loss per band
}, { _id: false });

const calculationSchema = new mongoose.Schema({
  project:  { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true },
  noisePath:{ type: String, enum: ["exhaust", "intake", "radiated"], default: "exhaust" },

  /* ── Generator ── */
  generator: {
    equipmentId:   { type: String, default: "" },
    modelNumber:   { type: String, default: "" },
    ratedKva:      { type: Number, default: 0 },
    buildingRef:   { type: String, default: "" },
    swl_dba:       { type: Number, default: 0 },  // overall SWL dB(A)
    swl:           bandSchema,                     // octave-band SWL
  },

  /* ── Plant room / enclosure ── */
  room: {
    length_m:    { type: Number, default: 0 },
    width_m:     { type: Number, default: 0 },
    height_m:    { type: Number, default: 0 },
    avgAbsCoeff: { type: Number, default: 0.9 },  // average absorption coefficient
  },

  /* ── Duct / opening ── */
  duct: {
    width_mm:  { type: Number, default: 0 },
    height_mm: { type: Number, default: 0 },
    length_m:  { type: Number, default: 0 },
    lining:    { type: String, enum: ["unlined", "1inch", "2inch"], default: "unlined" },
    elbows:    { type: Number, default: 0 },
    terminationType: { type: String, enum: ["free_space", "wall"], default: "wall" },
  },

  /* ── Attenuator / louver ── */
  attenuator: attenuatorSchema,

  /* ── Receiver ── */
  receiver: {
    description: { type: String, default: "" },
    distance_m:  { type: Number, default: 3 },
    directivity: { type: Number, default: 2 },    // Q factor (2=half-space)
    requiredNC:  { type: Number, default: 65 },   // NC limit
    requiredNR:  { type: Number, default: 65 },   // NR limit
    required_dba:{ type: Number, default: 65 },   // overall dB(A) limit
  },

  /* ── Computed results (stored for report) ── */
  results: {
    swlAtDuct:         bandSchema,  // after area correction
    distanceLoss:      bandSchema,
    attenuatorLoss:    bandSchema,
    endReflectionLoss: bandSchema,
    aWeighting:        bandSchema,
    lp_at_receiver:    bandSchema,  // final SPL at receiver
    total_lp_dba:      { type: Number, default: 0 },
    nc_value:          { type: Number, default: 0 },
    nr_value:          { type: Number, default: 0 },
    passes_dba:        { type: Boolean, default: false },
    additional_reduction_needed: bandSchema,
  },

  calculatedAt: { type: Date },
}, { timestamps: true });

module.exports = mongoose.model("Calculation", calculationSchema);