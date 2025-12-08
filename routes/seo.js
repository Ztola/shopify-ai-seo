const express = require("express");
const router = express.Router();

const {
  getAllProducts,
  getAllCollections,
  getAllBlogs,
  getProductsByCollection,
  getArticlesByBlog,
  getProductById,
  updateProduct,
  markAsOptimized,
  getMetafields
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
        products: await Promise.all(
          colProducts.map(async (p) => {

            // Vérifier si déjà optimisé
            let metafields = [];
            try {
              metafields = await getMetafields(p.id);
            } catch (err) {
              metafields = [];
            }

            const optimized = metafields.some(
              m => m.namespace === "ai_seo" && m.key === "optimized" && m.value === "true"
            );

            return {
              id: p.id,
              title: p.title,
              handle: p.handle,
              optimized
            };
          })
        )
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

    const product = await getProductById(productId);

    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    // TITRE POUR SHOPIFY -> On NE met PAS le ✨
    const optimizedTitle = product.title;

    // DESCRIPTION optimisée simple (à améliorer plus tard)
    const optimizedDescription = `
      <h2>${product.title}</h2>
      ${product.body_html}
      <p><strong>Description optimisée automatiquement.</strong></p>
    `;

    // Mise à jour Shopify
    await updateProduct(productId, {
      title: optimizedTitle,
      body_html: optimizedDescription,
      handle: product.handle
    });

    // Marquer le produit comme optimisé
    await markAsOptimized(productId);

    res.json({
      success: true,
      original_title: product.title,
      preview_title: "✨ Optimisé (prévisualisation WordPress)",
      optimized_description: optimizedDescription,
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
