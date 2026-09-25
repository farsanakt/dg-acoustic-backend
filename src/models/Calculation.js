const mongoose = require("mongoose");

/* ── Reusable octave-band sub-schema ── */
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

const calculationSchema = new mongoose.Schema({
  project:   { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true },
  noisePath: { type: String, enum: ["exhaust","intake","radiated"], default: "exhaust" },

  /* ── Generator ── */
  generator: {
    equipmentId:           { type: String,  default: "" },
    modelNumber:           { type: String,  default: "" },
    ratedKva:              { type: Number,  default: 0  },
    buildingRef:           { type: String,  default: "" },
    swl_dba:               { type: Number,  default: 0  },
    noiseInputType:        { type: String,  default: "swl_db",
                             enum: ["swl_db","swl_dba","spl_db","spl_dba"] },
    measurementDistance_m: { type: Number,  default: 1  },
    rawBand:               bandSchema,   // user-typed values (in selected unit)
    swl:                   bandSchema,   // converted SWL dB (sent to engine)
  },

  /* ── Plant room ── */
  room: {
    length_m:    { type: Number, default: 0   },
    width_m:     { type: Number, default: 0   },
    height_m:    { type: Number, default: 0   },
    avgAbsCoeff: { type: Number, default: 0.9 },
  },

  /* ── Duct ── */
  duct: {
    width_mm:        { type: Number, default: 0 },
    height_mm:       { type: Number, default: 0 },
    length_m:        { type: Number, default: 0 },
    lining:          { type: String, default: "unlined",
                       enum: ["unlined","1inch","2inch"] },
    elbows:          { type: Number, default: 0 },
    terminationType: { type: String, default: "wall",
                       enum: ["wall","free_space"] },
  },

  /* ── Attenuator ── */
  attenuator: {
    model:           { type: String, default: "" },
    width_mm:        { type: Number, default: 0  },
    height_mm:       { type: Number, default: 0  },
    length_mm:       { type: Number, default: 0  },
    pressureDrop_pa: { type: Number, default: 0  },
    il:              bandSchema,
  },

  /* ── Receiver ── */
  receiver: {
    description: { type: String, default: ""  },
    distance_m:  { type: Number, default: 3   },
    directivity: { type: Number, default: 2   },
    requiredNC:  { type: Number, default: 65  },
    requiredNR:  { type: Number, default: 65  },
    required_dba:{ type: Number, default: 65  },
  },

  /* ── Computed results ── */
  results: {
    noiseInputType:              { type: String,  default: "swl_db" },
    swlConverted:                bandSchema,
    swlAtDuct:                   bandSchema,
    distanceLoss:                bandSchema,
    attenuatorLoss:              bandSchema,
    ductInsertionLoss:           bandSchema,
    endReflectionLoss:           bandSchema,
    aWeighting:                  bandSchema,
    lp_at_receiver:              bandSchema,
    lp_flat_at_receiver:         bandSchema,
    total_lp_dba:                { type: Number,  default: 0     },
    nc_value:                    { type: mongoose.Schema.Types.Mixed, default: 0 },
    nr_value:                    { type: mongoose.Schema.Types.Mixed, default: 0 },
    passes_dba:                  { type: Boolean, default: false  },
    additional_reduction_needed: bandSchema,
    nc_required_curve:           bandSchema,
  },

  calculatedAt: { type: Date },
}, { timestamps: true });

module.exports = mongoose.model("Calculation", calculationSchema);