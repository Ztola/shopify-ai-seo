const express = require("express");
const router = express.Router();
const { OpenAI } = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const {
  getProductById,
  updateProduct,
  markAsOptimized,
  getAllProducts,
  getAllCollections
} = require("../services/shopify");

// -------------------------------------------------------
// ROUTE PRINCIPALE : OPTIMISATION PRODUIT SEO COMPLET
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

    // 🔥 Récupération produits & collections → pour maillage interne intelligent
    const allProducts = await getAllProducts();
    const allCollections = await getAllCollections();

    const internalProductsList = allProducts
      .filter(p => p.id !== productId)
      .slice(0, 3)
      .map(p => `https://${process.env.SHOPIFY_DOMAIN}/products/${p.handle}`)
      .join("\n");

    const internalCollectionsList = allCollections
      .slice(0, 3)
      .map(c => `https://${process.env.SHOPIFY_DOMAIN}/collections/${c.handle}`)
      .join("\n");

    // -------------------------------------------------------
    // PROMPT SEO – VERSION EXACTE AVEC TOUTES TES RÈGLES
    // -------------------------------------------------------
    const prompt = `
Tu es un expert SEO Shopify spécialisé en e-commerce. Tu dois optimiser complètement la fiche produit selon les règles suivantes. 
Tu dois renvoyer UNIQUEMENT DU JSON STRICT, sans markdown, sans emojis, sans texte autour.

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
11. Ajouter 1 ou 2 liens internes HTML vers des PRODUITS du site.
12. Ajouter 1 ou 2 liens internes HTML vers des COLLECTIONS du site.
13. Définir un mot-clé principal pertinent basé sur le produit.
14. Le titre doit contenir un power word.
15. Paragraphes lisibles, ton humain, orienté conversion.
16. Aucun emoji, aucun markdown.
17. Aucune mention du type “version optimisée”, “optimisation automatique”, etc.

Liens internes produits à utiliser :
${internalProductsList}

Liens internes collections à utiliser :
${internalCollectionsList}

Structure JSON attendue :

{
 "keyword": "",
 "title": "",
 "slug": "",
 "meta_title": "",
 "meta_description": "",
 "description_html": ""
}

Données du produit :
TITRE : ${product.title}
DESCRIPTION : ${product.body_html}
    `;

    // -------------------------------------------------------
    // APPEL OPENAI
    // -------------------------------------------------------
    const ai = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3
    });

    let output = ai.choices[0].message.content.trim();

    // 🔥 Nettoyage ANTI-ERREURS JSON
    output = output.replace(/```json/gi, "");
    output = output.replace(/```/g, "");
    output = output.replace(/^\s+|\s+$/g, "");

    let json;
    try {
      json = JSON.parse(output);
    } catch (err) {
      console.error("❌ JSON IA INVALID :", output);
      return res.status(500).json({
        error: "Invalid JSON from AI",
        details: err.message,
        raw: output
      });
    }

    // -------------------------------------------------------
    // MISE À JOUR SHOPIFY
    // -------------------------------------------------------
    await updateProduct(productId, {
      id: productId,
      title: json.title,
      body_html: json.description_html,
      handle: json.slug
    });

    await markAsOptimized(productId);

    // -------------------------------------------------------
    // RÉPONSE FINALE
    // -------------------------------------------------------
    res.json({
      success: true,
      productId,
      ...json,
      message: "Produit optimisé avec succès."
    });

  } catch (error) {
    console.error("❌ ERROR optimize-product :", error);
    res.status(500).json({
      error: "Optimize error",
      details: error.message
    });
  }
});

module.exports = router;
