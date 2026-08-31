const router = require("express").Router({ mergeParams: true });
const ctrl   = require("../controllers/calculationController");
const { protect, authorize } = require("../middleware/auth");

router.use(protect);

router.route("/")
  .get(ctrl.getCalculations)
  .post(authorize("engineer", "admin"), ctrl.createCalculation);

router.post("/run", authorize("engineer", "admin"), ctrl.runOnly);

router.route("/:id")
  .get(ctrl.getCalculation)
  .put(authorize("engineer", "admin"), ctrl.updateCalculation)
  .delete(authorize("engineer", "admin"), ctrl.deleteCalculation);

module.exports = router;