const axios = require("axios");

async function optimizeProduct(product, collection = null, shopData = null) {
  let collectionName = "";
  let collectionHandle = "";
  let keyword = "";

  let relatedProducts = [];
  let relatedArticles = [];
  let collectionUrl = "";

  // --------------------------------------------
  // 🔍 Extraire les infos de la collection
  // --------------------------------------------
  if (collection) {
    collectionName = collection.title;
    collectionHandle = collection.handle;

    const clean = collection.title
      .replace(/collection|promo|officiel|produits|nouveautés/gi, "")
      .trim();

    keyword = clean.split(" ")[0] || "";
  }

  // Sécurité fallback
  if (!keyword || keyword.length < 3) {
    keyword = product.title.split(" ")[0];
  }

  // --------------------------------------------
  // 🔗 MAILLAGE INTERNE BASÉ SUR shopData
  // --------------------------------------------
  if (shopData && shopData.data && collectionHandle) {
    const colData = shopData.data.collections[collectionHandle];

    if (colData) {
      collectionUrl = `https://${process.env.SHOPIFY_SHOP_URL}/collections/${collectionHandle}`;

      // Produits liés (max 2, éviter le même produit)
      relatedProducts = colData.products
        .filter(p => p.id !== product.id)
        .slice(0, 2);
    }

    // Article de blog (max 1)
    const blogs = shopData.data.blogs;
    if (blogs) {
      const firstBlog = Object.values(blogs)[0];
      if (firstBlog && firstBlog.articles.length > 0) {
        relatedArticles = [firstBlog.articles[0]];
      }
    }
  }

  // Objet complet pour l'IA
  const internalLinks = {
    collection: collectionUrl,
    products: relatedProducts.map((p) => ({
      title: p.title,
      url: `https://${process.env.SHOPIFY_SHOP_URL}/products/${p.handle}`
    })),
    articles: relatedArticles.map((a) => ({
      title: a.title,
      url: `https://${process.env.SHOPIFY_SHOP_URL}/blogs/${a.blog_handle}/${a.handle}`
    }))
  };

  // --------------------------------------------
  // 🧠 PROMPT IA SEO PRO (GPT-4o)
  // --------------------------------------------
  const prompt = `
Tu es un expert en SEO e-commerce + copywriting premium.
Optimise une fiche produit Shopify pour un maximum de conversions et un score SEO parfait.

====================
🔗 MAILLAGE INTERNE
====================
Voici les liens internes disponibles :
${JSON.stringify(internalLinks, null, 2)}

====================
📦 DONNÉES PRODUIT
====================
Titre : ${product.title}

Description HTML actuelle :
${product.body_html}

Collection : ${collectionName}
Handle : ${collectionHandle}
Mot-clé principal : ${keyword}

====================
🎯 RÈGLES SEO STRICTES
====================

1. Le mot-clé principal doit apparaître :
   - au début du titre
   - dans la méta description
   - dans le premier paragraphe
   - dans plusieurs H2/H3
   - dans tout le contenu (≈ 1% densité)
   - dans l’attribut ALT d’une image

2. Titre obligatoire avec un power word :
   (Premium, Luxe, Ultime, Officiel, Haute Performance, etc.)

3. Contenu minimum 600 mots, ton professionnel, fluide, vendeur.

4. Ajouter une image avec ALT :
   <img src="#" alt="${keyword}">

5. Ajouter un lien externe Wikipedia :
   https://fr.wikipedia.org/wiki/${keyword}

6. Ajouter un maillage interne propre (HTML) :
   - 1 lien collection
   - 2 liens produits
   - 1 lien article de blog
   Aucun lien Shopify Admin.

7. HTML propre obligatoire :
   - PAS de ##, PAS de markdown, PAS de ---, PAS de **

8. Générer une méta description optimisée (max 155 caractères)

9. Générer un handle Shopify (< 75 caractères, tout en minuscules, tirets)

====================
📝 FORMAT DE SORTIE OBLIGATOIRE (JSON)
====================
{
  "title": "...",
  "description_html": "...",
  "meta_description": "...",
  "handle": "..."
}

Réponds UNIQUEMENT avec ce JSON.
  `;

  // --------------------------------------------
  // 🔗 APPEL API OPENAI
  // --------------------------------------------
  const response = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" }
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      }
    }
  );

  const data = JSON.parse(response.data.choices[0].message.content);

  return {
    title: data.title,
    body_html: data.description_html,
    meta_description: data.meta_description,
    handle: data.handle
  };
}

module.exports = { optimizeProduct };
