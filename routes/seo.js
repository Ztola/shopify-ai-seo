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

// Fonction pour découper en batch de 250
function chunkArray(array, size = 250) {
  const result = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

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

router.post("/batch-optimize", async (req, res) => {
  try {
    const { productIds, force } = req.body;

    if (!productIds || !Array.isArray(productIds)) {
      return res.status(400).json({
        error: "productIds must be an array"
      });
    }

    const batches = chunkArray(productIds, 250);
    const results = [];

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];

      console.log(`🚀 Traitement du batch ${i + 1}/${batches.length}`);

      for (const productId of batch) {
        try {
          const already = await isAlreadyOptimized(productId);

          // Sauter produit déjà optimisé sauf si forcé
          if (already && !force) {
            results.push({
              productId,
              status: "skipped",
              reason: "Déjà optimisé"
            });
            continue;
          }

          const product = await getProductById(productId);
          const collection = await getProductCollection(productId);

          const optimized = await optimizeProduct(product, collection);

          await updateProduct(productId, optimized);
          await markAsOptimized(productId);

          results.push({
            productId,
            status: "optimized"
          });

        } catch (err) {
          results.push({
            productId,
            status: "error",
            details: err.message
          });
        }
      }

      // Pause entre les batchs pour respecter API Shopify
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    res.json({
      success: true,
      totalProducts: productIds.length,
      batches: batches.length,
      results
    });

  } catch (e) {
    console.error("❌ Batch Error:", e);
    res.status(500).json({
      error: "Batch optimization failed",
      details: e.message
    });
  }
});


module.exports = router;
