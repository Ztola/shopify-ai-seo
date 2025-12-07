const express = require("express");
const router = express.Router();

const { 
  getProductById, 
  getProductCollection, 
  updateProduct,
  markAsOptimized,
  isAlreadyOptimized
} = require("../services/shopify");

const { optimizeProduct } = require("../services/ai");

router.post("/optimize", async (req, res) => {
  try {
    const { productId, force } = req.body;

    if (!productId) {
      return res.status(400).json({ error: "Missing productId" });
    }

    // Vérifier si le produit a déjà été optimisé
    const already = await isAlreadyOptimized(productId);

    if (already && !force) {
      return res.json({
        success: false,
        skipped: true,
        message: "Ce produit a déjà été optimisé par l’IA. Pour forcer la ré-optimisation, envoyer { force: true }"
      });
    }

    // Récupération du produit et de la collection
    const product = await getProductById(productId);
    const collection = await getProductCollection(productId);

    // Optimisation avec IA
    const optimized = await optimizeProduct(product, collection);

    // Mise à jour Shopify
    await updateProduct(productId, optimized);

    // Enregistrement de l’état optimisé
    await markAsOptimized(productId);

    res.json({
      success: true,
      optimized,
      forced: force === true
    });

  } catch (e) {
    console.error("❌ API Error:", e);
    res.status(500).json({
      error: "Internal Server Error",
      details: e.message
    });
  }
});

module.exports = router;
