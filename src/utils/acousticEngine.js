

const BANDS     = [63, 125, 250, 500, 1000, 2000, 4000, 8000];
const BAND_KEYS = ["hz63","hz125","hz250","hz500","hz1000","hz2000","hz4000","hz8000"];

// A-weighting corrections per IEC 61672 (matches DIESEL_GENERATOR.docx)
const A_WEIGHT = [-26.2, -16.1, -8.6, -3.2, 0, 1.2, 1.0, 1.1];

// A-weighting as object (matches form's A_WEIGHTING object)
const A_WEIGHTING = {
  hz63:-26.2, hz125:-16.1, hz250:-8.6,  hz500:-3.2,
  hz1000:0,   hz2000:1.2,  hz4000:1.0,  hz8000:-1.1,
};

const NC_CURVES = {
  15:[47,36,29,22,17,14,12,11], 20:[51,40,33,26,22,19,17,16],
  25:[54,44,37,31,27,24,22,21], 30:[57,48,41,35,31,29,28,27],
  35:[60,52,45,40,36,34,33,32], 40:[64,56,50,45,41,39,38,37],
  45:[67,60,54,49,46,44,43,42], 50:[71,64,58,54,51,49,48,47],
  55:[74,67,62,58,56,54,53,52], 60:[77,71,67,63,61,59,58,57],
  65:[80,75,71,68,66,64,63,62], 70:[83,79,75,72,71,70,69,68],
  75:[86,83,80,77,76,75,74,73],
};

const NR_CURVES = {
  0:[55,36,22,12,5,0,-4,-6],    10:[62,43,29,19,12,7,3,1],
  20:[69,50,37,26,19,14,11,8],  25:[73,54,41,30,23,18,14,12],
  30:[76,57,45,34,27,22,18,15], 35:[79,61,49,38,31,26,22,19],
  40:[83,65,53,42,35,30,26,23], 45:[86,68,57,46,39,34,30,27],
  50:[90,72,61,50,43,38,34,32], 55:[93,76,65,54,47,42,38,36],
  60:[96,80,69,58,51,46,43,40], 65:[100,84,73,63,56,50,47,44],
  70:[103,87,77,67,60,54,51,48],75:[107,91,81,71,64,58,55,52],
  80:[110,95,85,75,68,62,59,56],85:[113,99,89,79,72,67,63,61],
  90:[117,102,93,83,76,71,67,65],
};

// ── Helpers ───────────────────────────────────────────────────
function round1(n) { return Math.round(n * 10) / 10; }

function logAdd(a,b) {
  if (!isFinite(a) && !isFinite(b)) return -Infinity;
  if (!isFinite(a)) return b;
  if (!isFinite(b)) return a;
  return 10 * Math.log10(Math.pow(10,a/10) + Math.pow(10,b/10));
}
function logSum(arr) { return arr.reduce((acc,v) => logAdd(acc,v), -Infinity); }
function bandToArr(b) { return BAND_KEYS.map(k => Number(b?.[k] ?? 0)); }
function arrToBand(arr) {
  const o = {};
  BAND_KEYS.forEach((k,i) => o[k] = isFinite(arr[i]) ? round1(arr[i]) : 0);
  return o;
}

/**
 * SOUND DATA CONVERSION — 4 Cases from DIESEL_GENERATOR.docx
 * Matches the form's computeSWLFromRaw() exactly.
 *
 * Case 1 (swl_db):  SWL dB → used directly
 * Case 2 (swl_dba): SWL dB(A) → SWL_dB = SWL_dBA − A_weighting
 *                   e.g. 500Hz: 95.6 − (−3.2) = 98.8 dB
 * Case 3 (spl_db):  SPL dB → SWL = SPL + 10·log10(4πr²)
 * Case 4 (spl_dba): SPL dB(A) → SPL_dB = SPL_dBA − A_weighting
 *                   then SWL = SPL_dB + 10·log10(4πr²)
 */
function convertToSWL_dB(rawBand, noiseInputType, measurementDistance_m) {
  const r  = Number(measurementDistance_m) > 0 ? Number(measurementDistance_m) : 1;
  const gF = 10 * Math.log10(4 * Math.PI * r * r);  // geometric factor

  const out = {};
  BAND_KEYS.forEach((k, i) => {
    const raw        = Number(rawBand?.[k] ?? 0);
    const correction = A_WEIGHT[i];
    let swl;
    switch (noiseInputType) {
      case "swl_dba": swl = raw - correction;                    break; // Case 2
      case "spl_db":  swl = raw + gF;                            break; // Case 3
      case "spl_dba": swl = (raw - correction) + gF;             break; // Case 4
      default:        swl = raw;                                  break; // Case 1
    }
    out[k] = round1(swl);
  });
  return out;
}

// ── Acoustic calculation helpers ──────────────────────────────
function areaCorrection(width_mm, height_mm) {
  const area = (width_mm / 1000) * (height_mm / 1000);
  return area > 0 ? 10 * Math.log10(area) : 0;
}

function distanceCorrection(r, Q) {
  return 10 * Math.log10(Q / (4 * Math.PI * r * r));
}

function endReflectionLoss(width_mm, height_mm, terminationType) {
  const area  = (width_mm / 1000) * (height_mm / 1000);
  const perim = 2 * ((width_mm + height_mm) / 1000);
  const deq   = perim > 0 ? 4 * area / perim : 0.001;
  return BANDS.map(f => {
    const fc  = 344 / (Math.PI * deq);
    const raw = -10 * Math.log10(1 + Math.pow(f / fc, 4));
    return Math.min(raw, terminationType === "wall" ? -2 : 0);
  });
}

function unlinedDuctIL(width_mm, height_mm) {
  const W = width_mm / 1000, H = height_mm / 1000;
  if (W <= 0 || H <= 0) return BANDS.map(() => 0);
  const PS = 2 * (W + H) / (W * H);
  const A = [0.01330,0.0574,0.271,1.0147,1.770,1.392,1.518,1.581];
  const B = [1.959,1.410,0.824,0.500,0.695,0.802,0.451,0.219];
  return BANDS.map((_,i) => -(A[i] * Math.pow(PS, B[i])));
}

function linedDuctIL(width_mm, height_mm, thickness_inch) {
  const W = width_mm / 1000, H = height_mm / 1000;
  if (W <= 0 || H <= 0) return BANDS.map(() => 0);
  const PS = 2 * (W + H) / (W * H), t = thickness_inch;
  const A = [0.01330,0.0574,0.271,1.0147,1.770,1.392,1.518,1.581];
  const B = [1.959,1.410,0.824,0.500,0.695,0.802,0.451,0.219];
  const C = [0.917,0.941,1.079,1.087,0,0,0,0];
  return BANDS.map((_,i) => -(A[i] * Math.pow(PS, B[i]) * (C[i] ? Math.pow(t, C[i]) : 1)));
}

function calcNC(arr) {
  for (const nc of Object.keys(NC_CURVES).map(Number).sort((a,b) => a-b))
    if (!arr.some((v,i) => v > NC_CURVES[nc][i])) return nc;
  return ">75";
}

function calcNR(arr) {
  for (const nr of Object.keys(NR_CURVES).map(Number).sort((a,b) => a-b))
    if (!arr.some((v,i) => v > NR_CURVES[nr][i])) return nr;
  return ">90";
}

function calcDBA(arr) {
  return logSum(arr.map((v, i) => v + A_WEIGHT[i]));
}

// ── MAIN CALCULATION ──────────────────────────────────────────
function runCalculation(inputs) {
  const { generator, room, duct, attenuator, receiver } = inputs;

  // The form already computes generator.swl (converted SWL dB) via useEffect.
  // We use it directly. If for any reason it's missing, fall back to converting rawBand.
  const swlBand = (generator.swl && BAND_KEYS.some(k => generator.swl[k] !== 0))
    ? generator.swl
    : convertToSWL_dB(
        generator.rawBand || generator.swl,
        generator.noiseInputType || "swl_db",
        generator.measurementDistance_m || 1
      );
  const swl = bandToArr(swlBand);

  // Step 1: Area correction (duct opening)
  const areaCorrVal = areaCorrection(duct.width_mm, duct.height_mm);
  const swlAtDuct   = swl.map(v => v + areaCorrVal);

  // Step 2: Distance correction
  const distCorr    = distanceCorrection(receiver.distance_m, receiver.directivity);
  const distLossArr = BANDS.map(() => distCorr);

  // Step 3: Attenuator IL
  const attIL = attenuator?.il
    ? bandToArr(attenuator.il).map(v => -Math.abs(v))
    : BANDS.map(() => 0);

  // Step 4: Duct IL
  let ductILperM;
  if      (duct.lining === "1inch") ductILperM = linedDuctIL(duct.width_mm, duct.height_mm, 1);
  else if (duct.lining === "2inch") ductILperM = linedDuctIL(duct.width_mm, duct.height_mm, 2);
  else                              ductILperM = unlinedDuctIL(duct.width_mm, duct.height_mm);
  const ductIL = ductILperM.map(v => v * (duct.length_m || 0));

  // Step 5: End reflection loss
  const erlArr = endReflectionLoss(duct.width_mm, duct.height_mm, duct.terminationType);

  // Step 6: LP at receiver (A-weighted)
  const lp_arr = swlAtDuct.map((v, i) =>
    v + distLossArr[i] + attIL[i] + ductIL[i] + erlArr[i] + A_WEIGHT[i]
  );

  // Step 7: Overall and NC/NR
  const total_dba  = calcDBA(lp_arr);
  const lp_flat    = lp_arr.map((v, i) => v - A_WEIGHT[i]);
  const nc_value   = calcNC(lp_flat);
  const nr_value   = calcNR(lp_flat);
  const nc_req     = NC_CURVES[receiver.requiredNC] || NC_CURVES[65];
  const add_needed = lp_flat.map((v, i) => Math.max(0, v - nc_req[i]));

  return {
    // Input type used (for display in results)
    noiseInputType:              generator.noiseInputType || "swl_db",
    swlConverted:                swlBand,

    // Calculation chain
    swlAtDuct:                   arrToBand(swlAtDuct),
    distanceLoss:                arrToBand(distLossArr),
    attenuatorLoss:              arrToBand(attIL),
    ductInsertionLoss:           arrToBand(ductIL),
    endReflectionLoss:           arrToBand(erlArr),
    aWeighting:                  arrToBand(A_WEIGHT),
    lp_at_receiver:              arrToBand(lp_arr),
    lp_flat_at_receiver:         arrToBand(lp_flat),

    // Summaries
    total_lp_dba:                +total_dba.toFixed(1),
    nc_value,
    nr_value,
    passes_dba:                  total_dba <= receiver.required_dba,
    additional_reduction_needed: arrToBand(add_needed),
    nc_required_curve:           arrToBand(nc_req),
  };
}

module.exports = {
  runCalculation, convertToSWL_dB,
  BANDS, BAND_KEYS, A_WEIGHT, A_WEIGHTING,
  logSum, calcDBA, calcNC, calcNR,
};