const express = require("express");
const router = express.Router();

const {
  getAllCollections,
  getProductsByCollection
} = require("../services/shopify");

/* ===================================================================
   🔥 GET /api/shop-data  
   → Multi-boutiques (headers x-shopify-url & x-shopify-token)
   → Renvoie collections + produits (minimal structure)
=================================================================== */
router.get("/shop-data", async (req, res) => {
  try {
    console.log("📦 [shop-data] Boutique active :", req.headers["x-shopify-url"]);

    const collections = await getAllCollections(req);

    if (!collections || collections.length === 0) {
      return res.json({
        success: true,
        collections: []
      });
    }

    const finalCollections = [];

    for (let col of collections) {
      let products = [];

      try {
        products = await getProductsByCollection(req, col.id);
      } catch (err) {
        console.warn("⚠️ Impossible de récupérer les produits :", col.title);
      }

      finalCollections.push({
        id: col.id,
        title: col.title,
        handle: col.handle,
        url: `https://${req.headers["x-shopify-url"]}/collections/${col.handle}`,
        products: products.map(p => ({
          id: p.id,
          title: p.title,
          handle: p.handle,
          url: `https://${req.headers["x-shopify-url"]}/products/${p.handle}`,
          image: p?.image?.src || null,
          price: p?.variants?.[0]?.price || null,
          optimized: p?.tags?.includes("optimized") || false
        }))
      });
    }

    res.json({
      success: true,
      shop: {
        url: req.headers["x-shopify-url"],
        total_collections: collections.length
      },
      collections: finalCollections
    });

  } catch (err) {
    console.error("❌ ERREUR shop-data.js :", err);

    return res.status(500).json({
      success: false,
      error: err.message || "Erreur interne"
    });
  }
});

module.exports = router;
