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
// FONCTION QUI CONSTRUIT LE PROMPT SEO SANS PLANTER
// -------------------------------------------------------
function buildSeoPrompt(product) {

  return `
Tu es un expert SEO Shopify spécialisé pour le e-commerce.
Tu dois optimiser complètement ce produit selon les règles suivantes.
Tu dois renvoyer UNIQUEMENT du JSON strict, sans markdown, sans code, sans texte autour.

Règles SEO obligatoires :

1. Ajouter le mot-clé principal au début du titre SEO.
2. Ajouter le mot-clé principal dans la méta description.
3. Utiliser le mot-clé principal dans l’URL (slug), sans accents, sans majuscules, max 75 caractères.
4. Utiliser le mot-clé principal au début du contenu.
5. Utiliser le mot-clé principal dans tout le contenu.
6. Produire une description HTML riche de 600 à 800 mots, structurée, naturelle et humaine.
7. Inclure un H2 principal contenant le mot-clé principal.
8. Inclure plusieurs H3 contenant le mot-clé principal.
9. Ajouter 1 lien sortant pertinent (Wikipedia, Ameli, Doctolib…) en fonction du produit.
10. Viser environ 1% de densité du mot-clé sans bourrage.
11. Ajouter 1 ou 2 liens internes HTML vers une ressource produit du site.
12. Ajouter 1 ou 2 liens internes vers une collection du site.
13. Définir un mot-clé principal pertinent basé sur le produit.
14. Le titre doit contenir un power word (ex : puissant, ultime, premium…).
15. Paragraphes lisibles, ton humain, orienté conversion.
16. Aucun emoji, aucun markdown.
17. Ne jamais écrire "version optimisée", "optimisation automatique", ou similaire.
18. Tout doit être rédigé comme un expert SEO humain.

Tu dois renvoyer au final EXACTEMENT ce JSON strict :

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
  `.replace(/"/g, '\\"'); // Sécurité : échappe tous les guillemets
}



// -------------------------------------------------------
// POST /api/optimize-product (OPTIMISATION SEO COMPLÈTE)
// -------------------------------------------------------
router.post("/optimize-product", async (req, res) => {
  try {

    const { productId } = req.body;

    if (!productId)
      return res.status(400).json({ error: "Missing productId" });

    const product = await getProductById(productId);

    if (!product)
      return res.status(404).json({ error: "Product not found" });


    // Construction du prompt sans risque
    const prompt = buildSeoPrompt(product);


    // ---------------------------
    // APPEL OPENAI
    // ---------------------------
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4
    });

    let output = completion.choices[0].message.content.trim();

    // Retire tout ce qui pourrait casser le JSON
    output = output.replace(/```json/gi, "");
    output = output.replace(/```/gi, "");
    output = output.trim();

    let json;

    try {
      json = JSON.parse(output);
    } catch (err) {
      console.error("❌ JSON NON VALIDE REÇU :", output);
      return res.status(500).json({
        error: "Invalid JSON from AI",
        details: err.message,
        raw: output
      });
    }


    // ---------------------------
    // MISE À JOUR SHOPIFY
    ----------------------------
    await updateProduct(productId, {
      id: productId,
      title: json.title,
      body_html: json.description_html,
      handle: json.slug
    });

    await markAsOptimized(productId);


    // ---------------------------
    // RÉPONSE FINALE
    // ---------------------------
    res.json({
      success: true,
      productId,
      ...json,
      message: "Produit optimisé avec succès ✔"
    });

  } catch (error) {
    console.error("❌ ERROR optimize-product:", error);
    res.status(500).json({
      error: "Optimize error",
      details: error.message
    });
  }
});

module.exports = router;
