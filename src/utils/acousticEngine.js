/**
 * DG-SARIA Acoustic Calculation Engine
 * Mirrors the Excel workbook formulas exactly.
 * All SPL/SWL values are in dB. Bands: [63,125,250,500,1000,2000,4000,8000] Hz
 */

const BANDS = [63, 125, 250, 500, 1000, 2000, 4000, 8000];

// A-weighting corrections per octave band
const A_WEIGHT = [-26.2, -16.1, -8.6, -3.2, 0, 1.2, 1.0, 1.1];

// NC curve values per band [63,125,250,500,1000,2000,4000,8000]
const NC_CURVES = {
  15:  [47, 36, 29, 22, 17, 14, 12, 11],
  20:  [51, 40, 33, 26, 22, 19, 17, 16],
  25:  [54, 44, 37, 31, 27, 24, 22, 21],
  30:  [57, 48, 41, 35, 31, 29, 28, 27],
  35:  [60, 52, 45, 40, 36, 34, 33, 32],
  40:  [64, 56, 50, 45, 41, 39, 38, 37],
  45:  [67, 60, 54, 49, 46, 44, 43, 42],
  50:  [71, 64, 58, 54, 51, 49, 48, 47],
  55:  [74, 67, 62, 58, 56, 54, 53, 52],
  60:  [77, 71, 67, 63, 61, 59, 58, 57],
  65:  [80, 75, 71, 68, 66, 64, 63, 62],
  70:  [83, 79, 75, 72, 71, 70, 69, 68],
  75:  [86, 83, 80, 77, 76, 75, 74, 73],
};

// NR curve values per band
const NR_CURVES = {
  0:   [55, 36, 22, 12, 5,  0, -4, -6],
  10:  [62, 43, 29, 19, 12, 7,  3,  1],
  20:  [69, 50, 37, 26, 19, 14, 11,  8],
  25:  [73, 54, 41, 30, 23, 18, 14, 12],
  30:  [76, 57, 45, 34, 27, 22, 18, 15],
  35:  [79, 61, 49, 38, 31, 26, 22, 19],
  40:  [83, 65, 53, 42, 35, 30, 26, 23],
  45:  [86, 68, 57, 46, 39, 34, 30, 27],
  50:  [90, 72, 61, 50, 43, 38, 34, 32],
  55:  [93, 76, 65, 54, 47, 42, 38, 36],
  60:  [96, 80, 69, 58, 51, 46, 43, 40],
  65:  [100, 84, 73, 63, 56, 50, 47, 44],
  70:  [103, 87, 77, 67, 60, 54, 51, 48],
  75:  [107, 91, 81, 71, 64, 58, 55, 52],
  80:  [110, 95, 85, 75, 68, 62, 59, 56],
  85:  [113, 99, 89, 79, 72, 67, 63, 61],
  90:  [117, 102, 93, 83, 76, 71, 67, 65],
};

// ── Helper: logarithmic addition of two dB values
function logAdd(a, b) {
  if (!isFinite(a) && !isFinite(b)) return -Infinity;
  if (!isFinite(a)) return b;
  if (!isFinite(b)) return a;
  return 10 * Math.log10(Math.pow(10, a / 10) + Math.pow(10, b / 10));
}

// ── Helper: log-sum an array of dB values
function logSum(arr) {
  return arr.reduce((acc, v) => logAdd(acc, v), -Infinity);
}

// ── Convert band object {hz63..hz8000} to array
function bandToArr(b) {
  return [b.hz63, b.hz125, b.hz250, b.hz500, b.hz1000, b.hz2000, b.hz4000, b.hz8000];
}

// ── Convert array to band object
function arrToBand(arr) {
  return {
    hz63: arr[0], hz125: arr[1], hz250: arr[2], hz500: arr[3],
    hz1000: arr[4], hz2000: arr[5], hz4000: arr[6], hz8000: arr[7],
  };
}

// ── Room constant R = S * α / (1 - α)
function roomConstant(length, width, height, alpha) {
  const S = 2 * (length * width + length * height + width * height);
  return S * alpha / (1 - alpha);
}

// ── Distance correction: 10 * log10(Q / (4π * r²))  [free field]
function distanceCorrection(r, Q) {
  return 10 * Math.log10(Q / (4 * Math.PI * r * r));
}

// ── Area correction: 10 * log10(duct area in m²) — from Excel
function areaCorrection(width_mm, height_mm) {
  const area = (width_mm / 1000) * (height_mm / 1000);
  return 10 * Math.log10(area);
}

// ── End reflection loss for duct terminated in wall (from Excel lookup table)
//    Simplified formula: ERL ≈ 10 * log10(1 + (fc/f)^4) where fc = c/πd
function endReflectionLoss(width_mm, height_mm, terminationType) {
  // Use equivalent diameter of rectangular opening
  const area   = (width_mm / 1000) * (height_mm / 1000);
  const perim  = 2 * ((width_mm + height_mm) / 1000);
  const deq_m  = 4 * area / perim;  // hydraulic diameter

  const c = 344; // speed of sound m/s
  return BANDS.map(f => {
    const fc = c / (Math.PI * deq_m);
    const raw = -10 * Math.log10(1 + Math.pow(f / fc, 4));
    // Cap: wall reduces ERL vs free space
    const cap = terminationType === "wall" ? -2 : 0;
    return Math.min(raw, cap);
  });
}

// ── Unlined rectangular duct insertion loss (per metre) — from Excel Table 1
//    Formula: IL = A * (P/S)^B * t^C  where t=thickness (not used for unlined)
function unlinedDuctIL(width_mm, height_mm) {
  const W = width_mm / 1000;
  const H = height_mm / 1000;
  const P = 2 * (W + H);
  const S = W * H;
  const PS = P / S;

  // Coefficients from Excel Table 1
  const A = [0.01330, 0.0574, 0.271,  1.0147, 1.770,  1.392,  1.518,  1.581];
  const B = [1.959,   1.410,  0.824,  0.500,  0.695,  0.802,  0.451,  0.219];

  return BANDS.map((_, i) => -(A[i] * Math.pow(PS, B[i])));
}

// ── 1-inch lined duct IL (per metre) from Excel Table 2 coefficients
function linedDuctIL(width_mm, height_mm, thickness_inch) {
  const W = width_mm / 1000;
  const H = height_mm / 1000;
  const P = 2 * (W + H);
  const S = W * H;
  const PS = P / S;
  const t = thickness_inch;

  const A = [0.01330, 0.0574, 0.271,  1.0147, 1.770,  1.392,  1.518,  1.581];
  const B = [1.959,   1.410,  0.824,  0.500,  0.695,  0.802,  0.451,  0.219];
  const C = [0.917,   0.941,  1.079,  1.087,  0,      0,      0,      0];

  return BANDS.map((_, i) => {
    const tFactor = C[i] !== 0 ? Math.pow(t, C[i]) : 1;
    return -(A[i] * Math.pow(PS, B[i]) * tFactor);
  });
}

// ── NC value from SPL array: lowest NC curve not exceeded
function calcNC(lp_arr) {
  const levels = Object.keys(NC_CURVES).map(Number).sort((a, b) => a - b);
  for (const nc of levels) {
    const curve = NC_CURVES[nc];
    const exceeded = lp_arr.some((lp, i) => lp > curve[i]);
    if (!exceeded) return nc;
  }
  return ">75";
}

// ── NR value from SPL array
function calcNR(lp_arr) {
  const levels = Object.keys(NR_CURVES).map(Number).sort((a, b) => a - b);
  for (const nr of levels) {
    const curve = NR_CURVES[nr];
    const exceeded = lp_arr.some((lp, i) => lp > curve[i]);
    if (!exceeded) return nr;
  }
  return ">90";
}

// ── Overall dB(A) from octave band SPL array
function calcDBA(lp_arr) {
  const aWeighted = lp_arr.map((lp, i) => lp + A_WEIGHT[i]);
  return logSum(aWeighted);
}

/**
 * MAIN CALCULATION FUNCTION
 * Mirrors the Excel sheet row-by-row
 */
function runCalculation(inputs) {
  const { generator, room, duct, attenuator, receiver } = inputs;

  const swl = bandToArr(generator.swl);

  // ── Step 1: Area correction (duct opening area)
  const areaCorrValue = areaCorrection(duct.width_mm, duct.height_mm);
  const swlAtDuct = swl.map(v => v + areaCorrValue);

  // ── Step 2: Distance correction  10·log(Q / 4πr²)
  const distCorr = distanceCorrection(receiver.distance_m, receiver.directivity);
  const distLossArr = BANDS.map(() => distCorr);

  // ── Step 3: Attenuator insertion loss (from user input)
  const attIL = attenuator?.il
    ? bandToArr(attenuator.il).map(v => -Math.abs(v))
    : BANDS.map(() => 0);

  // ── Step 4: Duct insertion loss (unlined or lined, per metre)
  let ductILperM;
  if (duct.lining === "1inch") {
    ductILperM = linedDuctIL(duct.width_mm, duct.height_mm, 1);
  } else if (duct.lining === "2inch") {
    ductILperM = linedDuctIL(duct.width_mm, duct.height_mm, 2);
  } else {
    ductILperM = unlinedDuctIL(duct.width_mm, duct.height_mm);
  }
  const ductIL = ductILperM.map(v => v * duct.length_m);

  // ── Step 5: End reflection loss
  const erlArr = endReflectionLoss(duct.width_mm, duct.height_mm, duct.terminationType);

  // ── Step 6: A-weighting correction (subtract to go to unweighted then add back)
  const aWeightArr = A_WEIGHT;

  // ── Step 7: Resultant LP at receiver per band
  //    LP = SWL + AreaCorr + DistCorr + AttIL + DuctIL + ERL + AWeight
  const lp_arr = swlAtDuct.map((v, i) =>
    v + distLossArr[i] + attIL[i] + ductIL[i] + erlArr[i] + aWeightArr[i]
  );

  // ── Step 8: Combine multiple paths (single path for now)
  // Already have lp_arr from single path

  // ── Step 9: Overall dB(A)
  const total_dba = calcDBA(lp_arr);

  // ── Step 10: NC and NR values
  // Remove A-weighting to get flat SPL for NC/NR
  const lp_flat = lp_arr.map((v, i) => v - aWeightArr[i]);
  const nc_value = calcNC(lp_flat);
  const nr_value = calcNR(lp_flat);

  // ── Step 11: Additional reduction needed per band
  const nc_required_curve = NC_CURVES[receiver.requiredNC] || NC_CURVES[65];
  const additional_needed = lp_flat.map((v, i) =>
    Math.max(0, v - nc_required_curve[i])
  );

  const passes = total_dba <= receiver.required_dba;

  return {
    // Intermediate steps (for detailed report)
    swlAtDuct:           arrToBand(swlAtDuct),
    distanceLoss:        arrToBand(distLossArr),
    attenuatorLoss:      arrToBand(attIL),
    ductInsertionLoss:   arrToBand(ductIL),
    endReflectionLoss:   arrToBand(erlArr),
    aWeighting:          arrToBand(aWeightArr),

    // Final results
    lp_at_receiver:              arrToBand(lp_arr),
    lp_flat_at_receiver:         arrToBand(lp_flat),
    total_lp_dba:                +total_dba.toFixed(1),
    nc_value,
    nr_value,
    passes_dba:                  passes,
    additional_reduction_needed: arrToBand(additional_needed),

    // NR curve values for required level (for table display)
    nc_required_curve:   arrToBand(nc_required_curve),
  };
}

module.exports = { runCalculation, BANDS, A_WEIGHT, logSum, calcDBA, calcNC, calcNR };