const express = require("express");
const router = express.Router();

router.get("/auto-blog-test", (req, res) => {
  res.json({
    success: true,
    message: "Auto-blog route OK — Render détecte bien le fichier."
  });
});

module.exports = router;
