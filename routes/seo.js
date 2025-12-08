const express = require("express");
const router = express.Router();
const OpenAI = require("openai");

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

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// ------------------------------
// GET /api/shop-data
// ------------------------------
router.get("/shop-data", async (req, res) => {
  try {
    const products = await getAllProducts();
    const collections = await getAllCollections();
    const blogs = await getAllBlogs();

    let data = { collections: {}, blogs: {} };

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
// POST /api/optimize-product (SEO COMPLET)
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

    const prompt = `
Tu es expert SEO Shopify.  
NE RENVOIE QUE DU JSON PUR.  
PAS de markdown, PAS de \`\`\`, PAS de texte autour.

Structure demandée :
{
 "keyword": "",
 "title": "",
 "slug": "",
 "meta_title": "",
 "meta_description": "",
 "description_html": ""
}

Règles :
- Titre propre, sans emojis.
- Description 600–800 mots.
- Mot-clé dans titre, méta, H1, H2, contenu.
- Slug < 75 caractères, sans accents.
- 1 lien interne maximum.
- AUCUN lien externe.
- Paragraphe court.
- Aucun texte du style "version optimisée".

Données produit :
TITLE: ${product.title}
DESCRIPTION: ${product.body_html}
    `;

    const ai = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4
    });

    let output = ai.choices[0].message.content.trim();

    // 🔥 Sécurité JSON
    output = output.replace(/```json/gi, "");
    output = output.replace(/```/g, "");
    output = output.trim();

    let json = JSON.parse(output);

    // 🔄 Update Shopify
    await updateProduct(productId, {
      title: json.title,
      body_html: json.description_html,
      handle: json.slug
    });

    await markAsOptimized(productId);

    return res.json({
      success: true,
      message: "Produit optimisé",
      ...json
    });

  } catch (error) {
    console.error("❌ Optimize error:", error);
    res.status(500).json({
      error: "Optimize error",
      details: error.message
    });
  }
});

module.exports = router;
