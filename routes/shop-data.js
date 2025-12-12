const express = require("express");
const router = express.Router();

const {
  getAllCollections,
  getProductsByCollection
} = require("../services/shopify");

/* ===============================================================
   🔥 Route : GET /api/shop-data
================================================================ */
router.get("/shop-data", async (req, res) => {
  try {
    console.log("📦 [shop-data] Récupération des données…", req.headers["x-shopify-url"]);

    const collections = await getAllCollections(req);

    if (!collections || collections.length === 0) {
      return res.json({
        success: true,
        data: { collections: [] }
      });
    }

    const finalCollections = [];

    for (const col of collections) {
      const products = await getProductsByCollection(req, col.id);

      finalCollections.push({
        id: col.id,
        title: col.title,
        handle: col.handle,
        products: products.map(p => ({
          id: p.id,
          title: p.title,
          handle: p.handle,
          optimized: p?.tags?.includes("optimized") ?? false,
          image: p?.image?.src || null,
          price: p?.variants?.[0]?.price || null
        }))
      });
    }

    // ✅ RÉPONSE FINALE
    return res.json({
      success: true,
      data: { collections: finalCollections }
    });

  } catch (err) {
    console.error("❌ ERREUR shop-data.js :", err);
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

module.exports = router;
