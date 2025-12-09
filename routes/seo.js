const express = require("express");
const router = express.Router();
const { OpenAI } = require("openai");

// Shopify Services
const {
  getAllProducts,
  getAllCollections,
  getProductsByCollection,
  getProductById,
  updateProduct,
  markAsOptimized
} = require("../services/shopify");

// OpenAI Client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/* ---------------------------------------------------------------------
   🔥 ROUTE 1 : GET /shop-data
--------------------------------------------------------------------- */
router.get("/shop-data", async (req, res) => {
  try {
    const collections = await getAllCollections();

    if (!collections || collections.length === 0) {
      return res.status(500).json({ error: "No collections found" });
    }

    const data = { collections: {} };
    const allProducts = await getAllProducts();

    for (const col of collections) {
      const colId = col.id;
      const colHandle = col.handle;
      const colTitle = col.title;

      const products = await getProductsByCollection(colId);

      data.collections[colHandle] = {
        id: colId,
        title: colTitle,
        handle: colHandle,
        products: products.map((p) => ({
          id: p.id,
          title: p.title,
          handle: p.handle,
          optimized: p.tags.includes("optimized") ? true : false
        }))
      };
    }

    res.json({
      success: true,
      total_products: allProducts.length,
      total_collections: collections.length,
      data
    });

  } catch (error) {
    console.error("❌ Error /shop-data", error);
    res.status(500).json({
      error: "Shop data error",
      details: error.message
    });
  }
});

/* ---------------------------------------------------------------------
   🔥 ROUTE 2 : POST /optimize-product
--------------------------------------------------------------------- */
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

    // ----------------------------------------------------------------
    // 🔥 TON PROMPT ORIGINAL ENTIER EST ICI
    // ----------------------------------------------------------------
    const prompt = `
Tu es un expert SEO Shopify. Fournis une optimisation complète STRICTEMENT en JSON valide.

Règles SEO obligatoires :
1. Ajouter le mot-clé principal au début du titre SEO.
2. Ajouter le mot-clé principal dans la méta description.
3. Utiliser le mot-clé principal dans l’URL (slug), sans accents, sans majuscules, max 75 caractères.
4. Utiliser le mot-clé principal au début du contenu.
5. Utiliser le mot-clé principal dans tout le contenu.
6. Produire une description HTML riche de 600 à 800 mots.
7. Inclure un H2 contenant le mot-clé principal.
8. Inclure plusieurs H3 contenant le mot-clé principal.
9. Ajouter 1 lien sortant pertinent (Wikipedia, Ameli, Doctolib, etc...).
10. Viser environ 1% de densité du mot-clé sans bourrage.
11. Ajouter 1 ou 2 liens internes vers un produit.
12. Ajouter 1 ou 2 liens internes vers une collection.
13. Définir un mot-clé principal pertinent.
14. Le titre doit contenir un power word.
15. Paragraphes lisibles, ton humain.
16. AUCUN emoji, AUCUN markdown.
17. Ne jamais écrire “version optimisée” ou similaire.
18. Description orientée conversion.

Renvoie uniquement ce JSON strict :
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
DESCRIPTION ORIGINALE : ${product.body_html}
`;

    // Appel OpenAI
    const ai = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4
    });

    let output = ai.choices[0].message.content.trim();

    // Nettoyage JSON
    output = output.replace(/```json/g, "");
    output = output.replace(/```/g, "").trim();

    let json;
    try {
      json = JSON.parse(output);
    } catch (err) {
      console.error("❌ Invalid JSON from AI", output);
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
      handle: json.slug,
      body_html: json.description_html
    });

    await markAsOptimized(productId);

    res.json({
      success: true,
      message: "Produit optimisé avec succès",
      ...json
    });

  } catch (error) {
    console.error("❌ Error /optimize-product", error);
    res.status(500).json({
      error: "Optimize error",
      details: error.message
    });
  }
});

/* ---------------------------------------------------------------------
   🔥 ROUTE 3 : POST /optimize-collection
   Optimise tous les produits d'une collection
--------------------------------------------------------------------- */
router.post("/optimize-collection", async (req, res) => {
  try {
    const { collectionId } = req.body;

    if (!collectionId) {
      return res.status(400).json({ error: "Missing collectionId" });
    }

    // Récupérer les produits de la collection
    const products = await getProductsByCollection(collectionId);

    if (!products || products.length === 0) {
      return res.status(404).json({ error: "No products found in this collection" });
    }

    const results = [];

    // Boucle sur chaque produit
    for (const product of products) {
      try {
        const optimizeRes = await fetch(
          `${process.env.SERVER_URL}/api/optimize-product`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ productId: product.id })
          }
        );

        const data = await optimizeRes.json();
        results.push({ id: product.id, title: product.title, success: true, data });

      } catch (err) {
        results.push({ id: product.id, title: product.title, success: false, error: err.message });
      }
    }

    res.json({
      success: true,
      optimized: results.length,
      results
    });

  } catch (error) {
    console.error("❌ Error /optimize-collection", error);
    res.status(500).json({
      error: "Optimize collection error",
      details: error.message
    });
  }
});

module.exports = router;
