// 🧠 Extraire automatiquement un nom de marque lisible depuis l'URL Shopify
function getDynamicBrandName() {
    try {
        let url = process.env.SHOPIFY_SHOP_URL;

        if (!url || typeof url !== "string") return "Votre Boutique";

        // 1. Retirer tout après le premier point → myshopify.com, .fr, .com...
        let base = url.split(".")[0];

        // 2. Nettoyer tout caractère inutile
        base = base.replace(/[^a-zA-Z0-9\-]/g, "");

        // 3. Convertir les tirets en espaces → confort-orthopedique → confort orthopedique
        base = base.replace(/-/g, " ");

        // 4. Capitaliser chaque mot → confort orthopedique → Confort Orthopedique
        base = base
            .split(" ")
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(" ");

        // Sécurité au cas où
        if (!base || base.length < 2) return "Votre Boutique";

        return base;
    } catch (err) {
        return "Votre Boutique";
    }
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
   Récupère : collections + produits + URLs propres pour le maillage interne
-------------------------------------------------------------- */
router.get("/shop-data", async (req, res) => {
  try {
    const collections = await getAllCollections();
    const allProducts = await getAllProducts();

    if (!collections || collections.length === 0) {
      return res.status(500).json({ error: "No collections found" });
    }

    // Domaine complet du shop  
    const SHOP_DOMAIN = `https://${process.env.SHOPIFY_SHOP_URL}`;

    const data = { collections: {} };

    for (const col of collections) {
      const colProducts = await getProductsByCollection(col.id);

      // Tri par date de création (du plus récent au plus ancien)
      colProducts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      // Construire URLs propres pour toute la collection
      const collectionUrl = `${SHOP_DOMAIN}/collections/${col.handle}`;

      const productsWithUrls = colProducts.map((p) => ({
        id: p.id,
        title: p.title,
        handle: p.handle,
        url: `${SHOP_DOMAIN}/products/${p.handle}`,
        optimized: p.tags?.includes("optimized") || false
      }));

      data.collections[col.handle] = {
        id: col.id,
        title: col.title,
        handle: col.handle,
        url: collectionUrl,
        products: productsWithUrls
      };
    }

    res.json({
      success: true,
      shop_domain: SHOP_DOMAIN,
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

    /* -------------------------------------------------------------
       🔥 Récupération du nom dynamique de la boutique
    -------------------------------------------------------------- */
    function getDynamicBrand() {
      if (!process.env.SHOPIFY_SHOP_URL) return "VotreBoutique";
      const domain = process.env.SHOPIFY_SHOP_URL.split(".")[0];
      return domain.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    }

    const BRAND = getDynamicBrand();

    /* -------------------------------------------------------------
       🔥 Récupération collection + produits pour MAILLAGE INTERNE
    -------------------------------------------------------------- */
    const collections = await getAllCollections();
    let selectedCollection = null;
    let collectionProducts = [];

    for (const col of collections) {
      const prods = await getProductsByCollection(col.id);
      if (prods.some((p) => p.id == productId)) {
        selectedCollection = col;
        collectionProducts = prods.filter((p) => p.id != productId);
        break;
      }
    }

    const SHOP_URL = `https://${process.env.SHOPIFY_SHOP_URL}`;

    const collectionUrl = selectedCollection
      ? `${SHOP_URL}/collections/${selectedCollection.handle}`
      : null;

    const productsWithUrls = collectionProducts.map((p) => ({
      title: p.title,
      url: `${SHOP_URL}/products/${p.handle}`
    }));

    // 🔥 Prompt IA
    const prompt = `
Tu es un expert SEO Shopify spécialisé dans la rédaction de descriptions produits orientées conversion.

Ta mission : générer une description HTML complète au même style, même structure et même logique que l’exemple suivant, mais totalement adaptée au produit donné :

=== EXEMPLE DE STYLE À REPRODUIRE ===

<h2><strong>{{PRODUCT_NAME}}™</strong> | <strong>{{CATEGORY_NAME}}</strong> : Confort supérieur et maintien avancé</h2>

<p>
Introduction présentant le bénéfice principal, incluant deux liens internes :
– Un lien vers une collection liée.
<p>
Ajoute un lien interne obligatoire vers un produit recommandé.
</p>
Description centrée sur le confort, le soutien, l'élégance et l’usage quotidien.
</p>

<h3>Redécouvrez le confort et la stabilité avec les <strong>{{PRODUCT_NAME}}™</strong></h3>

<ul>
    <li><strong>Bénéfice 1</strong> : Explication claire.</li>
    <li><strong>Bénéfice 2</strong> : Explication claire.</li>
    <li><strong>Bénéfice 3</strong> : Explication claire.</li>
    <li><strong>Bénéfice 4</strong> : Explication claire.</li>
    <li><strong>Bénéfice 5</strong> : Explication claire.</li>
    <li><strong>Bénéfice 6</strong> : Explication claire.</li>
</ul>

<p>
Deux paragraphes de développement expliquant :
– La réduction de la douleur.
– Le confort quotidien.
– Les usages possibles (ville, travail, marche…).
– Le soutien ergonomique.
</p>
<p>
Inclure également 1 lien externes fiables comme :
– Ameli (santé)
– Inserm / Wikipédia (source scientifique)
- Futura-Science
❗ RÈGLE IMPORTANTE : Le maillage externe doit traiter EXACTEMENT du sujet lié au mot-clé principal ou à la collection (ex. douleurs plantaires, marche, fasciite plantaire, soutien orthopédique, semelles, biomécanique…).  
N'inclure AUCUN lien externe qui n’est pas en rapport direct avec le thème.
</p>

<p>
Conclusion émotionnelle valorisant :
– La nécessité d’acheter dès maintenant
</p>

Contraintes :

– Ne jamais copier la description d’origine : tout doit être reformulé.
– HTML propre uniquement.

🔥 DONNÉES DU PRODUIT :
TITRE : ${product.title}
DESCRIPTION ORIGINALE : ${product.body_html}

🔥 COLLECTION DU PRODUIT :
Nom : ${selectedCollection ? selectedCollection.title : "Aucune"}
URL : ${collectionUrl || "Aucune"}

🔥 PRODUITS DE LA COLLECTION POUR MAILLAGE INTERNE :
${productsWithUrls.map((p) => `- ${p.title} : ${p.url}`).join("\n")}

🔥 Format de réponse OBLIGATOIRE (JSON uniquement) :
{
  "keyword": "",
  "title": "",
  "slug": "",
  "meta_title": "",
  "meta_description": "",
  "description_html": ""
}
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
