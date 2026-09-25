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

  /* ── Generator ──
     Per DIESEL_GENERATOR.docx, noise data can be entered in one of 4 ways:
       swl_db  (Case 1) — Sound Power Level in dB, used directly
       swl_dba (Case 2) — Sound Power Level in dB(A), A-Weighting corrected
       spl_db  (Case 3) — Sound Pressure Level in dB, converted via Lw = Lp + 10log10(4πr²)
       spl_dba (Case 4) — Sound Pressure Level in dB(A), A-Weighting corrected then converted
     `swl` always holds the final, resulting Sound Power Level in dB that the
     calculation engine consumes — regardless of which mode was used to enter it.
     `rawBand` holds exactly what the user typed, in whichever unit `noiseInputType`
     says, so the form can be reopened and re-edited without losing the original entry. */
  generator: {
    equipmentId:   { type: String, default: "" },
    modelNumber:   { type: String, default: "" },
    ratedKva:      { type: Number, default: 0 },
    buildingRef:   { type: String, default: "" },
    swl_dba:       { type: Number, default: 0 },  // overall SWL dB(A) (summary field, unrelated to per-band entry mode)

    noiseInputType: {
      type: String,
      enum: ["swl_db", "swl_dba", "spl_db", "spl_dba"],
      default: "swl_db",
    },
    measurementDistance_m: { type: Number, default: 1 }, // r, used for spl_db & spl_dba (Cases 3 & 4)
    rawBand:       bandSchema,  // as entered, in the unit implied by noiseInputType
    swl:           bandSchema,  // ALWAYS the resulting octave-band Sound Power Level in dB
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