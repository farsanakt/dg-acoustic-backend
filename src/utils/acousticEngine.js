/**
 * acousticEngine_v3.js
 * Acoustic calculation engine for DG-SARIA
 * All calculations per AAPL Consultants methodology (DIESEL_GENERATOR_1.docx)
 */

"use strict";

// ─── Constants ────────────────────────────────────────────────────────────────

const BANDS = [63, 125, 250, 500, 1000, 2000, 4000, 8000];
const BAND_KEYS = ["hz63","hz125","hz250","hz500","hz1000","hz2000","hz4000","hz8000"];

const A_WEIGHT = [-26.2, -16.1, -8.6, -3.2, 0, 1.2, 1.0, -1.1];

// Lined duct coefficients (from doc Table)
// IL = CoeffA × (P/S)^CoeffB × t^CoeffC × L  (Imperial: ft)
// t = lining thickness in inches
const LINED_COEFFS = {
  "1inch": {
    A: [0.04, 0.08, 0.14, 0.22, 0.32, 0.40, 0.53, 0.53],
    B: [1.959, 1.41, 0.824, 0.5, 0.695, 0.802, 0.451, 0.219],
    C: [0.917, 0.941, 1.079, 1.087, 0, 0, 0, 0],
  },
  "2inch": {
    A: [0.04, 0.08, 0.14, 0.22, 0.32, 0.40, 0.53, 0.53],
    B: [1.959, 1.41, 0.824, 0.5, 0.695, 0.802, 0.451, 0.219],
    C: [0.917, 0.941, 1.079, 1.087, 0, 0, 0, 0],
  },
};

// Elbow IL lookup tables (dB per 90° elbow)
// Rows: duct width ranges [0-200mm, 201-400mm, 401-800mm, 801+mm]
// Cols: [63,125,250,500,1000,2000,4000,8000 Hz]
const ELBOW_UNLINED = [
  [0, 0, 0, 1, 5, 8, 4, 3],
  [0, 1, 5, 5, 8, 4, 3, 3],
  [0, 5, 5, 8, 4, 3, 3, 3],
  [1, 5, 8, 4, 3, 3, 3, 3],
];
const ELBOW_LINED = [
  [0, 0, 0, 1, 6, 11, 10, 10],
  [0, 1, 6, 6, 11, 10, 10, 10],
  [0, 6, 6, 11, 10, 10, 10, 10],
  [1, 6, 11, 10, 10, 10, 10, 10],
];

// NC curve reference values [63,125,250,500,1000,2000,4000,8000 Hz]
const NC_CURVES = {
  15:  [47, 36, 29, 22, 17, 14, 12, 11],
  20:  [51, 40, 33, 26, 22, 19, 17, 16],
  25:  [54, 44, 37, 31, 27, 24, 22, 21],
  30:  [57, 48, 41, 35, 31, 29, 28, 27],
  35:  [60, 52, 45, 40, 36, 34, 33, 32],
  40:  [64, 57, 50, 45, 41, 39, 38, 37],
  45:  [67, 60, 54, 49, 46, 44, 43, 42],
  50:  [71, 64, 58, 54, 51, 49, 48, 47],
  55:  [74, 67, 62, 58, 56, 54, 53, 52],
  60:  [77, 71, 67, 63, 61, 59, 58, 57],
  65:  [80, 75, 71, 68, 66, 64, 63, 62],
  70:  [83, 79, 75, 72, 71, 70, 69, 68],
};

// NR curve reference values [63,125,250,500,1000,2000,4000,8000 Hz]
const NR_CURVES = {
  0:  [55, 36, 22, 12, 5, 0, -4, -6],
  5:  [59, 40, 26, 16, 9, 4, 0, -2],
  10: [63, 44, 30, 20, 13, 8, 4, 2],
  15: [67, 48, 34, 24, 17, 12, 8, 6],
  20: [71, 52, 38, 28, 21, 16, 12, 10],
  25: [74, 56, 42, 32, 25, 20, 16, 14],
  30: [78, 60, 46, 36, 29, 24, 20, 18],
  35: [82, 64, 50, 40, 33, 28, 24, 22],
  40: [86, 68, 54, 44, 37, 32, 28, 26],
  45: [90, 72, 58, 48, 41, 36, 32, 30],
  50: [93, 76, 62, 52, 45, 40, 36, 34],
  55: [97, 80, 66, 56, 49, 44, 40, 38],
  60: [101, 84, 70, 60, 53, 48, 44, 42],
  65: [104, 88, 74, 64, 57, 52, 48, 46],
  70: [108, 92, 78, 68, 61, 56, 52, 50],
  75: [112, 96, 82, 72, 65, 60, 56, 54],
  80: [116, 100, 86, 76, 69, 64, 60, 58],
};

// Speed of sound in ft/s
const CO_FT = 1125.33;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convert band object to array */
function bandToArr(obj) {
  return BAND_KEYS.map(k => (obj && obj[k] != null ? Number(obj[k]) : 0));
}

/** Convert array to band object */
function arrToBand(arr) {
  const out = {};
  BAND_KEYS.forEach((k, i) => { out[k] = arr[i] ?? 0; });
  return out;
}

/** Add two band arrays (energy or linear sum) */
function bandAdd(a, b) {
  return a.map((v, i) => v + b[i]);
}

/** Subtract two band arrays */
function bandSub(a, b) {
  return a.map((v, i) => v - b[i]);
}

/** 10·log10(sum(10^(x/10))) for energy sum */
function energySum(values) {
  const sum = values.reduce((acc, v) => acc + Math.pow(10, v / 10), 0);
  return 10 * Math.log10(sum);
}

/** Convert mm to ft */
const mmToFt = mm => mm / 304.8;

/** Convert m to ft */
const mToFt = m => m / 0.3048;

// ─── Case 1-4 SWL Conversion ──────────────────────────────────────────────────

/**
 * Convert raw input bands to SWL per octave band (dB re 1pW)
 * noiseInputType: 'swl_db' | 'swl_dba' | 'spl_db' | 'spl_dba'
 * For spl types: SWL = SPL + 10·log10(4πr²) where r = measurementDistance_m
 * For dBA types: subtract A-weighting to get flat
 */
function convertToSWL(rawBand, noiseInputType, measurementDistance_m) {
  let arr = bandToArr(rawBand);
  const r = Number(measurementDistance_m) || 1;

  // If SPL, add distance correction to get SWL
  if (noiseInputType === "spl_db" || noiseInputType === "spl_dba") {
    const distCorr = 10 * Math.log10(4 * Math.PI * r * r);
    arr = arr.map(v => v + distCorr);
  }

  // If dBA input, subtract A-weighting to get flat SWL
  if (noiseInputType === "swl_dba" || noiseInputType === "spl_dba") {
    arr = arr.map((v, i) => v - A_WEIGHT[i]);
  }

  return arr;
}

// ─── Lined Duct IL ────────────────────────────────────────────────────────────

/**
 * IL = CoeffA × (P/S)^CoeffB × t^CoeffC × L
 * width_mm, height_mm: duct dimensions in mm
 * length_m: duct length in meters
 * lining: '1inch' | '2inch'
 * coeffA: optional per-band override (from manufacturer), else use table
 */
function linedDuctIL(width_mm, height_mm, length_m, lining, coeffAOverride) {
  const w_ft = mmToFt(width_mm);
  const h_ft = mmToFt(height_mm);
  const l_ft = mToFt(length_m);
  const t = lining === "2inch" ? 2 : 1; // thickness in inches

  const P = 2 * (w_ft + h_ft); // perimeter in ft
  const S = w_ft * h_ft;       // cross-section area in ft²
  const PS = S > 0 ? P / S : 0;

  const coeffs = LINED_COEFFS[lining] || LINED_COEFFS["1inch"];

  return BANDS.map((_, i) => {
    const A = coeffAOverride && coeffAOverride[BAND_KEYS[i]] != null
      ? Number(coeffAOverride[BAND_KEYS[i]])
      : coeffs.A[i];
    const B = coeffs.B[i];
    const C = coeffs.C[i];
    const il = A * Math.pow(PS, B) * (C !== 0 ? Math.pow(t, C) : 1) * l_ft;
    return Math.max(0, il);
  });
}

// ─── Unlined Duct IL ──────────────────────────────────────────────────────────

/**
 * Two formulas based on P/S ratio:
 *   P/S >= 3: IL = 17.0 × (P/S)^1.0 × L  (per octave, same all bands)
 *   P/S < 3:  IL = 34.0 × (S)^-0.5 × L
 * All in ft units
 */
function unlinedDuctIL(width_mm, height_mm, length_m) {
  const w_ft = mmToFt(width_mm);
  const h_ft = mmToFt(height_mm);
  const l_ft = mToFt(length_m);

  const P = 2 * (w_ft + h_ft);
  const S = w_ft * h_ft;
  const PS = S > 0 ? P / S : 0;

  let ilPerBand;
  if (PS >= 3) {
    const val = 17.0 * PS * l_ft;
    ilPerBand = BANDS.map(() => Math.max(0, val));
  } else {
    const val = 34.0 * Math.pow(S, -0.5) * l_ft;
    ilPerBand = BANDS.map(() => Math.max(0, val));
  }
  return ilPerBand;
}

// ─── Elbow IL ─────────────────────────────────────────────────────────────────

/**
 * Lookup IL for one elbow, scale by number of elbows
 * ductWidth_mm: the duct width for range selection
 * lining: 'unlined' | '1inch' | '2inch'
 * numElbows: number of 90° elbows
 */
function elbowIL(ductWidth_mm, lining, numElbows) {
  const table = lining === "unlined" ? ELBOW_UNLINED : ELBOW_LINED;
  let row;
  if (ductWidth_mm <= 200)       row = 0;
  else if (ductWidth_mm <= 400)  row = 1;
  else if (ductWidth_mm <= 800)  row = 2;
  else                           row = 3;
  return table[row].map(v => v * numElbows);
}

// ─── End Reflection Loss ──────────────────────────────────────────────────────

/**
 * ERL = 10·log10(1 + (co / (πfD))²)^-1   [with a1=0.7 factor on co]
 * Actually: ERL = -10·log10(1 + (a1·co / (π·f·D))²)
 * where D = sqrt(4·Area / π), Area in ft², co = 1125.33 ft/s
 * terminationType: 'wall' (Q=2, apply ERL) | 'free_space' (Q=4, no ERL per some conventions)
 *  — here we apply ERL for both but adjust below; per doc ERL applies at duct exit
 */
function endReflectionLoss(width_mm, height_mm, terminationType) {
  const w_ft = mmToFt(width_mm);
  const h_ft = mmToFt(height_mm);
  const area_ft2 = w_ft * h_ft;
  const D = Math.sqrt((4 * area_ft2) / Math.PI); // equivalent diameter in ft
  const a1 = 0.7;

  return BANDS.map((f) => {
    const ratio = (a1 * CO_FT) / (Math.PI * f * D);
    const erl = -10 * Math.log10(1 + ratio * ratio);
    // ERL is a loss (negative number), we return as positive IL to subtract from SWL
    return Math.max(0, -erl);
  });
}

// ─── Distance IL ──────────────────────────────────────────────────────────────

/**
 * DIL = 10·log10(Q / (4πr²))  → this gives Lp from Lw
 * Actually Lp = Lw + 10·log10(Q / (4πr²))
 * So as an "IL" (reduction): DIL = -10·log10(Q/(4πr²)) = 10·log10(4πr²/Q)
 */
function distanceIL(distance_m, directivity) {
  const Q = Number(directivity) || 2;
  const r = Number(distance_m) || 3;
  return 10 * Math.log10((4 * Math.PI * r * r) / Q);
}

// ─── Schultz Room Equation ────────────────────────────────────────────────────

/**
 * Per-band offset: offset[i] = -10·log(r) - 5·log(V) - 3·log(f) + 12
 * Then Lp[band] = Lw[band] + offset[band]
 * This function returns just the offset array (to be added to SWL per band)
 */
function schultzOffsets(length_m, width_m, height_m, distance_m) {
  const V = Number(length_m) * Number(width_m) * Number(height_m);
  const r = Number(distance_m) || 3;
  if (V <= 0) return BANDS.map(() => 0);

  return BANDS.map((f) => {
    return (
      -10 * Math.log10(r) -
      5 * Math.log10(V) -
      3 * Math.log10(f) +
      12
    );
  });
}

// ─── NC Rating ────────────────────────────────────────────────────────────────

/**
 * Find NC rating: highest NC curve not exceeded by Lp at any band
 * Returns numeric NC value or ">" + highest available if above all curves
 */
function calcNCRating(lpArr) {
  const levels = Object.keys(NC_CURVES).map(Number).sort((a, b) => a - b);
  for (const nc of levels) {
    const curve = NC_CURVES[nc];
    const passes = lpArr.every((lp, i) => lp <= curve[i]);
    if (passes) return nc;
  }
  return `>${levels[levels.length - 1]}`;
}

// ─── NR Rating ────────────────────────────────────────────────────────────────

/**
 * Find NR rating: highest NR curve not exceeded by Lp at any band
 */
function calcNRRating(lpArr) {
  const levels = Object.keys(NR_CURVES).map(Number).sort((a, b) => a - b);
  for (const nr of levels) {
    const curve = NR_CURVES[nr];
    const passes = lpArr.every((lp, i) => lp <= curve[i]);
    if (passes) return nr;
  }
  return `>${levels[levels.length - 1]}`;
}

// ─── Main Calculation ─────────────────────────────────────────────────────────

/**
 * Run the full acoustic calculation chain.
 * @param {Object} input - Mongoose document or plain object matching Calculation schema
 * @returns {Object} results - computed result fields to merge into calculation.results
 */
function runAcousticCalculation(input) {
  const gen = input.generator || {};
  const room = input.room || {};
  const receiver = input.receiver || {};
  const ducts = input.ducts || [];
  const attenuator = input.attenuator || {};
  const ncNrChoice = receiver.ncNrChoice || "NC";

  // ── Step 1: Convert raw input to SWL ────────────────────────────────────────
  const swlArr = convertToSWL(
    gen.rawBand,
    gen.noiseInputType || "swl_db",
    gen.measurementDistance_m || 1
  );

  // ── Step 2: Attenuator IL ───────────────────────────────────────────────────
  const attILArr = bandToArr(attenuator.il);
  const swlAfterAtt = bandSub(swlArr, attILArr);

  // ── Step 3: Process each duct ───────────────────────────────────────────────
  const ductResultsArr = ducts.map((duct) => {
    const w = Number(duct.width_mm) || 0;
    const h = Number(duct.height_mm) || 0;
    const l = Number(duct.length_m) || 0;
    const lining = duct.lining || "unlined";
    const numElbows = Number(duct.elbows) || 0;

    // Duct IL
    let ductILArr;
    if (lining === "unlined") {
      ductILArr = unlinedDuctIL(w, h, l);
    } else {
      ductILArr = linedDuctIL(w, h, l, lining, duct.coeffA);
    }

    // Elbow IL
    const elbowILArr = elbowIL(w, lining, numElbows);

    // End Reflection Loss
    const erlArr = endReflectionLoss(w, h, duct.terminationType);

    // SWL at duct exit = SWL_after_att - ductIL - elbowIL - ERL
    const totalDuctAttenuation = BAND_KEYS.map((_, i) =>
      ductILArr[i] + elbowILArr[i] + erlArr[i]
    );
    const swlAtExit = swlAfterAtt.map((v, i) => v - totalDuctAttenuation[i]);

    return {
      label: duct.label || `Duct ${ducts.indexOf(duct) + 1}`,
      ductIL: arrToBand(ductILArr),
      elbowIL: arrToBand(elbowILArr),
      endReflectionLoss: arrToBand(erlArr),
      swlAtDuctExit: arrToBand(swlAtExit),
    };
  });

  // ── Step 4: Combine duct exit SWLs (energy sum per band) ──────────────────
  let combinedExitSWL;
  if (ductResultsArr.length === 0) {
    combinedExitSWL = [...swlAfterAtt];
  } else if (ductResultsArr.length === 1) {
    combinedExitSWL = bandToArr(ductResultsArr[0].swlAtDuctExit);
  } else {
    // Energy sum across all duct exits per band
    combinedExitSWL = BAND_KEYS.map((k) => {
      const vals = ductResultsArr.map(dr => dr.swlAtDuctExit[k] || 0);
      return energySum(vals);
    });
  }

  // Combined duct IL = original SWL_after_att - combined exit SWL (for display)
  const combinedDuctIL = swlAfterAtt.map((v, i) => v - combinedExitSWL[i]);

  // ── Step 5: Room / Schultz equation ────────────────────────────────────────
  const V = Number(room.length_m || 0) * Number(room.width_m || 0) * Number(room.height_m || 0);
  const useRoom = V > 0;

  let lpFlatArr;
  let schultzOffsetArr = BANDS.map(() => 0);
  let spaceRoomEffectArr = BANDS.map(() => 0);

  if (useRoom) {
    // Schultz room equation: offset per band
    schultzOffsetArr = schultzOffsets(
      room.length_m,
      room.width_m,
      room.height_m,
      receiver.distance_m || 3
    );
    // Lp per band from room equation
    spaceRoomEffectArr = combinedExitSWL.map((swl, i) => swl + schultzOffsetArr[i]);
    lpFlatArr = spaceRoomEffectArr;
  } else {
    // Point source / direct field: Lp = SWL - distance IL
    const dil = distanceIL(receiver.distance_m || 3, receiver.directivity || 2);
    lpFlatArr = combinedExitSWL.map(v => v - dil);
  }

  // ── Step 6: Apply A-weighting ──────────────────────────────────────────────
  const lpAWeighted = lpFlatArr.map((v, i) => v + A_WEIGHT[i]);

  // ── Step 7: Total dB(A) ────────────────────────────────────────────────────
  const total_lp_dba = energySum(lpAWeighted);

  // ── Step 8: NC / NR rating ─────────────────────────────────────────────────
  const nc_value = calcNCRating(lpFlatArr);
  const nr_value = calcNRRating(lpFlatArr);

  // ── Step 9: Pass/fail dB(A) ────────────────────────────────────────────────
  const required_dba = Number(receiver.required_dba) || 65;
  const passes_dba = total_lp_dba <= required_dba;

  // ── Step 10: Build results object ──────────────────────────────────────────
  return {
    noiseInputType:      gen.noiseInputType || "swl_db",
    methodUsed:          useRoom ? "schultz" : "distance",
    room_volume_m3:      V,
    swlConverted:        arrToBand(swlArr),
    attenuatorIL:        attILArr,  // array kept for internal use; stored as bandSchema
    ductResults:         ductResultsArr,
    combinedDuctIL:      arrToBand(combinedDuctIL),
    swlAfterAllDucts:    arrToBand(combinedExitSWL),
    schultzOffset:       arrToBand(schultzOffsetArr),
    spaceRoomEffect:     arrToBand(spaceRoomEffectArr),
    lp_flat_at_receiver: arrToBand(lpFlatArr),
    lp_at_receiver:      arrToBand(lpAWeighted),
    total_lp_dba:        Math.round(total_lp_dba * 10) / 10,
    nc_value,
    nr_value,
    passes_dba,
  };
}

module.exports = {
  runAcousticCalculation,
  BANDS,
  BAND_KEYS,
  A_WEIGHT,
  NC_CURVES,
  NR_CURVES,
  energySum,
  arrToBand,
  bandToArr,
};