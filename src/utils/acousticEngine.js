/**
 * acousticEngine.js  — DG-SARIA Acoustic Calculation Engine
 *
 * Implements the full chain from DIESEL_GENERATOR.docx + DIESEL_GENERATOR_1.docx:
 *
 *  1. SWL conversion  (Cases 1-4: SWL dB, SWL dB(A), SPL dB, SPL dB(A))
 *  2. Lined duct IL   (Coeff A/B/C per octave band, P/S formula)
 *  3. Unlined duct IL (two formulas based on P/S ratio)
 *  4. Elbow IL        (lookup table — unlined or lined, based on duct width)
 *  5. End reflection loss  (ERL formula with D = sqrt(4A/π))
 *  6. Attenuator IL   (user-supplied per band)
 *  7. Distance IL     (10·log(Q/4πr²))
 *  8. Schultz room LP (Lp = Lw - 10logR - 5logV - 3logf + 12)
 *  9. A-weighting → LP dB(A)
 * 10. Total LP dB(A), NC curve, NR curve, pass/fail
 */

/* ── Constants ────────────────────────────────────────────── */
const BANDS     = [63, 125, 250, 500, 1000, 2000, 4000, 8000];
const BAND_KEYS = ["hz63","hz125","hz250","hz500","hz1000","hz2000","hz4000","hz8000"];

const A_WEIGHT  = [-26.2, -16.1, -8.6, -3.2, 0, 1.2, 1.0, -1.1];

const SPEED_OF_SOUND_FT = 1125.33; // ft/s

/* ── Lined duct coefficients (DIESEL_GENERATOR_1.docx, Table 1-inch lining) ── */
// Format: [63, 125, 250, 500, 1000, 2000, 4000, 8000]
const LINED_1INCH = {
  A: [0.04, 0.08, 0.14, 0.22, 0.32, 0.40, 0.53, 0.53],
  B: [1.959, 1.41, 0.824, 0.5, 0.695, 0.802, 0.451, 0.219],
  C: [0.917, 0.941, 1.079, 1.087, 0, 0, 0, 0],
};
// 2-inch: same structure but different coefficients (commonly 2× attenuation estimate)
// Using standard ASHRAE 2-inch lined duct coefficients
const LINED_2INCH = {
  A: [0.05, 0.10, 0.20, 0.35, 0.55, 0.70, 0.80, 0.80],
  B: [2.200, 1.800, 1.100, 0.750, 0.900, 1.000, 0.600, 0.300],
  C: [0.917, 0.941, 1.079, 1.087, 0, 0, 0, 0],
};

/* ── Elbow IL lookup tables (DIESEL_GENERATOR_1.docx) ────── */
// Rows: duct width ranges [100-125, 260-700, 710-1000, 1010-2000] mm
// Cols: [63, 125, 250, 500, 1000, 2000, 4000, 8000]
const ELBOW_UNLINED = [
  [0, 0, 0, 1, 5, 8, 4, 3],  // width 100–125 mm
  [0, 1, 5, 5, 8, 4, 3, 3],  // width 260–700 mm
  [0, 5, 5, 8, 4, 3, 3, 3],  // width 710–1000 mm
  [1, 5, 8, 4, 3, 3, 3, 3],  // width 1010–2000 mm
];
const ELBOW_LINED = [
  [0, 0, 0, 1, 6, 11, 10, 10],
  [0, 1, 6, 6, 11, 10, 10, 10],
  [0, 6, 6, 11, 10, 10, 10, 10],
  [1, 6, 11, 10, 10, 10, 10, 10],
];

/* ── NC reference curves (SPL per octave band at NC rating) ── */
const NC_CURVES = {
  15: [47,36,29,22,17,14,12,11], 20: [51,40,33,26,22,19,17,16],
  25: [54,44,37,31,27,24,22,21], 30: [57,48,41,35,31,29,28,27],
  35: [60,52,45,40,36,34,33,32], 40: [64,56,50,45,41,39,38,37],
  45: [67,60,54,49,46,44,43,42], 50: [71,64,58,54,51,49,48,47],
  55: [74,67,62,58,56,54,53,52], 60: [77,71,67,63,61,59,58,57],
  65: [80,75,71,68,66,64,63,62], 70: [83,79,75,72,71,70,69,68],
};

/* ── NR reference curves ── */
const NR_CURVES = {
  0: [55,35,22,12,4,0,-3,-6], 5: [58,38,25,15,7,3,0,-3],
  10: [61,41,28,18,10,6,3,0], 15: [64,44,31,21,13,9,6,3],
  20: [67,47,34,24,16,12,9,6], 25: [70,50,37,27,19,15,12,9],
  30: [73,53,40,30,22,18,15,12], 35: [76,56,43,33,25,21,18,15],
  40: [79,59,46,36,28,24,21,18], 45: [82,62,49,39,31,27,24,21],
  50: [85,65,52,42,34,30,27,24], 55: [88,68,55,45,37,33,30,27],
  60: [91,71,58,48,40,36,33,30], 65: [94,74,61,51,43,39,36,33],
  70: [97,77,64,54,46,42,39,36],
};

/* ── Helpers ──────────────────────────────────────────────── */
function r1(n) { return Math.round(n * 10) / 10; }
function r2(n) { return Math.round(n * 100) / 100; }
function mmToFt(mm) { return mm / 304.8; }
function mToFt(m)   { return m  * 3.28084; }

function logE(x) { return x > 0 ? Math.log10(x) : 0; }

function bandObj(arr) {
  const o = {};
  BAND_KEYS.forEach((k, i) => { o[k] = r2(arr[i]); });
  return o;
}

/* ── Elbow row index from duct width mm ─────────────────── */
function elbowRowIndex(widthMm) {
  if (widthMm <= 125)  return 0;
  if (widthMm <= 700)  return 1;
  if (widthMm <= 1000) return 2;
  return 3;
}

/* ══════════════════════════════════════════════════════════
   STEP 1 — SWL Conversion (Cases 1-4 from original doc)
   ══════════════════════════════════════════════════════════ */
function convertToSWL(noiseInputType, rawBand, distance_m) {
  const r = distance_m > 0 ? distance_m : 1;
  const distanceTerm = 10 * Math.log10(4 * Math.PI * r * r);
  return BAND_KEYS.map((k, i) => {
    const raw = rawBand?.[k] ?? 0;
    if (noiseInputType === "swl_dba")      return r2(raw - A_WEIGHT[i]);
    if (noiseInputType === "spl_db")       return r2(raw + distanceTerm);
    if (noiseInputType === "spl_dba")      return r2((raw - A_WEIGHT[i]) + distanceTerm);
    return r2(raw); // swl_db — Case 1, direct
  });
}

/* ══════════════════════════════════════════════════════════
   STEP 2 — Lined Duct IL  (formula from doc, Coeff A/B/C)
   IL = A * (P/S)^B * t^C * l    (per band)

   We implement using the standard equation variant:
   IL = Coeff_A * (P/S)^Coeff_B * (thickness_in)^Coeff_C * length_ft
   ══════════════════════════════════════════════════════════ */
function linedDuctIL(widthMm, heightMm, lengthM, lining, coeffA_custom) {
  const wFt = mmToFt(widthMm);
  const hFt = mmToFt(heightMm);
  const lFt = mToFt(lengthM);
  const P   = 2 * (wFt + hFt);
  const S   = wFt * hFt;
  const PS  = S > 0 ? P / S : 0;
  const t   = lining === "2inch" ? 2 : 1;   // thickness in inches
  const tbl = lining === "2inch" ? LINED_2INCH : LINED_1INCH;

  return BAND_KEYS.map((_, i) => {
    const A = (coeffA_custom && coeffA_custom[BAND_KEYS[i]] != null)
              ? (coeffA_custom[BAND_KEYS[i]])
              : tbl.A[i];
    const B = tbl.B[i];
    const C = tbl.C[i];
    const il = A * Math.pow(PS, B) * Math.pow(t, C) * lFt;
    return r2(Math.max(0, il));
  });
}

/* ══════════════════════════════════════════════════════════
   STEP 3 — Unlined Duct IL  (two-formula, DIESEL_GENERATOR_1.docx)
   ══════════════════════════════════════════════════════════ */
function unlinedDuctIL(widthMm, heightMm, lengthM) {
  const wFt = mmToFt(widthMm);
  const hFt = mmToFt(heightMm);
  const lFt = mToFt(lengthM);
  const P   = 2 * (wFt + hFt);
  const S   = wFt * hFt;
  const PS  = S > 0 ? P / S : 0;

  return BANDS.map((f) => {
    let il;
    if (PS >= 3) {
      il = -1 * 17.0 * Math.pow(PS, -0.25) * Math.pow(f, -0.85) * lFt;
    } else {
      il = -1 * 1.64 * Math.pow(Math.max(PS, 0.001), 0.73) * Math.pow(f, -0.58) * lFt;
    }
    // IL here is negative (insertion LOSS attenuates sound)
    return r2(il); // keep sign; we'll negate when subtracting from SWL
  });
}

/* ══════════════════════════════════════════════════════════
   STEP 4 — Elbow IL  (lookup table × number of elbows)
   ══════════════════════════════════════════════════════════ */
function elbowIL(widthMm, elbowCount, lining) {
  const row   = elbowRowIndex(widthMm);
  const table = lining === "unlined" ? ELBOW_UNLINED : ELBOW_LINED;
  const perElbow = table[row];
  return perElbow.map(v => r2(v * elbowCount));
}

/* ══════════════════════════════════════════════════════════
   STEP 5 — End Reflection Loss
   ERL = 10·log10( 1 + (0.7·co / (π·f·D))² )^-1
   D = sqrt(4·A / π),  co in ft/s,  D in ft
   ══════════════════════════════════════════════════════════ */
function endReflectionLoss(widthMm, heightMm) {
  const wFt = mmToFt(widthMm);
  const hFt = mmToFt(heightMm);
  const A   = wFt * hFt;
  const D   = Math.sqrt(4 * A / Math.PI);

  return BANDS.map(f => {
    const arg = (0.7 * SPEED_OF_SOUND_FT) / (Math.PI * f * D);
    const erl = 10 * Math.log10(Math.pow(1 + arg * arg, -1));
    return r2(erl); // negative value (loss)
  });
}

/* ══════════════════════════════════════════════════════════
   STEP 6 — Distance IL
   IL = 10·log10( Q / (4·π·r²) )
   ══════════════════════════════════════════════════════════ */
function distanceIL(Q, r_m) {
  const r = r_m > 0 ? r_m : 1;
  const il = 10 * Math.log10(Q / (4 * Math.PI * r * r));
  return r2(il); // negative (loss), same for all bands
}

/* ══════════════════════════════════════════════════════════
   STEP 7 — Schultz Room Effect (frequency-dependent)
   Lp = Lw + offset_per_band
   offset = -10logR - 5logV - 3logf + 12  (SI units)
   ══════════════════════════════════════════════════════════ */
function schultzOffset(r_m, V_m3) {
  return BANDS.map(f => {
    const delta = -10 * logE(r_m) - 5 * logE(V_m3) - 3 * logE(f) + 12;
    return r2(delta);
  });
}

/* ══════════════════════════════════════════════════════════
   STEP 8 — Logarithmic sum of array of SPL values
   ══════════════════════════════════════════════════════════ */
function logSum(arr) {
  const sum = arr.reduce((acc, v) => acc + Math.pow(10, v / 10), 0);
  return r2(10 * Math.log10(sum));
}

/* ══════════════════════════════════════════════════════════
   STEP 9 — NC / NR determination
   ══════════════════════════════════════════════════════════ */
function findNCValue(lpBands) {
  const vals = BAND_KEYS.map((k, i) => lpBands[k] ?? 0);
  const ncLevels = Object.keys(NC_CURVES).map(Number).sort((a,b)=>a-b);
  for (const nc of ncLevels) {
    const curve = NC_CURVES[nc];
    if (vals.every((v, i) => v <= curve[i])) return nc;
  }
  return `>${ncLevels[ncLevels.length - 1]}`;
}

function findNRValue(lpBands) {
  const vals = BAND_KEYS.map((k, i) => lpBands[k] ?? 0);
  const nrLevels = Object.keys(NR_CURVES).map(Number).sort((a,b)=>a-b);
  for (const nr of nrLevels) {
    const curve = NR_CURVES[nr];
    if (vals.every((v, i) => v <= curve[i])) return nr;
  }
  return `>${nrLevels[nrLevels.length - 1]}`;
}

/* ══════════════════════════════════════════════════════════
   MAIN CALCULATION FUNCTION
   ══════════════════════════════════════════════════════════ */
function runAcousticCalculation(input) {
  const { generator, room, duct, attenuator, receiver } = input;
  const g = generator;
  const rc = receiver;

  /* ── STEP 1: SWL at source ─────────────────────────── */
  const swlArr = convertToSWL(
    g.noiseInputType,
    g.rawBand,
    g.measurementDistance_m
  );
  // If swl is pre-computed by the form, trust it; else compute here
  const swlFinal = (g.swl && BAND_KEYS.some(k => (g.swl[k] ?? 0) !== 0))
    ? BAND_KEYS.map(k => g.swl[k] ?? 0)
    : swlArr;

  /* ── STEP 2: Duct IL (lined or unlined) ───────────── */
  let ductILArr;
  if (duct.lining === "unlined") {
    ductILArr = unlinedDuctIL(duct.width_mm, duct.height_mm, duct.length_m);
    // unlinedDuctIL returns negative values; convert to positive IL for subtraction
    ductILArr = ductILArr.map(v => Math.abs(v));
  } else {
    ductILArr = linedDuctIL(
      duct.width_mm, duct.height_mm, duct.length_m,
      duct.lining,
      duct.coeffA   // optional per-band manufacturer Coeff A
    );
  }

  /* ── STEP 3: Elbow IL ─────────────────────────────── */
  const elbowILArr = elbowIL(duct.width_mm, duct.elbows || 0, duct.lining);

  /* ── STEP 4: End Reflection Loss ──────────────────── */
  const erlArr = endReflectionLoss(duct.width_mm, duct.height_mm);
  const erlPositive = erlArr.map(v => Math.abs(v)); // store as positive loss

  /* ── STEP 5: Attenuator IL ────────────────────────── */
  const attILArr = BAND_KEYS.map(k => attenuator?.il?.[k] ?? 0);

  /* ── STEP 6: SWL at duct exit (after duct losses) ─── */
  // SWL_exit = SWL_source - ductIL - elbowIL - ERL - attenuatorIL
  const swlAtExitArr = swlFinal.map((v, i) =>
    v - ductILArr[i] - elbowILArr[i] - erlPositive[i] - attILArr[i]
  );

  /* ── STEP 7: LP at receiver ────────────────────────── */
  // Two methods — use Schultz when room dimensions given, else distance-only
  const V = room.length_m * room.width_m * room.height_m;
  let lpFlatArr;

  if (V > 0 && rc.distance_m > 0) {
    // Schultz room equation: Lp = Lw + (-10logR - 5logV - 3logf + 12)
    const offsets = schultzOffset(rc.distance_m, V);
    lpFlatArr = swlAtExitArr.map((v, i) => v + offsets[i]);
  } else {
    // Distance-only: Lp = Lw + 10·log(Q/4πr²)
    const Q  = rc.directivity ?? 2;
    const dIL = distanceIL(Q, rc.distance_m);
    lpFlatArr = swlAtExitArr.map(v => v + dIL);
  }

  /* ── STEP 8: A-weighted LP ─────────────────────────── */
  const lpAArr = lpFlatArr.map((v, i) => v + A_WEIGHT[i]);

  /* ── STEP 9: Total dB(A) and NC/NR ─────────────────── */
  const total_lp_dba = logSum(lpAArr);
  const lpFlatBands  = bandObj(lpFlatArr);
  const lpABands     = bandObj(lpAArr);

  const nc_value = findNCValue(lpFlatBands);
  const nr_value = findNRValue(lpFlatBands);

  /* ── Build result object ───────────────────────────── */
  return {
    noiseInputType: g.noiseInputType,

    // Intermediate steps
    swlConverted:      bandObj(swlFinal),
    ductIL:            bandObj(ductILArr),
    elbowIL:           bandObj(elbowILArr),
    endReflectionLoss: bandObj(erlPositive),
    attenuatorIL:      bandObj(attILArr),
    swlAtDuctExit:     bandObj(swlAtExitArr),

    // Final LP
    lp_flat_at_receiver: lpFlatBands,
    lp_at_receiver:      lpABands,
    total_lp_dba:        total_lp_dba,

    // Ratings
    nc_value,
    nr_value,

    // Pass/fail
    passes_dba: total_lp_dba <= (rc.required_dba ?? 65),

    // Room / distance method used
    methodUsed: V > 0 ? "schultz" : "distance",
    room_volume_m3: r2(V),
  };
}

module.exports = { runAcousticCalculation };