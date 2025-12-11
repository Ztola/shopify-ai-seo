const express = require("express");
const router = express.Router();

const {
  getAllCollections,
  getProductsByCollection
} = require("../services/shopify");

/* ===============================================================
   🔥 Route : GET /api/shop-data
   → Retourne toutes les collections + leurs produits
   → Utilise automatiquement la boutique envoyée via headers
================================================================ */
router.get("/shop-data", async (req, res) => {
  try {
    console.log("📦 [shop-data] Récupération des données Shopify pour :", req.headers["x-shopify-url"]);

    // 1️⃣ Récupération des collections de la boutique active
    const collections = await getAllCollections(req);

    if (!collections || collections.length === 0) {
      return res.json({
        success: true,
        data: { collections: [] }
      });
    }

    const finalCollections = [];

    // 2️⃣ Pour chaque collection → récupérer les produits
    for (let col of collections) {
      let products = [];

      try {
        products = await getProductsByCollection(req, col.id);
      } catch (err) {
        console.warn("⚠️ Impossible de récupérer produits pour :", col.title, err.message);
      }

      finalCollections.push({
        id: col.id,
        title: col.title,
        handle: col.handle,
        products: products.map(p => ({
          id: p.id,
          title: p.title,
          handle: p.handle,
          created_at: p.created_at,          // 🔥 Date réelle Shopify
          optimized: false,                  // WordPress changera cela
          image: p.image || null,            // 🔥 utile pour Blog IA
          body_html: p.body_html || ""       // 🔥 utile pour IA
        }))
      });
    }

    // 3️⃣ Réponse structurée
    return res.json({
      success: true,
      data: {
        collections: finalCollections
      }
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
