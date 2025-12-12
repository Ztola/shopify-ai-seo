const express = require("express");
const router = express.Router();

const {
  getAllCollections,
  getProductsByCollection
} = require("../services/shopify");

/* ===============================================================
   🔥 Route : GET /api/shop-data (SAFE & STABLE)
================================================================ */
router.get("/shop-data", async (req, res) => {

  const shopUrl = req.headers["x-shopify-url"];
  const token   = req.headers["x-shopify-token"];

  // 🛑 Sécurité absolue
  if (!shopUrl || !token) {
    console.warn("⛔ [shop-data] Appel sans headers Shopify");

    return res.status(400).json({
      success: false,
      error: "Missing Shopify headers"
    });
  }

  console.log("📦 [shop-data] Récupération des données…", shopUrl);

  try {
    const collections = await getAllCollections(req);

    // Aucune collection → réponse propre
    if (!collections || !collections.length) {
      return res.json({
        success: true,
        data: { collections: [] }
      });
    }

    const finalCollections = [];

    for (const col of collections) {
      try {
        const products = await getProductsByCollection(req, col.id);

        finalCollections.push({
          id: col.id,
          title: col.title,
          handle: col.handle,
          products: (products || []).map(p => ({
            id: p.id,
            title: p.title,
            handle: p.handle,
            optimized: Array.isArray(p.tags)
              ? p.tags.includes("optimized")
              : (typeof p.tags === "string" ? p.tags.includes("optimized") : false),
            image: p?.image?.src || null,
            price: p?.variants?.[0]?.price || null
          }))
        });

      } catch (colErr) {
        // ⚠️ Une collection qui échoue ne casse PAS tout
        console.warn(
          `⚠️ [shop-data] Collection ignorée (${col.id}) :`,
          colErr.message
        );
      }
    }

    // ✅ Réponse finale
    return res.json({
      success: true,
      data: {
        collections: finalCollections
      }
    });

  } catch (err) {
    console.error("❌ [shop-data] ERREUR GLOBALE :", err);

    return res.status(500).json({
      success: false,
      error: err.message || "Internal server error"
    });
  }
});

module.exports = router;
