const express = require("express");
const router = express.Router();
const axios = require("axios");

// Import services Shopify
const { 
  getProductById,
  getProductCollection,
  updateProduct,
  updateMetaDescription,
  updateImagesAlt,
  markAsOptimized,
  isAlreadyOptimized,
  getAllProducts
} = require("../services/shopify");

// Import IA
const { optimizeProduct } = require("../services/ai");


// -------------------------------------------------------------
// 1️⃣ Route : Optimiser UN SEUL produit
// -------------------------------------------------------------
router.post("/optimize", async (req, res) => {
  try {
    const { productId, force } = req.body;

    if (!productId) {
      return res.status(400).json({ error: "Missing productId" });
    }

    // Déjà optimisé ?
    const already = await isAlreadyOptimized(productId);
    if (already && !force) {
      return res.json({
        success: false,
        skipped: true,
        message: "Déjà optimisé. Envoyer { force: true } pour forcer."
      });
    }

    // Récupération du produit et collection
    const product = await getProductById(productId);
    const collection = await getProductCollection(productId);

    // Charger shopData complet
    const shopDataRes = await axios.get(
      `${process.env.RENDER_APP_URL}/api/shop-data`
    );
    const shopData = shopDataRes.data;

    // IA → optimisation SEO
    const optimized = await optimizeProduct(product, collection, shopData);

    // Mises à jour Shopify
    await updateProduct(productId, optimized);
    await updateMetaDescription(productId, optimized.meta_description);
    await updateImagesAlt(product, optimized.keyword);
    await markAsOptimized(productId);

    res.json({
      success: true,
      optimized,
      forced: force === true
    });

  } catch (e) {
    console.error("❌ API Error:", e);
    res.status(500).json({ error: "Internal Server Error", details: e.message });
  }
});


// -------------------------------------------------------------
// 2️⃣ Route : Batch optimisation (illimitée, par groupes de 250)
// -------------------------------------------------------------
router.post("/batch-optimize", async (req, res) => {
  try {
    const { productIds, force } = req.body;

    if (!Array.isArray(productIds)) {
      return res.status(400).json({
        error: "productIds must be an array"
      });
    }

    // Charger shopData complet 1 seule fois
    const shopDataRes = await axios.get(
      `${process.env.RENDER_APP_URL}/api/shop-data`
    );
    const shopData = shopDataRes.data;

    // Diviser en batchs de 250
    const batches = [];
    for (let i = 0; i < productIds.length; i += 250) {
      batches.push(productIds.slice(i, i + 250));
    }

    const results = [];

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(`🚀 Batch ${i + 1}/${batches.length}`);

      for (const productId of batch) {
        try {
          const already = await isAlreadyOptimized(productId);

          if (already && !force) {
            results.push({ productId, status: "skipped" });
            continue;
          }

          const product = await getProductById(productId);
          const collection = await getProductCollection(productId);

          const optimized = await optimizeProduct(product, collection, shopData);

          await updateProduct(productId, optimized);
          await updateMetaDescription(productId, optimized.meta_description);
          await updateImagesAlt(product, optimized.keyword);
          await markAsOptimized(productId);

          results.push({ productId, status: "optimized" });

        } catch (err) {
          results.push({
            productId,
            status: "error",
            error: err.message
          });
        }
      }

      await new Promise((res) => setTimeout(res, 700));
    }

    res.json({
      success: true,
      totalProducts: productIds.length,
      batches: batches.length,
      results
    });

  } catch (e) {
    console.error("❌ Batch Error:", e);
    res.status(500).json({ error: "Batch failed", details: e.message });
  }
});


// -------------------------------------------------------------
// 3️⃣ Route : Récupération shop-data (produits, collections, blogs)
// -------------------------------------------------------------
router.get("/shop-data", async (req, res) => {
  try {
    const products = await getAllProducts();
    const collections = await getAllCollections();
    const blogs = await getAllBlogs();

    const collectionMap = {};
    const blogMap = {};

    // Collections + produits
    for (const col of collections) {
      const colProducts = await getProductsByCollection(col.id);

      collectionMap[col.handle] = {
        id: col.id,
        title: col.title,
        handle: col.handle,
        products: colProducts.map(p => ({
          id: p.id,
          title: p.title,
          handle: p.handle
        }))
      };
    }

    // Blogs + articles
    for (const blog of blogs) {
      const articles = await getArticlesByBlog(blog.id);

      blogMap[blog.handle] = {
        id: blog.id,
        title: blog.title,
        handle: blog.handle,
        articles: articles.map(a => ({
          id: a.id,
          title: a.title,
          handle: a.handle
        }))
      };
    }

    res.json({
      success: true,
      totalProducts: products.length,
      totalCollections: collections.length,
      totalBlogs: blogs.length,
      collections: collectionMap,
      blogs: blogMap,
      products: products.map(p => ({
        id: p.id,
        title: p.title,
        handle: p.handle
      }))
    });

  } catch (e) {
    console.error("❌ Shop Data Error:", e);
    res.status(500).json({ error: "Shop data error", details: e.message });
  }
});


module.exports = router;
