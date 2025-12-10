// Extraire automatiquement le nom de la boutique Shopify
function getDynamicBrandName() {
    if (!process.env.SHOPIFY_SHOP_URL) return "VotreBoutique";

    // Exemple : aykenwear.myshopify.com → "AYKENWEAR"
    let domain = process.env.SHOPIFY_SHOP_URL.split(".")[0];
    return domain.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

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

/* -------------------------------------------------------------
   🔥 ROUTE 1 : GET /shop-data  
   Récupère toutes les collections + produits + statut optimized
-------------------------------------------------------------- */
router.get("/shop-data", async (req, res) => {
  try {
    const collections = await getAllCollections();
    const allProducts = await getAllProducts();

    if (!collections || collections.length === 0) {
      return res.status(500).json({ error: "No collections found" });
    }

    const data = { collections: {} };

    for (const col of collections) {
      const colProducts = await getProductsByCollection(col.id);

      data.collections[col.handle] = {
        id: col.id,
        title: col.title,
        handle: col.handle,
        products: colProducts.map((p) => ({
          id: p.id,
          title: p.title,
          handle: p.handle,
          optimized: p.tags?.includes("optimized") || false
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

/* -------------------------------------------------------------
   🔥 ROUTE 2 : POST /optimize-product  
   Optimise un produit unique (IA + Shopify update)
-------------------------------------------------------------- */
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

    // 🔥 Prompt IA
    const prompt = `
Tu es un expert SEO Shopify. Tu dois optimiser le produit en te basant
SUR SA DESCRIPTION ACTUELLE, que tu dois absolument reformuler intégralement.

IMPORTANT :
- Toute description doit être réécrite (pas copiée, pas paraphrasée légèrement, mais reformulée entièrement).
- Si la description contient déjà des liens, tu dois les remplacer par :
    • soit du maillage interne (vers un autre produit ou collection),
    • soit du maillage externe pertinent (Wikipedia, Ameli, Doctolib…).
- Si la description contient des noms de marques existantes, tu dois les remplacer par le nom du site Shopify actuel : ${process.env.SHOPIFY_BRAND_NAME}.

Règles SEO obligatoires :
1. Ajouter le mot-clé principal au début du titre SEO.
2. Ajouter ce mot-clé dans la méta description.
3. Utiliser ce mot-clé dans l’URL (slug), sans accents, sans majuscules, max 75 caractères.
4. Utiliser ce mot-clé au début du contenu.
5. Utiliser ce mot-clé dans tout le contenu.
6. Rédiger une description HTML riche de 600 à 800 mots (pas plus).
7. Inclure un <h2> contenant le mot-clé principal.
8. Inclure plusieurs <h3> contenant le mot-clé principal.
9. Ajouter 1 lien sortant pertinent (Wikipedia, Ameli, Doctolib…).
10. Viser environ 1% de densité du mot-clé sans bourrage.
11. Ajouter 1 ou 2 liens internes vers un produit.
12. Ajouter 1 ou 2 liens internes vers une collection.
13. Définir un mot-clé principal pertinent.
14. Le titre doit contenir un power word.
15. Paragraphes lisibles, ton humain.
16. AUCUN emoji, AUCUN markdown.
17. Ne jamais écrire “version optimisée” ou similaire.
18. Description orientée conversion.
19. Reformuler absolument toute la description existante en supprimant toute répétition et toute ancienne marque.
20. La meta description doit faire MAXIMUM 160 caractères.
21. Le meta title doit faire MAXIMUM 70 caractères.

Renvoie STRICTEMENT ce JSON :
{
  "keyword": "",
  "title": "",
  "slug": "",
  "meta_title": "",
  "meta_description": "",
  "description_html": ""
}

Données du produit :
TITRE ACTUEL : ${product.title}
DESCRIPTION ACTUELLE : ${product.body_html}
`;

    // 🔥 Appel IA
    const ai = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4
    });

    let output = ai.choices[0].message.content.trim();

    // Nettoyage
    output = output.replace(/```json/g, "").replace(/```/g, "").trim();

    let json;
    try {
      json = JSON.parse(output);
    } catch (err) {
      console.error("❌ JSON AI error", output);
      return res.status(500).json({ error: "Invalid JSON", raw: output });
    }

    // 🔥 Mise à jour Shopify
    await updateProduct(productId, {
      id: productId,
      title: json.title,
      handle: json.slug,
      body_html: json.description_html
    });

    // 🔥 Marquer comme optimisé
    await markAsOptimized(productId);

    res.json({
      success: true,
      optimized: true,
      productId,
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

/* -------------------------------------------------------------
   🔥 ROUTE 3 : POST /optimize-collection  
   Optimise chaque produit d’une collection
-------------------------------------------------------------- */
router.post("/optimize-collection", async (req, res) => {
  try {
    const { collectionId } = req.body;

    if (!collectionId) {
      return res.status(400).json({ error: "Missing collectionId" });
    }

    const products = await getProductsByCollection(collectionId);
    if (!products.length) {
      return res.status(404).json({ error: "No products found" });
    }

    const results = [];

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

        const json = await optimizeRes.json();
        results.push({
          id: product.id,
          title: product.title,
          success: json.success || false
        });

      } catch (err) {
        results.push({
          id: product.id,
          title: product.title,
          success: false,
          error: err.message
        });
      }
    }

    res.json({
      success: true,
      optimized_count: results.length,
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
