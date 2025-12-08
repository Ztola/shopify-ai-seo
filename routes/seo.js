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
  markAsOptimized,
  getMetafields
} = require("../services/shopify");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});


// -------------------------------------------------------
// GET /api/shop-data
// -------------------------------------------------------
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
        products: await Promise.all(
          colProducts.map(async (p) => {
            let metafields = [];
            try { metafields = await getMetafields(p.id); } catch {}

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

    res.json({
      success: true,
      total_products: products.length,
      total_collections: collections.length,
      total_blogs: blogs.length,
      data
    });

  } catch (error) {
    res.status(500).json({ error: "Shop data error", details: error.message });
  }
});



// -------------------------------------------------------
// POST /api/optimize-product (SEO COMPLET)
// -------------------------------------------------------
router.post("/optimize-product", async (req, res) => {
  try {
    const { productId } = req.body;

    if (!productId)
      return res.status(400).json({ error: "Missing productId" });

    const product = await getProductById(productId);

    if (!product)
      return res.status(404).json({ error: "Product not found" });

    const prompt = `
Tu es un expert SEO Shopify. Optimise ce produit selon les règles suivantes :

🔹 Ajoute un mot-clé principal (détecté automatiquement).
🔹 Ajoute le mot-clé principal :
  - Dans le titre SEO
  - Dans la meta description
  - Au début du contenu
  - Dans plusieurs sous-titres H2 / H3
🔹 Rédige une description complète ENTRE 600 ET 800 MOTS.
🔹 Ajoute une image avec alt text contenant le mot-clé principal.
🔹 Densité du mot-clé ≈ 1%.
🔹 Génère un slug optimisé < 75 caractères, sans accents.
🔹 AUCUN lien externe (Wikipedia, Doctolib, etc).
🔹 Ajoute UN lien interne optimisé (exemple : /collections/moto).
🔹 Paragraphe d'intro avec mot-clé principal.
🔹 Paragraphes courts pour lisibilité.
🔹 N’AJOUTE PAS de texte comme “Description optimisée automatiquement”.
🔹 Le titre Shopify doit rester propre, SANS emojis et sans “version optimisée”.

Voici les données du produit :
TITLE : ${product.title}
DESCRIPTION : ${product.body_html}

Réponds en JSON strict :
{
 "keyword": "",
 "title": "",
 "slug": "",
 "meta_title": "",
 "meta_description": "",
 "description_html": ""
}
    `;

    const ai = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4
    });

    let output = ai.choices[0].message.content.trim();
    output = JSON.parse(output);

    // Mise à jour Shopify
    await updateProduct(productId, {
      title: output.title,
      body_html: output.description_html,
      handle: output.slug,
      metafields: [
        {
          key: "meta_title",
          namespace: "seo",
          value: output.meta_title,
          type: "single_line_text_field"
        },
        {
          key: "meta_description",
          namespace: "seo",
          value: output.meta_description,
          type: "multi_line_text_field"
        }
      ]
    });

    // Marquer comme optimisé
    await markAsOptimized(productId);

    res.json({
      success: true,
      ...output,
      message: "Produit optimisé avec succès"
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
