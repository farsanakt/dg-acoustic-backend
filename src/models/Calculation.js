const mongoose = require("mongoose");

const bandSchema = new mongoose.Schema({
  hz63:0, hz125:0, hz250:0, hz500:0,
  hz1000:0, hz2000:0, hz4000:0, hz8000:0,
}, { _id:false });

// Defaults all to Number 0
Object.keys(bandSchema.obj).forEach(k => { bandSchema.obj[k] = { type:Number, default:0 }; });

const attenuatorSchema = new mongoose.Schema({
  model:          { type:String, default:"" },
  width_mm:       { type:Number, default:0  },
  height_mm:      { type:Number, default:0  },
  length_mm:      { type:Number, default:0  },
  pressureDrop_pa:{ type:Number, default:0  },
  il:             { type:Object, default:{}  },
}, { _id:false });

const calculationSchema = new mongoose.Schema({
  project:   { type:mongoose.Schema.Types.ObjectId, ref:"Project", required:true },
  noisePath: { type:String, enum:["exhaust","intake","radiated"], default:"exhaust" },

  /* ── Generator — field names match AcousticInputForm exactly ── */
  generator: {
    equipmentId:          { type:String,  default:"" },
    modelNumber:          { type:String,  default:"" },
    ratedKva:             { type:Number,  default:0  },
    buildingRef:          { type:String,  default:"" },
    swl_dba:              { type:Number,  default:0  },
    noiseInputType:       { type:String,  default:"swl_db",
                            enum:["swl_db","swl_dba","spl_db","spl_dba"] },
    measurementDistance_m:{ type:Number,  default:1  },
    rawBand:              { type:Object,  default:{}  }, // user-entered values
    swl:                  { type:Object,  default:{}  }, // converted SWL dB (sent to engine)
  },

  /* ── Plant room ── */
  room: {
    length_m:    { type:Number, default:0   },
    width_m:     { type:Number, default:0   },
    height_m:    { type:Number, default:0   },
    avgAbsCoeff: { type:Number, default:0.9 },
  },

  /* ── Duct ── */
  duct: {
    width_mm:        { type:Number, default:0        },
    height_mm:       { type:Number, default:0        },
    length_m:        { type:Number, default:0        },
    lining:          { type:String, default:"unlined",
                       enum:["unlined","1inch","2inch"] },
    elbows:          { type:Number, default:0        },
    terminationType: { type:String, default:"wall",
                       enum:["wall","free_space"]    },
  },

  /* ── Attenuator ── */
  attenuator: attenuatorSchema,

  /* ── Receiver ── */
  receiver: {
    description: { type:String, default:""  },
    distance_m:  { type:Number, default:3   },
    directivity: { type:Number, default:2   },
    requiredNC:  { type:Number, default:65  },
    requiredNR:  { type:Number, default:65  },
    required_dba:{ type:Number, default:65  },
  },

  /* ── Computed results ── */
  results: {
    noiseInputType:              { type:String,  default:"swl_db" },
    swlConverted:                { type:Object,  default:{} },
    swlAtDuct:                   { type:Object,  default:{} },
    distanceLoss:                { type:Object,  default:{} },
    attenuatorLoss:              { type:Object,  default:{} },
    ductInsertionLoss:           { type:Object,  default:{} },
    endReflectionLoss:           { type:Object,  default:{} },
    aWeighting:                  { type:Object,  default:{} },
    lp_at_receiver:              { type:Object,  default:{} },
    lp_flat_at_receiver:         { type:Object,  default:{} },
    total_lp_dba:                { type:Number,  default:0  },
    nc_value:                    { type:mongoose.Schema.Types.Mixed, default:0 },
    nr_value:                    { type:mongoose.Schema.Types.Mixed, default:0 },
    passes_dba:                  { type:Boolean, default:false },
    additional_reduction_needed: { type:Object,  default:{} },
    nc_required_curve:           { type:Object,  default:{} },
  },

  calculatedAt: { type:Date },
}, { timestamps:true });

module.exports = mongoose.model("Calculation", calculationSchema);