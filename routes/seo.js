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
const { getShopCache, refreshShopCache } = require("../services/cache");

// ---------------------------------------------------------
// 🔥 OPTIMISATION D’UN PRODUIT
// ---------------------------------------------------------
router.post("/optimize", async (req, res) => {
  try {
    const { productId, force } = req.body;

    if (!productId) {
      return res.status(400).json({ error: "Missing productId" });
    }

    const already = await isAlreadyOptimized(productId);

    if (already && !force) {
      return res.json({
        success: false,
        skipped: true,
        message:
          "Produit déjà optimisé. Ajouter { force: true } pour forcer."
      });
    }

    // Charger cache Shopify
    const shopData = await getShopCache();

    const product = await getProductById(productId);
    const collection = await getProductCollection(productId);

    const optimized = await optimizeProduct(product, collection, {
      data: shopData
    });

    await updateProduct(productId, optimized);
    await markAsOptimized(productId);

    res.json({
      success: true,
      optimized
    });

  } catch (error) {
    console.error("❌ OPTIMIZE ERROR:", error);
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------
// ⚡ OPTIMISATION PAR LOT (batch 250)
// ---------------------------------------------------------
router.post("/batch-optimize", async (req, res) => {
  try {
    const { productIds, force } = req.body;

    if (!Array.isArray(productIds)) {
      return res.status(400).json({ error: "productIds must be an array" });
    }

    const shopData = await getShopCache();
    const results = [];

    const chunk = (arr, size = 250) =>
      arr.reduce((acc, _, i) => (i % size ? acc : [...acc, arr.slice(i, i + size)]), []);

    const batches = chunk(productIds);

    for (const batch of batches) {
      for (const productId of batch) {
        try {
          const already = await isAlreadyOptimized(productId);

          if (already && !force) {
            results.push({ productId, status: "skipped" });
            continue;
          }

          const product = await getProductById(productId);
          const collection = await getProductCollection(productId);

          const optimized = await optimizeProduct(product, collection, {
            data: shopData
          });

          await updateProduct(productId, optimized);
          await markAsOptimized(productId);

          results.push({ productId, status: "optimized" });

        } catch (err) {
          results.push({ productId, status: "error", details: err.message });
        }
      }

      await new Promise((r) => setTimeout(r, 300));
    }

    res.json({
      success: true,
      results
    });

  } catch (error) {
    console.error("❌ BATCH ERROR:", error);
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------
// 🔄 RAFRAÎCHIR LE CACHE
// ---------------------------------------------------------
router.get("/cache-refresh", async (req, res) => {
  try {
    const data = await refreshShopCache();

    res.json({
      success: true,
      message: "Cache Shopify mis à jour !",
      data
    });

  } catch (error) {
    console.error("❌ CACHE ERROR:", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
