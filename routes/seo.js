const express = require("express");
const router = express.Router();
const { OpenAI } = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const {
  getProductById,
  updateProduct,
  markAsOptimized
} = require("../services/shopify");

// -------------------------------------------------------
// GET FULL SHOP DATA (pour WordPress)
// -------------------------------------------------------
router.get("/shop-data", async (req, res) => {
  try {
    const products = await getAllProducts();
    const collections = await getAllCollections();

    let data = { collections: {} };

    for (const col of collections) {
      const colProducts = await getProductsByCollection(col.id);
      data.collections[col.handle] = {
        id: col.id,
        title: col.title,
        handle: col.handle,
        products: colProducts.map(p => ({
          id: p.id,
          title: p.title,
          handle: p.handle,
          optimized: p.metafields?.optimized ?? false
        }))
      };
    }

    res.json({
      success: true,
      total_products: products.length,
      total_collections: collections.length,
      data
    });

  } catch (err) {
    console.error("❌ shop-data error:", err);
    res.status(500).json({ error: "Shop data error", details: err.message });
  }
});

// -------------------------------------------------------
// POST /api/optimize-product (SEO ULTRA COMPLET)
// -------------------------------------------------------
router.post("/optimize-product", async (req, res) => {
  try {
    const { productId } = req.body;

    if (!productId)
      return res.status(400).json({ error: "Missing productId" });

    const product = await getProductById(productId);

    if (!product)
      return res.status(404).json({ error: "Product not found" });

    // ---------------------------------------------------
    // PROMPT SEO OFFICIEL (Ton Prompt complet et optimisé)
    // ---------------------------------------------------

    const prompt = `
Tu es un expert SEO Shopify spécialisé pour le e-commerce. Tu dois produire une optimisation complète, naturelle et humaine du produit selon les règles strictes ci-dessous. Tu dois renvoyer UNIQUEMENT du JSON valide, sans markdown, sans \`\`\`, et sans texte autour.

Règles SEO obligatoires :

1. Ajouter le mot-clé principal au début du titre SEO.
2. Ajouter le mot-clé principal dans la méta description.
3. Utiliser le mot-clé principal dans l’URL (slug), sans accents, sans majuscules, max 75 caractères.
4. Utiliser le mot-clé principal au début du contenu.
5. Utiliser le mot-clé principal dans tout le contenu.
6. Produire une description HTML riche de 600 à 800 mots, structurée, naturelle et humaine.
7. Inclure un H2 principal contenant le mot-clé principal.
8. Inclure plusieurs H3 contenant le mot-clé principal.
9. Ajouter 1 lien sortant pertinent (Wikipedia, Ameli, Doctolib…) selon le mot-clé.
10. Viser environ 1% de densité du mot-clé, sans bourrage.
11. Ajouter 1 ou 2 liens internes HTML vers une ressource du site (produits).
12. Ajouter 1 ou 2 liens internes vers une ressource du site (collections).
13. Définir un mot-clé principal pertinent basé sur le produit.
14. Le titre doit contenir un power word.
15. Paragraphes lisibles, ton humain, orienté conversion.
16. Aucun emoji, aucun markdown.
17. Aucune mention du type “version optimisée”, “optimisation automatique”, etc.

Tu dois renvoyer un JSON strict :

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
DESCRIPTION: ${product.body_html}
`;

    // -------------------------------
    // 🔥 APPEL IA GPT
    // -------------------------------
    const ai = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4
    });

    let output = ai.choices[0].message.content.trim();

    // Nettoyage du JSON (sécurité)
    output = output.replace(/```json/gi, "");
    output = output.replace(/```/g, "");
    output = output.replace(/^\s+|\s+$/g, "");

    let json;

    try {
      json = JSON.parse(output);
    } catch (err) {
      console.error("❌ JSON INVALID:", output);
      return res.status(500).json({
        error: "Invalid JSON from AI",
        details: err.message,
        raw: output
      });
    }

    // -------------------------------
    // 🔥 MISE À JOUR SHOPIFY
    // -------------------------------
    await updateProduct(productId, {
      id: productId,
      title: json.title,
      body_html: json.description_html,
      handle: json.slug
    });

    // Metafield "optimized" → vrai
    await markAsOptimized(productId);

    // -------------------------------
    // 🔥 RÉPONSE FINALE
    // -------------------------------
    res.json({
      success: true,
      productId,
      ...json,
      message: "Optimisation SEO appliquée avec succès."
    });

  } catch (error) {
    console.error("❌ optimize-product error:", error);
    res.status(500).json({
      error: "Optimize error",
      details: error.message
    });
  }
});

module.exports = router;
