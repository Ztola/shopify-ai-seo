const express = require("express");
const router = express.Router();
const { OpenAI } = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// IMPORT Shopify helpers
const {
  getAllProducts,
  getAllCollections,
  getProductById,
  updateProduct,
  markAsOptimized
} = require("../services/shopify");

/* ============================================================
   ROUTE 1 : GET /api/shop-data  
   ============================================================ */
router.get("/shop-data", async (req, res) => {
  try {
    const products = await getAllProducts();
    const collections = await getAllCollections();

    const data = {
      collections: {}
    };

    for (const col of collections) {
      data.collections[col.handle] = {
        id: col.id,
        title: col.title,
        handle: col.handle,
        products: col.products.map(p => ({
          id: p.id,
          title: p.title,
          handle: p.handle,
          optimized: p.tags?.includes("optimized") || false
        }))
      };
    }

    res.json({
      success: true,
      total_products: products.length,
      total_collections: collections.length,
      data
    });

  } catch (error) {
    console.error("❌ Error shop-data:", error);
    res.status(500).json({ error: "Shop data error", details: error.message });
  }
});

/* ============================================================
   ROUTE 2 : POST /api/optimize-product  
   ============================================================ */
router.post("/optimize-product", async (req, res) => {
  try {
    const { productId } = req.body;

    if (!productId)
      return res.status(400).json({ error: "Missing productId" });

    const product = await getProductById(productId);

    if (!product)
      return res.status(404).json({ error: "Product not found" });

    /* ------------------------------------------------------------
       PROMPT SEO ULTRA COMPLET (VERSION STABLE POUR RENDER)
       ------------------------------------------------------------ */
    const prompt = `
Tu es un expert SEO Shopify spécialisé pour le e-commerce. Tu dois optimiser ce produit selon les règles suivantes. 
Tu dois renvoyer UNIQUEMENT du JSON valide, sans markdown, sans \`\`\`, sans texte autour.

Règles SEO obligatoires :
1. Ajouter le mot-clé principal au début du titre SEO.
2. Ajouter le mot-clé principal dans la méta description.
3. Utiliser le mot-clé principal dans l’URL (slug), sans accents, sans majuscules, max 75 caractères.
4. Utiliser le mot-clé principal au début du contenu.
5. Utiliser le mot-clé principal dans tout le contenu.
6. Produire une description HTML riche de 600 à 800 mots, structurée, naturelle et humaine.
7. Inclure un H2 contenant le mot-clé principal.
8. Inclure plusieurs H3 contenant le mot-clé principal.
9. Ajouter un lien sortant pertinent (Wikipedia ou autre source éducative).
10. Viser 1% de densité du mot-clé.
11. Ajouter 1 ou 2 liens internes HTML vers des produits.
12. Ajouter 1 ou 2 liens internes HTML vers des collections.
13. Définir un mot-clé principal pertinent basé sur le produit.
14. Le titre doit contenir un power word.
15. Ton humain, lisible, orienté conversion.
16. Aucun emoji, aucun markdown.
17. Ne jamais écrire “version optimisée”, “optimisation automatique”, ou similaire.

Format attendu STRICT :

{
 "keyword": "",
 "title": "",
 "slug": "",
 "meta_title": "",
 "meta_description": "",
 "description_html": ""
}

Voici les données du produit :

TITRE: ${product.title}
DESCRIPTION: ${product.body_html || ""}
    `;

    // ✨ Appel OpenAI
    const ai = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2
    });

    let output = ai.choices[0].message.content.trim();

    // Nettoyage anti-markdown
    output = output.replace(/```json/gi, "")
                   .replace(/```/g, "")
                   .trim();

    // Convertir JSON
    let json;
    try {
      json = JSON.parse(output);
    } catch (err) {
      console.error("❌ JSON NON VALIDE:", output);
      return res.status(500).json({
        error: "Invalid JSON from AI",
        raw: output
      });
    }

    // MISE À JOUR SHOPIFY
    await updateProduct(productId, {
      id: productId,
      title: json.title,
      body_html: json.description_html,
      handle: json.slug
    });

    await markAsOptimized(productId);

    res.json({
      success: true,
      productId,
      ...json
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
