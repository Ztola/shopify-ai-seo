const express = require("express");
const router = express.Router();

const {
  getAllCollections,
  getAllProducts,
  getProductsByCollection
} = require("../services/shopify");

// -------------------------------------------------------------
// 🔥 Route : /api/shop-data
// Retourne toutes les collections + produits de la boutique active
// -------------------------------------------------------------
router.get("/shop-data", async (req, res) => {
  try {
    console.log("📦 Shopify: récupération data…");

    // Le client dynamique se crée automatiquement via req.headers
    const collections = await getAllCollections(req);

    const finalCollections = [];

    for (let c of collections) {
      const products = await getProductsByCollection(req, c.id);

      finalCollections.push({
        id: c.id,
        title: c.title,
        handle: c.handle,
        products: products.map(p => ({
          id: p.id,
          title: p.title,
          handle: p.handle,
          optimized: false, // WP remplacera plus tard
        })),
      });
    }

    res.json({
      success: true,
      data: {
        collections: finalCollections
      }
    });

  } catch (err) {
    console.error("❌ ERREUR shop-data:", err.message);

    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

module.exports = router;
