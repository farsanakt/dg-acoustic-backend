const router = require("express").Router();
const ctrl   = require("../controllers/projectController");
const { protect, authorize } = require("../middleware/auth");

router.use(protect);

router.route("/")
  .get(ctrl.getProjects)
  .post(authorize("engineer","admin"), ctrl.createProject);

router.route("/:id")
  .get(ctrl.getProject)
  .put(authorize("engineer","admin"),    ctrl.updateProject)
  .delete(authorize("engineer","admin"), ctrl.deleteProject);

router.post("/:id/versions", authorize("engineer","admin"), ctrl.saveVersion);

module.exports = router;
