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
En tant que rédacteur de descriptions de produits pour un site e-commerce, votre tâche consiste à créer des descriptions détaillées et persuasives qui incitent les clients potentiels à acheter le produit. Vos descriptions doivent être précises, informatives et convaincantes, en mettant en avant les caractéristiques clés du produit ainsi que ses avantages par rapport aux autres produits similaires sur le marché. Veuillez vous assurer que vos descriptions sont adaptées au public cible du site e-commerce et qu'elles reflètent l'image de marque de l'entreprise. Vous devriez également inclure des mots-clés pertinents dans vos descriptions pour améliorer la visibilité du produit dans les résultats de recherche. Enfin, veuillez respecter les normes éthiques lors de la rédaction des descriptions de produits, en évitant toute fausse information ou exagération. 

IMPORTANT :
- Toute description doit être réécrite (pas copiée, pas paraphrasée légèrement, mais reformulée entièrement).
- Si la description contient déjà des liens, tu dois les remplacer par :
    • soit du maillage interne (vers un autre produit ou collection),
    • soit du maillage externe pertinent (Wikipedia, Ameli, Doctolib ou d'autres source).
- Si la description contient des noms de marques existantes, tu dois les remplacer par le nom du site Shopify actuel : ${process.env.SHOPIFY_BRAND_NAME}.

Rédige une description produit en HTML en respectant exactement la structure suivante :

<div class="product__description rte quick-add-hidden"> <h2>[Titre principal du produit avec son nom ou son modèle]</h2> <p>Rédige un paragraphe d’introduction présentant brièvement la gamme, puis ajoute un lien interne cliquable vers une collection ou un produit, sous la forme d’un ancrage texte.</p> <h3>[Sous-titre accrocheur mentionnant le nom du produit et sa promesse principale]</h3> <ul> <li>[Premier avantage clé du produit]</li> <li>[Deuxième avantage clé du produit]</li> </ul> <p>Rédige un premier paragraphe expliquant en détail les bénéfices du produit, ses effets, son confort ou son utilité.</p> <p>Rédige un deuxième paragraphe décrivant la clientèle idéale, les matériaux, la qualité, la durabilité ou le design.</p> <p>Rédige un paragraphe final motivant l’achat, en insistant sur le confort, la praticité ou la transformation apportée. Termine par une phrase d’incitation à tester le produit.</p> </div>

Contraintes :

– Ne jamais copier la description d’origine : tout doit être reformulé.
– Garder la même structure (h2, lien interne sous forme d’ancrage, h3, liste à puces, 3 paragraphes).
– Ton professionnel, fluide, descriptif et orienté conversion.
– Aucun emoji, aucun markdown.
– HTML propre uniquement.

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
