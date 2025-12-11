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
Description centrée sur le confort, le soutien, l'élégance et l'usage quotidien.
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
Tu es un expert en SEO e-commerce et en copywriting orienté conversion.
Tu dois rédiger un article de blog complet en français, optimisé SEO, structuré, professionnel,
compatible Shopify, lisible et orienté valeur.

────────────────────────────────────────
🎯 OBJECTIF
────────────────────────────────────────
- Attirer un trafic Google qualifié.
- Répondre exactement aux questions que se pose l’utilisateur.
- Fournir une vraie valeur informationnelle.
- Orienter naturellement vers le produit suivant (sans vendre agressivement) :
${productName} (${productUrl})
- Mentionner subtilement la collection : ${collectionUrl}

────────────────────────────────────────
🧑‍💼 CIBLE
────────────────────────────────────────
- Profil du client idéal : personne souffrant d’un problème lié au sujet.
- Niveau de connaissance : débutant/intermédiaire.
- Ton : expert, rassurant, premium.
- Utiliser le "vous" de manière cohérente.

────────────────────────────────────────
🔎 SEO
────────────────────────────────────────
- Intégrer le mot-clé principal dans :
  - H1
  - Introduction
  - Un H2 majeur
  - Conclusion
- Intégrer naturellement des variantes sémantiques.
- Ne jamais bourrer de mots-clés.
- Longueur : 1300 à 1800 mots.

────────────────────────────────────────
📐 STRUCTURE EXIGÉE DE L’ARTICLE
────────────────────────────────────────

<h1> Titre principal optimisé SEO avec le mot-clé </h1>

INTRODUCTION (3–5 phrases) :
- Reformule le problème du lecteur.
- Explique pourquoi cet article va l’aider.
- Introduit subtilement le type de produits vendus (sans publicité).

<h2>Question clé que se pose l'utilisateur liée au sujet</h2>
<p>Explications claires, pédagogiques, structurées.</p>

<!-- BANNIÈRE PRODUIT (style premium + taille réduite) -->
<div style="margin:20px 0; padding:12px; border:1px solid #eee; border-radius:12px; max-width:450px;">
  <a href="${productUrl}" style="text-decoration:none; display:flex; gap:10px; align-items:center;" target="_blank">
    <img src="${productImage}" alt="${productName}" style="width:120px; height:auto; border-radius:8px; object-fit:cover;">
    <div style="display:flex; flex-direction:column;">
      <span style="font-size:14px; color:#ffb400;">⭐️ 4.8/5</span>
      <span style="font-size:15px; font-weight:600;">${productName}</span>
      <span style="font-size:14px; color:#444;">${productPrice}€</span>
    </div>
  </a>
</div>

<h2>Deuxième grande question fréquente</h2>
<p>Réponse claire, détaillée, avec exemples.</p>

<h3>Sous-question ou nuance importante</h3>
<p>Développement, conseils précis, informations utiles.</p>

<h2>Conseils pratiques et étapes à suivre</h2>
<ul>
  <li>Étape 1 détaillée</li>
  <li>Étape 2</li>
  <li>Étape 3</li>
  <li>Étape 4</li>
</ul>

<h2>Erreurs à éviter</h2>
<ul>
  <li>Erreur courante 1</li>
  <li>Erreur courante 2</li>
</ul>

<!-- DEUXIÈME BANNIÈRE PRODUIT -->
<div style="margin:25px 0; padding:12px; border:1px solid #eee; border-radius:12px; max-width:450px;">
  <a href="${productUrl}" style="text-decoration:none; display:flex; gap:10px; align-items:center;" target="_blank">
    <img src="${productImage}" alt="${productName}" style="width:120px; height:auto; border-radius:8px; object-fit:cover;">
    <div style="display:flex; flex-direction:column;">
      <span style="font-size:14px; color:#ffb400;">⭐️ 4.8/5</span>
      <span style="font-size:15px; font-weight:600;">${productName}</span>
      <span style="font-size:14px; color:#444;">${productPrice}€</span>
    </div>
  </a>
</div>

<h2>Sources fiables et informations externes</h2>
<p>
Inclure un lien externe FIABLE et PERTINENT parmi :  
<a href="https://fr.wikipedia.org" target="_blank">Wikipédia</a>,
<a href="https://www.inserm.fr" target="_blank">Inserm</a>,
<a href="https://www.futura-sciences.com" target="_blank">Futura Sciences</a>.
</p>

<h2>Conclusion</h2>
<p>
Récapitulatif clair.  
Rappeler pourquoi comprendre le sujet aide réellement le lecteur.  
Proposer subtilement le produit comme solution naturelle : <a href="${productUrl}">${productName}</a>.
</p>

À la fin du JSON, propose 3 titres alternatifs optimisés SEO.

────────────────────────────────────────
📌 FORMAT DE SORTIE JSON STRICT :
────────────────────────────────────────
\{
  "title": "",
  "html": ""
\}
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
// 🔥 EXPORT ROUTER
// -------------------------------------------------------------
module.exports = router;
