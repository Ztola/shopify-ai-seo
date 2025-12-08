const express = require("express");
const router = express.Router();

const {
  getProductById,
  getProductCollection,
  updateProduct,
  markAsOptimized,
  isAlreadyOptimized,
  getAllProducts,
  getAllCollections,
  getProductsByCollection,
  getAllBlogs,
  getArticlesByBlog
} = require("../services/shopify");

const { optimizeProduct } = require("../services/ai");

// ----------------------------------------------
// 🔧 BASE_URL PROPRE POUR RENDER + LOCAL
// ----------------------------------------------
const BASE_URL =
  process.env.APP_URL || "http://localhost:10000";

console.log("🌍 BASE_URL for API calls:", BASE_URL);


// ----------------------------------------------
// 🧠 ENDPOINT : Récupération des données complètes
// (produits, collections, blogs) pour l’IA
// ----------------------------------------------
router.get("/shop-data", async (req, res) => {
  try {
    console.log("📦 Scraping complet de la boutique…");

    const products = await getAllProducts();
    const collections = await getAllCollections();
    const blogs = await getAllBlogs();

    const blogArticles = {};

    for (const blog of blogs) {
      blogArticles[blog.handle] = await getArticlesByBlog(blog.id);
    }

    res.json({
      success: true,
      products,
      collections,
      blogs,
      blogArticles
    });

  } catch (error) {
    console.error("❌ Error shop-data:", error);
    res.status(500).json({
      error: "Failed to load shop data",
      details: error.message
    });
  }
});


// ----------------------------------------------
// 🎯 OPTIMISATION D’UN PRODUIT
// ----------------------------------------------
router.post("/optimize", async (req, res) => {
  try {
    const { productId, force } = req.body;

    if (!productId) {
      return res.status(400).json({ error: "Missing productId" });
    }

    // Vérifier si déjà optimisé
    const already = await isAlreadyOptimized(productId);

    if (already && !force) {
      return res.json({
        success: false,
        skipped: true,
        message:
          "Produit déjà optimisé. Envoyer { force: true } pour forcer la ré-optimisation."
      });
    }

    // Charger produit + collection
    const product = await getProductById(productId);
    const collection = await getProductCollection(productId);

    // Charger données globales pour maillage interne
    const shopData = await (await fetch(`${BASE_URL}/api/shop-data`)).json();

    // Optimisation IA
    const optimized = await optimizeProduct(product, collection, shopData);

    // Mise à jour Shopify
    await updateProduct(productId, optimized);
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


// ----------------------------------------------
// 🚀 OPTIMISATION PAR LOTS (250 / batch)
// ----------------------------------------------
function chunkArray(array, size = 250) {
  const result = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

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

    // Charger shopData une seule fois pour booster les performances
    const shopData = await (await fetch(`${BASE_URL}/api/shop-data`)).json();

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(`🚀 Traitement du batch ${i + 1}/${batches.length}`);

      for (const productId of batch) {
        try {
          const already = await isAlreadyOptimized(productId);

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

          const optimized = await optimizeProduct(product, collection, shopData);

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

      // Pause courte entre batchs
      await new Promise((resolve) => setTimeout(resolve, 300));
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
