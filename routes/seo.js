// -------------------------------------------------------------
// 🧠 EXTRAIRE UNE MARQUE DYNAMIQUE DE L'URL SHOPIFY
// -------------------------------------------------------------
function getDynamicBrandName() {
  try {
    let url = process.env.SHOPIFY_SHOP_URL;
    if (!url) return "Votre Boutique";

    let base = url.split(".")[0];
    base = base.replace(/[^a-zA-Z0-9\-]/g, "");
    base = base.replace(/-/g, " ");
    base = base
      .split(" ")
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");

    return base.length > 1 ? base : "Votre Boutique";
  } catch {
    return "Votre Boutique";
  }
}

// -------------------------------------------------------------
const express = require("express");
const router = express.Router();
const { OpenAI } = require("openai");
const axios = require("axios");

// Shopify Services
const {
  getAllProducts,
  getAllCollections,
  getProductsByCollection,
  getProductById,
  updateProduct,
  markAsOptimized,
  getAllBlogs,
  getArticlesByBlog
} = require("../services/shopify");

// IA Client
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SHOP_URL = `https://${process.env.SHOPIFY_SHOP_URL}`;

// -------------------------------------------------------------
// 🔥 ROUTE 1 — /shop-data
// -------------------------------------------------------------
router.get("/shop-data", async (req, res) => {
  try {
    const collections = await getAllCollections();
    const allProducts = await getAllProducts();

    const data = { collections: {} };

    for (const col of collections) {
      const colProducts = await getProductsByCollection(col.id);

      colProducts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      data.collections[col.handle] = {
        id: col.id,
        title: col.title,
        handle: col.handle,
        url: `${SHOP_URL}/collections/${col.handle}`,
        products: colProducts.map(p => ({
          id: p.id,
          title: p.title,
          handle: p.handle,
          url: `${SHOP_URL}/products/${p.handle}`,
          optimized: p.tags?.includes("optimized") || false
        }))
      };
    }

    res.json({
      success: true,
      shop_domain: SHOP_URL,
      total_products: allProducts.length,
      total_collections: collections.length,
      data
    });
  } catch (err) {
    res.status(500).json({ error: "Shop data error", details: err.message });
  }
});

// -------------------------------------------------------------
// 🔥 ROUTE 2 — /optimize-product
// -------------------------------------------------------------
router.post("/optimize-product", async (req, res) => {
  try {
    const { productId } = req.body;
    if (!productId) return res.status(400).json({ error: "Missing productId" });

    const product = await getProductById(productId);
    if (!product) return res.status(404).json({ error: "Product not found" });

    // Trouver la collection du produit
    const collections = await getAllCollections();
    let selectedCollection = null;
    let collectionProducts = [];

    for (const col of collections) {
      const prods = await getProductsByCollection(col.id);
      if (prods.some(p => p.id == productId)) {
        selectedCollection = col;
        collectionProducts = prods.filter(p => p.id != productId);
        break;
      }
    }

    const collectionUrl = selectedCollection
      ? `${SHOP_URL}/collections/${selectedCollection.handle}`
      : null;

    const productsWithUrls = collectionProducts.map(p => ({
      title: p.title,
      url: `${SHOP_URL}/products/${p.handle}`
    }));

    // -------------------------------------------------------------
    // 🔥 TON PROMPT EXACT, PAS MODIFIÉ
    // -------------------------------------------------------------
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
– Ameli
– Inserm
– Wikipédia
– Futura-Science

❗ Le maillage externe doit être en rapport EXACT avec le mot clé principal.
</p>

<p>Conclusion émotionnelle poussant à l’achat.</p>

Ne copie JAMAIS le texte d’origine. Reformule tout.

🔥 Produit :
${product.title}

🔥 Description originale :
${product.body_html}

🔥 Collection liée :
${selectedCollection ? selectedCollection.title : "Aucune"}
${collectionUrl || "Aucune"}

🔥 Produits recommandés :
${productsWithUrls.map(p => `- ${p.title} : ${p.url}`).join("\n")}

🔥 Réponse JSON :
{
  "keyword": "",
  "title": "",
  "slug": "",
  "meta_title": "",
  "meta_description": "",
  "description_html": ""
}
`;

    // IA
    const ai = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4
    });

    let output = ai.choices[0].message.content.trim();
    output = output.replace(/```json/g, "").replace(/```/g, "");

    const json = JSON.parse(output);

    // Shopify Update
    await updateProduct(productId, {
      id: productId,
      title: json.title,
      handle: json.slug,
      body_html: json.description_html
    });

    await markAsOptimized(productId);

    res.json({ success: true, optimized: true, ...json });
  } catch (err) {
    res.status(500).json({ error: "Optimize error", details: err.message });
  }
});

// -------------------------------------------------------------
// 🔥 ROUTE 3 — OPTIMISATION D’UNE COLLECTION
// -------------------------------------------------------------
router.post("/optimize-collection", async (req, res) => {
  try {
    const { collectionId } = req.body;
    if (!collectionId) return res.status(400).json({ error: "Missing collectionId" });

    const products = await getProductsByCollection(collectionId);

    const results = [];
    for (const product of products) {
      try {
        const r = await axios.post(`${process.env.SERVER_URL}/api/optimize-product`, {
          productId: product.id
        });
        results.push({ id: product.id, success: true });
      } catch {
        results.push({ id: product.id, success: false });
      }
    }

    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ error: "Optimize collection error", details: err.message });
  }
});

// -------------------------------------------------------------
// 🧠 IA — GÉNÉRATION D’UN ARTICLE DE BLOG
// -------------------------------------------------------------
async function createBlogArticle({ title, prompt, brand, collectionUrl, productUrl }) {
  const fullPrompt = `
Tu es un expert SEO Shopify spécialisé en rédaction longue. 
Génère un article HTML compatible Shopify (1500 à 2500 mots).

STRUCTURE :
- <h1>, <h2>, <h3>
- Paragraphes lisibles
- Bannière produit <img src="${productUrl}" alt="Produit ${brand}">
- Lien interne vers la collection : ${collectionUrl}
- Lien interne vers le produit : ${productUrl}
- Lien externe FIABLE et PERTINENT (Wikipédia / Ameli / Inserm / Futura)

Aucune mention d'IA. Aucun emoji.

Sujet : ${prompt}
Titre demandé : ${title}

Réponse JSON :
{
  "title": "",
  "html": ""
}
`;

  const ai = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.5,
    messages: [{ role: "user", content: fullPrompt }]
  });

  let raw = ai.choices[0].message.content.trim();
  raw = raw.replace(/```json/g, "").replace(/```/g, "");

  return JSON.parse(raw);
}

// -------------------------------------------------------------
// 🔥 ROUTE BLOG — GÉNÉRATION ARTICLE AUTOMATIQUE
// -------------------------------------------------------------
router.post("/auto-blog", async (req, res) => {
  try {
    const { blogId, topic, scheduled_date } = req.body;
    if (!blogId || !topic)
      return res.status(400).json({ error: "Missing parameters" });

    const collections = await getAllCollections();
    const products = await getAllProducts();

    const relatedCollection =
      collections.find(c =>
        topic.toLowerCase().includes(c.title.toLowerCase())
      ) || collections[0];

    const relatedProduct =
      products.find(p =>
        topic.toLowerCase().includes(p.title.toLowerCase())
      ) || products[0];

    const article = await createBlogArticle({
      title: topic,
      prompt: topic,
      brand: getDynamicBrandName(),
      collectionUrl: `${SHOP_URL}/collections/${relatedCollection.handle}`,
      productUrl: `${SHOP_URL}/products/${relatedProduct.handle}`
    });

    const shopifyRes = await axios.post(
      `${SHOP_URL}/admin/api/2024-01/blogs/${blogId}/articles.json`,
      {
        article: {
          title: article.title,
          body_html: article.html,
          published_at: scheduled_date || new Date().toISOString()
        }
      },
      {
        headers: {
          "X-Shopify-Access-Token": process.env.SHOPIFY_ACCESS_TOKEN,
          "Content-Type": "application/json"
        }
      }
    );

    res.json({ success: true, article: shopifyRes.data.article });
  } catch (err) {
    res.status(500).json({ error: "Blog creation failed", details: err.message });
  }
});

// -------------------------------------------------------------
module.exports = router;
