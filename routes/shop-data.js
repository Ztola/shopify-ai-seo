const express = require("express");
const router = express.Router();

const {
  getAllCollections,
  getProductsByCollection
} = require("../services/shopify");

/* ===============================================================
   🔥 Route : GET /api/shop-data — DEBUG HARD
================================================================ */
router.get("/shop-data", async (req, res) => {

  console.log("🟡 [shop-data] Route appelée");

  try {
    const shopUrl = req.headers["x-shopify-url"];
    const token   = req.headers["x-shopify-token"];

    console.log("🟡 Headers reçus :", {
      shopUrl,
      token: token ? "OK" : "MISSING"
    });

    if (!shopUrl || !token) {
      console.log("🔴 Headers manquants");
      return res.status(400).json({
        success: false,
        error: "Missing Shopify headers"
      });
    }

    console.log("🟢 Appel getAllCollections...");
    const collections = await getAllCollections(req);
    console.log("🟢 Collections récupérées :", collections?.length);

    if (!collections || !collections.length) {
      console.log("🟠 Aucune collection");
      return res.json({
        success: true,
        data: { collections: [] }
      });
    }

    const finalCollections = [];

    for (const col of collections) {
      console.log("🟡 Collection :", col.id, col.title);

      try {
        const products = await getProductsByCollection(req, col.id);
        console.log(
          `🟢 Produits récupérés pour ${col.id} :`,
          products?.length
        );

        finalCollections.push({
          id: col.id,
          title: col.title,
          handle: col.handle,
          products: (products || []).map(p => ({
            id: p.id,
            title: p.title,
            handle: p.handle,
            optimized:
              typeof p.tags === "string"
                ? p.tags.includes("optimized")
                : false,
            image: p?.image?.src || null,
            price: p?.variants?.[0]?.price || null
          }))
        });

      } catch (productErr) {
        console.error(
          "🔴 ERREUR getProductsByCollection :",
          productErr.message
        );
      }
    }

    console.log("🟢 Réponse envoyée");
    return res.json({
      success: true,
      data: { collections: finalCollections }
    });

  } catch (err) {
    console.error("🔴 ERREUR FATALE shop-data :", err);

    return res.status(500).json({
      success: false,
      error: err.message,
      stack: err.stack
    });
  }
});

module.exports = router;
