const Calculation = require("../models/Calculation");
const { runCalculation } = require("../utils/acousticEngine");

/* ── GET /api/projects/:projectId/calculations ── */
exports.getCalculations = async (req, res) => {
  try {
    const calcs = await Calculation.find({ project: req.params.projectId })
      .sort({ createdAt: -1 });
    res.json({ success: true, calculations: calcs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ── GET /api/projects/:projectId/calculations/:id ── */
exports.getCalculation = async (req, res) => {
  try {
    const calc = await Calculation.findById(req.params.id);
    if (!calc) return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, calculation: calc });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ── POST /api/projects/:projectId/calculations ── */
exports.createCalculation = async (req, res) => {
  try {
    const inputs = req.body;
    // Run the acoustic engine
    const results = runCalculation(inputs);

    const calc = await Calculation.create({
      project:   req.params.projectId,
      noisePath: inputs.noisePath,
      generator: inputs.generator,
      room:      inputs.room,
      duct:      inputs.duct,
      attenuator:inputs.attenuator,
      receiver:  inputs.receiver,
      results,
      calculatedAt: new Date(),
    });

    res.status(201).json({ success: true, calculation: calc });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

/* ── PUT /api/projects/:projectId/calculations/:id ── */
exports.updateCalculation = async (req, res) => {
  try {
    const inputs  = req.body;
    const results = runCalculation(inputs);

    const calc = await Calculation.findByIdAndUpdate(
      req.params.id,
      { ...inputs, results, calculatedAt: new Date() },
      { new: true, runValidators: true }
    );
    if (!calc) return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, calculation: calc });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

/* ── DELETE /api/projects/:projectId/calculations/:id ── */
exports.deleteCalculation = async (req, res) => {
  try {
    await Calculation.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ── POST /api/projects/:projectId/calculations/run ── */
// Runs calculation without saving (live preview)
exports.runOnly = async (req, res) => {
  try {
    const results = runCalculation(req.body);
    res.json({ success: true, results });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};