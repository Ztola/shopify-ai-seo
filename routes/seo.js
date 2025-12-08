const express = require("express");
const router = express.Router();

// Import des fonctions Shopify
const {
  getAllProducts,
  getAllCollections,
  getAllBlogs,
  getProductsByCollection,
  getArticlesByBlog,
  getProductById,
  updateProduct,
  markAsOptimized
} = require("../services/shopify");


// -------------------------------------------------------
// GET /api/shop-data
// -------------------------------------------------------
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

    // STRUCTURE COLLECTIONS
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

    // STRUCTURE BLOGS
    for (const blog of blogs) {
      const articles = await getArticlesByBlog(blog.id);

      data.blogs[blog.handle] = {
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
      total_products: products.length,
      total_collections: collections.length,
      total_blogs: blogs.length,
      data
    });

  } catch (error) {
    console.error("❌ Error shop-data:", error);
    res.status(500).json({
      error: "Shop data error",
      details: error.message
    });
  }
});



// -------------------------------------------------------
// POST /api/optimize-product
// -------------------------------------------------------
router.post("/optimize-product", async (req, res) => {
  try {
    const { productId } = req.body;

    if (!productId) {
      return res.status(400).json({ error: "Missing productId" });
    }

    // 1️⃣ Récupération du produit Shopify
    const product = await getProductById(productId);

    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    // 2️⃣ Optimisation simple (tu pourras remplacer par OpenAI)
    const optimizedTitle = `✨ Optimized: ${product.title}`;
    const optimizedDescription = `<p>${product.body_html} (version optimisée)</p>`;

    // 3️⃣ Mise à jour Shopify
    await updateProduct(productId, {
      title: optimizedTitle,
      body_html: optimizedDescription,
      handle: product.handle
    });

    // 4️⃣ Marquer comme optimisé
    await markAsOptimized(productId);

    // 5️⃣ Réponse
    res.json({
      success: true,
      original_title: product.title,
      optimized_title: optimizedTitle,
      message: "Produit mis à jour sur Shopify ✔"
    });

  } catch (error) {
    console.error("❌ Error optimize-product:", error);
    res.status(500).json({
      error: "Optimize error",
      details: error.message
    });
  }
});



module.exports = router;
