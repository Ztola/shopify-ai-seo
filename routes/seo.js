const express = require("express");
const router = express.Router();

const { getShopCache, refreshShopCache } = require("../services/cache");
const {
  getAllProducts,
  getAllCollections,
  getAllBlogs,
  getProductsByCollection,
  getArticlesByBlog,
  getProductById
} = require("../services/shopify");


// ----------------------------------------
// 📌 ROUTE : GET /api/shop-data
// ----------------------------------------
router.get("/shop-data", async (req, res) => {
  try {
    console.log("📦 Chargement complet de la boutique…");

    const products = await getAllProducts();
    const collections = await getAllCollections();
    const blogs = await getAllBlogs();

    let data = {
      collections: {},
      blogs: {}
    };

    // ----- COLLECTIONS -----
    for (const col of collections) {
      const colProducts = await getProductsByCollection(col.id);

      data.collections[col.handle] = {
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

    // ----- BLOGS -----
    for (const blog of blogs) {
      const articles = await getArticlesByBlog(blog.id);

      data.blogs[blog.handle] = {
        id: blog.id,
        title: blog.title,
        handle: blog.handle,
        articles: articles.map(a => ({
          id: a.id,
          title: a.title,
          handle: a.handle,
          blog_handle: blog.handle
        }))
      };
    }

    res.json({
      success: true,
      shop: process.env.SHOPIFY_SHOP_URL,
      total_products: products.length,
      total_collections: collections.length,
      total_blogs: blogs.length,
      data
    });

  } catch (error) {
    console.error("❌ Error /shop-data:", error);
    res.status(500).json({
      error: "Failed to load shop data",
      details: error.message
    });
  }
});


// ---------------------------------------------------
// 📌 ROUTE : POST /api/optimize-product
// Optimise un produit via son ID Shopify
// ---------------------------------------------------
router.post("/optimize-product", async (req, res) => {
  try {
    const { productId } = req.body;

    if (!productId) {
      return res.status(400).json({ error: "Missing 'productId' in body" });
    }

    console.log("🔎 Fetching product:", productId);

    // --- Récupération du produit Shopify ---
    const product = await getProductById(productId);

    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    // Texte brut à optimiser
    const rawText = `
      TITLE: ${product.title}
      DESCRIPTION: ${product.body_html}
    `;

    // --- Optimisation basique (remplacer par IA plus tard) ---
    const optimized = `✨ Optimized version: ${product.title}`;

    res.json({
      success: true,
      productId,
      original: {
        title: product.title,
        description: product.body_html
      },
      optimized
    });

  } catch (error) {
    console.error("❌ Error /optimize-product:", error);
    res.status(500).json({
      error: "Product optimization failed",
      details: error.message
    });
  }
});

module.exports = router;
