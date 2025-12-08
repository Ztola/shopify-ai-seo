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
// PROMPT EN BLOCS (ANTI-CRASH RENDER)
// -------------------------------------------------------

const seoPart1 = `
Tu es un expert SEO Shopify spécialisé pour le e-commerce.
Tu dois optimiser complètement ce produit pour le SEO.
Tu dois renvoyer UNIQUEMENT du JSON strict, sans markdown, sans texte autour.

Règles SEO :
1. Ajouter le mot-clé principal au début du titre SEO.
2. Ajouter le mot-clé principal dans la méta description.
3. Utiliser le mot-clé principal dans l’URL (slug), sans accents, sans majuscules, max 75 caractères.
4. Utiliser le mot-clé principal au début du contenu.
5. Utiliser le mot-clé principal dans tout le contenu.
6. Produire 600 à 800 mots minimum dans la description HTML.
7. Inclure un H2 contenant le mot-clé principal.
`;

const seoPart2 = `
8. Inclure plusieurs H3 contenant le mot-clé principal.
9. Ajouter 1 lien sortant pertinent (Wikipedia, Ameli, Doctolib).
10. Viser environ 1% de densité du mot-clé.
11. Ajouter 1 ou 2 liens internes HTML vers une ressource PRODUIT.
12. Ajouter 1 ou 2 liens internes vers une COLLECTION.
13. Définir un mot-clé principal pertinent.
14. Le titre doit contenir un power word.
15. Ton naturel, humain, orienté conversion.
16. Aucun emoji, aucun markdown.
17. Ne jamais écrire “version optimisée”, “optimisation automatique”.
18. Rédaction experte et réelle, pas robotique.
`;

const seoOutputFormat = `
Tu dois renvoyer exactement ce JSON strict :

{
 "keyword": "",
 "title": "",
 "slug": "",
 "meta_title": "",
 "meta_description": "",
 "description_html": ""
}
`;


// -------------------------------------------------------
// Bâtit un prompt sécurisé à partir de blocs
// -------------------------------------------------------
function buildSeoPrompt(product) {

  const safeTitle = (product.title || "").replace(/"/g, '\\"');
  const safeDescription = (product.body_html || "").replace(/"/g, '\\"');

  return (
    seoPart1 +
    seoPart2 +
    seoOutputFormat +
    `
Données du produit :

TITRE: "${safeTitle}"
DESCRIPTION: "${safeDescription}"
    `
  );
}



// -------------------------------------------------------
// POST /api/optimize-product
// -------------------------------------------------------
router.post("/optimize-product", async (req, res) => {
  try {

    const { productId } = req.body;

    if (!productId)
      return res.status(400).json({ error: "Missing productId" });

    const product = await getProductById(productId);

    if (!product)
      return res.status(404).json({ error: "Product not found" });


    // Construire prompt sans crash Render
    const prompt = buildSeoPrompt(product);


    // ---------------------------
    // APPEL OPENAI
    // ---------------------------
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.35
    });

    let output = completion.choices[0].message.content.trim();

    output = output.replace(/```json/gi, "");
    output = output.replace(/```/gi, "");

    let json;

    try {
      json = JSON.parse(output);
    } catch (err) {
      console.error("❌ JSON reçu invalide :", output);
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
    // RÉPONSE PARFAITE
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
