const Project = require("../models/Project");

const ALLOWED = [
  "jobNumber","name","projectType","clientName","mainContractor","mepContractor",
  "reportNumber","revision","reportDate","siteLocation","equipment","description","status",
];

/* ── GET /api/projects ── */
exports.getProjects = async (req, res) => {
  try {
    const filter = req.user.role === "admin" ? {} : { createdBy: req.user._id };
    const projects = await Project.find(filter)
      .sort({ updatedAt: -1 })
      .populate("createdBy", "name email");
    res.json({ success: true, projects });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ── GET /api/projects/:id ── */
exports.getProject = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id)
      .populate("createdBy","name email")
      .populate("versions.savedBy","name");
    if (!project)
      return res.status(404).json({ success: false, message: "Project not found" });
    if (req.user.role === "engineer" &&
        project.createdBy._id.toString() !== req.user._id.toString())
      return res.status(403).json({ success: false, message: "Access denied" });
    res.json({ success: true, project });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ── POST /api/projects ── */
exports.createProject = async (req, res) => {
  try {
    const data = {};
    ALLOWED.forEach(k => { if (req.body[k] !== undefined) data[k] = req.body[k]; });

    // Clamp equipment to 4
    if (data.equipment) data.equipment = data.equipment.slice(0, 4);

    const project = await Project.create({
      ...data,
      createdBy: req.user._id,
      currentVersion: 1,
      versions: [{
        versionNo: 1,
        label: "v1 — Initial",
        note: "Project created",
        savedBy: req.user._id,
      }],
    });
    res.status(201).json({ success: true, project });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

/* ── PUT /api/projects/:id ── */
exports.updateProject = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project)
      return res.status(404).json({ success: false, message: "Project not found" });
    if (req.user.role === "engineer" &&
        project.createdBy.toString() !== req.user._id.toString())
      return res.status(403).json({ success: false, message: "Access denied" });

    ALLOWED.forEach(k => { if (req.body[k] !== undefined) project[k] = req.body[k]; });
    if (project.equipment) project.equipment = project.equipment.slice(0, 4);

    await project.save();
    res.json({ success: true, project });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

/* ── POST /api/projects/:id/versions — save new version ── */
exports.saveVersion = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project)
      return res.status(404).json({ success: false, message: "Project not found" });
    if (req.user.role === "engineer" &&
        project.createdBy.toString() !== req.user._id.toString())
      return res.status(403).json({ success: false, message: "Access denied" });

    const newVer = (project.currentVersion || 1) + 1;
    const label  = req.body.label || `v${newVer}`;
    const note   = req.body.note  || "";

    project.currentVersion = newVer;
    project.versions.push({
      versionNo: newVer, label, note, savedBy: req.user._id,
    });
    await project.save();
    res.json({ success: true, project });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

/* ── DELETE /api/projects/:id ── */
exports.deleteProject = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project)
      return res.status(404).json({ success: false, message: "Project not found" });
    if (req.user.role === "engineer" &&
        project.createdBy.toString() !== req.user._id.toString())
      return res.status(403).json({ success: false, message: "Access denied" });

    await project.deleteOne();
    res.json({ success: true, message: "Project deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
