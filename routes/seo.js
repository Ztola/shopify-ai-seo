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
// POST /api/optimize-product — SEO FINAL COMPLET
// -------------------------------------------------------
router.post("/optimize-product", async (req, res) => {
  try {
    const { productId } = req.body;

    if (!productId)
      return res.status(400).json({ error: "Missing productId" });

    const product = await getProductById(productId);

    if (!product)
      return res.status(404).json({ error: "Product not found" });

    // PROMPT SEO ULTRA COMPLET
    const prompt = `
Tu es un expert SEO Shopify spécialisé pour le e-commerce. Ta mission est d’optimiser complètement un produit selon les règles suivantes. Tu dois écrire un contenu naturel, fluide, non robotique, orienté conversion et crédibilité e-commerce. Tu dois renvoyer UNIQUEMENT un JSON valide, sans markdown, sans tabulation, sans \`\`\` et sans texte autour.

Règles SEO obligatoires :

1. Ajouter le mot-clé principal au début du titre SEO.
2. Ajouter le mot-clé principal dans la méta description.
3. Utiliser le mot-clé principal dans l’URL (slug), sans accents, sans majuscules, max 75 caractères.
4. Utiliser le mot-clé principal au début du contenu.
5. Utiliser le mot-clé principal dans tout le contenu.
6. Produire une description HTML riche de 600 à 800 mots, structurée, naturelle, humaine.
7. Inclure un H2 principal contenant le mot-clé principal.
8. Inclure plusieurs H3 contenant le mot-clé principal.
9. Liens sortant, Connectez à des ressources externes (exemple wikipedia etc, amelie, doctolib, etc..) tout dépend du mot clé.
10. Viser environ 1 % de densité du mot-clé, sans bourrage.
11. un lien sortant vers une source .
12. Ajouter 1 ou 2 liens interne HTML vers une ressource du site (produits).
13. Définir un mot-clé principal pertinent basé sur le produit.
14. Le titre doit contenir un power word.
15. un bon Paragraphes lisibles, ton humain.
16. Aucun emoji, aucun markdown.
17. Aucune mention du type “version optimisée”, “optimisation automatique”, etc.
18. Texte orienté conversion.
19. Ajouter 1 ou 2 liens interne HTML vers une ressource du site (Collections).

Format de sortie OBLIGATOIRE (JSON strict) :

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

    // ------------ APPEL IA ------------
    const ai = await openai.chat.completions.create({
      model: "gpt-4.1",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4
    });

    let output = ai.choices[0].message.content.trim();

    // Nettoyage sécurité
    output = output.replace(/```json/gi, "");
    output = output.replace(/```/g, "");
    output = output.replace(/^\s+|\s+$/g, "");

    let json;
    try {
      json = JSON.parse(output);
    } catch (err) {
      return res.status(500).json({
        error: "Invalid JSON from AI",
        details: err.message,
        raw: output
      });
    }

    // Mise à jour Shopify
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
      ...json,
      message: "Produit optimisé avec succès"
    });

  } catch (error) {
    res.status(500).json({
      error: "Optimize error",
      details: error.message
    });
  }
});

module.exports = router;
