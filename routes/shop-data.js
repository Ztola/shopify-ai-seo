const express = require("express");
const router = express.Router();

const {
  getAllCollections,
  getProductsByCollection
} = require("../services/shopify");

/* ===============================================================
   🔥 Route : GET /api/shop-data
   → Retourne toutes les collections + produits
   → SANS doublons (fix définitif)
================================================================ */
router.get("/shop-data", async (req, res) => {
  try {
    console.log("📦 [shop-data] Récupération Shopify :", req.headers["x-shopify-url"]);

    // 1️⃣ Récupérer toutes les collections
    const collections = await getAllCollections(req);

    if (!collections || collections.length === 0) {
      return res.json({ success: true, data: { collections: [] } });
    }

    const finalCollections = [];

    // 2️⃣ Récupérer les produits pour chaque collection
    for (let col of collections) {
      let products = [];

      try {
        products = await getProductsByCollection(req, col.id);
      } catch (err) {
        console.warn("⚠️ Produits indisponibles pour :", col.title);
      }

      // 🔥 3️⃣ Suppression totale des doublons produits
      const uniqueProducts = [];
      const seenIds = new Set();

      for (let p of products) {
        if (!seenIds.has(p.id)) {
          seenIds.add(p.id);
          uniqueProducts.push(p);
        }
      }

      finalCollections.push({
        id: col.id,
        title: col.title,
        handle: col.handle,
        products: uniqueProducts.map(p => ({
          id: p.id,
          title: p.title,
          handle: p.handle,
          optimized: false
        }))
      });
    }

    return res.json({
      success: true,
      data: { collections: finalCollections }
    });

  } catch (err) {
    console.error("❌ ERREUR shop-data.js :", err);
    return res.status(500).json({
      success: false,
      error: err.message || "Erreur interne serveur"
    });
  }
});

module.exports = router;
