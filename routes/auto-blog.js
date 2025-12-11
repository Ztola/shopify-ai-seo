const express = require("express");
const router = express.Router();

const {
  updateActiveShopForCron,
  startAutoBlog,
  stopAutoBlog
} = require("../services/auto-blog");

/* -------------------------------------------------------------
   🔥 ROUTE : Mettre à jour la boutique active (auto-blog)
-------------------------------------------------------------- */
router.post("/auto-blog/update-shop", (req, res) => {
  const { shopUrl, token } = req.body;

  if (!shopUrl || !token) {
    return res.json({ success: false, error: "Missing shopUrl or token" });
  }

  updateActiveShopForCron(shopUrl, token);

  res.json({
    success: true,
    message: "Boutique active mise à jour pour l’auto-blog"
  });
});

/* -------------------------------------------------------------
   🔥 ROUTE : démarrer l’auto-blog
-------------------------------------------------------------- */
router.post("/auto-blog/start", (req, res) => {
  const { time } = req.body;

  startAutoBlog(time || "09:00");

  res.json({
    success: true,
    message: "AutoBlog activé"
  });
});

/* -------------------------------------------------------------
   🔥 ROUTE : arrêter
-------------------------------------------------------------- */
router.post("/auto-blog/stop", (req, res) => {
  stopAutoBlog();

  res.json({
    success: true,
    message: "AutoBlog désactivé"
  });
});

module.exports = router;
