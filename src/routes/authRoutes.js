const router = require("express").Router();
const ctrl   = require("../controllers/authController");
const { protect } = require("../middleware/auth");

router.post("/login",  ctrl.login);
router.post("/logout", protect, ctrl.logout);
router.get ("/me",     protect, ctrl.getMe);
router.post("/seed",   ctrl.seed);   // ← REMOVE IN PRODUCTION

module.exports = router;
