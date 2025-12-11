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
    console.log("📦 [shop-data] Récupération des données Shopify…");

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
        console.warn("⚠️ Impossible de récupérer les produits de la collection :", col.title);
      }

      finalCollections.push({
        id: col.id,
        title: col.title,
        handle: col.handle,
        products: products.map(p => ({
          id: p.id,
          title: p.title,
          handle: p.handle,
          optimized: false // WordPress mettra à jour ce champ
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
