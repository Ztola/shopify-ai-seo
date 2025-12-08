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
// POST /api/optimize-product (SEO COMPLET FINAL)
// -------------------------------------------------------
router.post("/optimize-product", async (req, res) => {
  try {
    const { productId } = req.body;

    if (!productId)
      return res.status(400).json({ error: "Missing productId" });

    const product = await getProductById(productId);

    if (!product)
      return res.status(404).json({ error: "Product not found" });

    // ---------------------------
    // PROMPT SEO ULTRA COMPLET
    // ---------------------------
    const prompt = `
Tu es un expert SEO Shopify spécialisé pour le e-commerce. Tu dois créer une optimisation complète du produit, selon les règles ci-dessous. Tu dois renvoyer UNIQUEMENT du JSON valide, sans markdown, sans \`\`\`, et sans texte autour.

Règles SEO obligatoires :

1. Ajouter le mot-clé principal au début du titre SEO.
2. Ajouter le mot-clé principal dans la méta description.
3. Utiliser le mot-clé principal dans l’URL (slug).
4. Utiliser le mot-clé principal au début du contenu.
5. Utiliser le mot-clé principal dans tout le contenu.
6. Utiliser 600 à 800 mots minimum dans la description HTML.
7. Utiliser le mot-clé principal dans un H2 principal et dans plusieurs H3.
8. Ajouter une image avec alt contenant le mot-clé principal.
9. Viser environ 1 % de densité du mot-clé dans la description.
10. Le slug ne doit pas dépasser 75 caractères et doit être sans accents.
11. PAS de liens sortants.
12. Ajouter 1 lien interne vers une ressource du site.
13. Définir un mot-clé principal.
14. Le titre doit contenir un power word (ex : puissant, ultime, premium…).
15. Paragraphes courts et lisibles.
16. Aucun emoji, aucun markdown.
17. Ne jamais écrire : “version optimisée”, “description optimisée automatiquement”, ou similaire.
18. Description orientée conversion.

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

    // ---------------------------
    // APPEL IA
    // ---------------------------
    const ai = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4
    });

    // Réponse brute IA
    let output = ai.choices[0].message.content.trim();

    // Nettoyage anti-erreur JSON
    output = output.replace(/```json/gi, "");
    output = output.replace(/```/g, "");
    output = output.replace(/^\s+|\s+$/g, "");

    let json;

    try {
      json = JSON.parse(output);
    } catch (err) {
      console.error("❌ JSON reçu non valide :", output);
      return res.status(500).json({
        error: "Invalid JSON from AI",
        details: err.message,
        raw: output
      });
    }

    // ---------------------------
    // MISE À JOUR SHOPIFY
    // ---------------------------
    await updateProduct(productId, {
      id: productId,
      title: json.title,
      body_html: json.description_html,
      handle: json.slug
    });

    await markAsOptimized(productId);

    // ---------------------------
    // RÉPONSE
    // ---------------------------
    res.json({
      success: true,
      productId,
      ...json,
      message: "Produit optimisé avec succès ✔"
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
