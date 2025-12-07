const express = require("express");
const router = express.Router();
const { optimizeProduct } = require("../services/ai");
const { getProductById, getProductCollection, updateProduct } = require("../services/shopify");

router.post("/optimize", async (req, res) => {
  try {
    const { productId } = req.body;

    if (!productId) {
      return res.status(400).json({ error: "Missing productId" });
    }

    const product = await getProductById(productId);
    const collection = await getProductCollection(productId);

    const optimized = await optimizeProduct(product, collection);

    // Option : Mise à jour automatique de Shopify
    await updateProduct(productId, optimized);

    res.json({
      success: true,
      optimized
    });
  } catch (e) {
    console.error("❌ API Error:", e);
    res.status(500).json({ error: "Internal Server Error", details: e.message });
  }
});

module.exports = router;
