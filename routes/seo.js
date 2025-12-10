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
// 📦 IMPORTS
// -------------------------------------------------------------
const express = require("express");
const router = express.Router();
const { OpenAI } = require("openai");
const axios = require("axios");

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
          optimized: p.tags?.includes("optimized") || false,
          image: p?.image?.src || null,
          price: p?.variants?.[0]?.price || null
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
// 🔥 ROUTE 2 — OPTIMIZE-PRODUCT
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
    let otherProducts = [];

    for (const col of collections) {
      const prods = await getProductsByCollection(col.id);
      if (prods.some(p => p.id == productId)) {
        selectedCollection = col;
        otherProducts = prods.filter(p => p.id != productId);
        break;
      }
    }

    const collectionUrl = selectedCollection
      ? `${SHOP_URL}/collections/${selectedCollection.handle}`
      : null;

    const productsWithUrls = otherProducts.map(p => ({
      title: p.title,
      url: `${SHOP_URL}/products/${p.handle}`
    }));


    // -------------------------------------------------------------
    // 📝 TON PROMPT EXACT POUR LA DESCRIPTION PRODUIT
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
Deux paragraphes détaillés : réduction douleur, confort, marche, ergonomie.
Inclure 1 lien externe FIABLE (Ameli, Inserm, Wikipédia, Futura-Science) et en rapport EXACT avec le sujet.
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

🔥 Réponse JSON STRICTE :
{
  "keyword": "",
  "title": "",
  "slug": "",
  "meta_title": "",
  "meta_description": "",
  "description_html": ""
}
`;

    const ai = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      messages: [{ role: "user", content: prompt }]
    });

    let raw = ai.choices[0].message.content.trim();
    raw = raw.replace(/```json/g, "").replace(/```/g, "");

    const json = JSON.parse(raw);

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
    if (!collectionId)
      return res.status(400).json({ error: "Missing collectionId" });

    const products = await getProductsByCollection(collectionId);

    const results = [];

    for (const product of products) {
      try {
        const r = await axios.post(
          `${process.env.SERVER_URL}/api/optimize-product`,
          { productId: product.id },
          { headers: { "Content-Type": "application/json" } }
        );

        results.push({
          id: product.id,
          title: product.title,
          success: true
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

  } catch (err) {
    res.status(500).json({
      error: "Optimize collection error",
      details: err.message
    });
  }
});


// -------------------------------------------------------------
// 🧠 IA — GÉNÉRATION D’UN ARTICLE DE BLOG AVEC BANNIÈRE PRODUIT
// -------------------------------------------------------------
async function createBlogArticle({ title, prompt, brand, collectionUrl, productUrl, productImage, productName, productPrice }) {

  const fullPrompt = `
Tu es un expert SEO Shopify spécialisé dans la rédaction professionnelle longue.

Ta mission : rédiger un article de blog HTML complet, structuré, fluide, avec maillage interne, externe, et des bannières produits esthétiques.

────────────────────────────────────────
📌 STRUCTURE OBLIGATOIRE DU BLOG
────────────────────────────────────────
<h1> Titre principal avec mot-clé </h1>

<h2> Sous-titre expliquant une notion clé </h2>
<p> Paragraphe fluide, humain, informatif. </p>

<!-- BANNIÈRE PRODUIT (début) -->
<div class="ecomx__product-cta-wrapper">
  <a href="${productUrl}" class="ecomx__product-cta" target="_blank">
    <img src="${productImage}" alt="${productName}">
    <span>
      <span class="ecomx__product-cta__review">⭐️ 4.8/5</span>
      <span class="ecomx__product-cta__text">${productName} — ${productPrice}€</span>
    </span>
  </a>
</div>

<h3> Sous-partie détaillée </h3>
<p> Contenu approfondi, conseils, bénéfices. </p>

<h2> Deuxième grande section informative </h2>
<p> Explication longue, structurée. </p>

<!-- BANNIÈRE PRODUIT (fin) -->
<div class="ecomx__product-cta-wrapper">
  <a href="${productUrl}" class="ecomx__product-cta" target="_blank">
    <img src="${productImage}" alt="${productName}">
    <span>
      <span class="ecomx__product-cta__review">⭐️ 4.8/5</span>
      <span class="ecomx__product-cta__text">${productName} — ${productPrice}€</span>
    </span>
  </a>
</div>

────────────────────────────────────────
📌 OBLIGATIONS SEO
────────────────────────────────────────
- 1 lien interne vers la collection : ${collectionUrl}
- 1 lien interne vers le produit : ${productUrl}
- 1 lien EXTERNE FIABLE (Ameli, Wikipédia, Inserm, Futura Sciences)
  ⚠️ Le lien doit être STRICTEMENT sur le thème du blog.
- Ton humain, professionnel, jamais robotique.
- Ne jamais écrire "IA" ou "généré automatiquement".
- HTML propre uniquement.

────────────────────────────────────────
📌 SUJET DU BLOG
────────────────────────────────────────
Titre : ${title}
Sujet : ${prompt}

────────────────────────────────────────
📌 FORMAT JSON STRICT À RENVOYER
────────────────────────────────────────
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
// 🔥 ROUTE BLOG — CRÉATION AUTOMATIQUE D’ARTICLE
// -------------------------------------------------------------
router.post("/auto-blog", async (req, res) => {
  try {
    const { blogId, topic, scheduled_date } = req.body;

    if (!blogId || !topic) {
      return res.status(400).json({
        success: false,
        error: "Missing blogId or topic"
      });
    }

    // -----------------------------------------
    // 1️⃣ RÉCUPÉRATION COLLECTION + PRODUIT
    // -----------------------------------------
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

    // -----------------------------------------
    // 2️⃣ EXTRACTION PRODUIT (image + prix)
    // -----------------------------------------
    const productImage =
      relatedProduct?.image?.src ||
      relatedProduct?.images?.[0]?.src ||
      "https://via.placeholder.com/600x600?text=Product";

    const productName = relatedProduct?.title || "Produit";
    const productPrice =
      relatedProduct?.variants?.[0]?.price || "—";

    const collectionUrl = `${SHOP_URL}/collections/${relatedCollection.handle}`;
    const productUrl = `${SHOP_URL}/products/${relatedProduct.handle}`;

    // -----------------------------------------
    // 3️⃣ GÉNÉRATION ARTICLE AVEC IA
    // -----------------------------------------
    const article = await createBlogArticle({
      title: topic,
      prompt: topic,
      brand: getDynamicBrandName(),
      collectionUrl,
      productUrl,
      productImage,
      productName,
      productPrice
    });

    // -----------------------------------------
    // 4️⃣ PUBLICATION SHOPIFY
    // -----------------------------------------
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

    // -----------------------------------------
    // 5️⃣ RÉPONSE FINALE
    // -----------------------------------------
    return res.json({
      success: true,
      article: shopifyRes.data.article
    });

  } catch (err) {
    console.error("❌ Error /auto-blog", err);
    res.status(500).json({
      success: false,
      error: "Blog creation failed",
      details: err.message
    });
  }
});


// -------------------------------------------------------------
// 🔥 EXPORT ROUTER
// -------------------------------------------------------------
module.exports = router;
