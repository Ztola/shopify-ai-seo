const axios = require("axios");

async function optimizeProduct(product, collection = null, shopData = null) {
  let collectionName = "";
  let collectionHandle = "";
  let keyword = "";

  // Variables du maillage interne
  let relatedProducts = [];
  let relatedArticles = [];
  let collectionUrl = "";

  // Détection collection + mot-clé
  if (collection) {
    collectionName = collection.title;
    collectionHandle = collection.handle;

    const clean = collection.title
      .replace(/collection|promo|officiel|produits|nouveautés/gi, "")
      .trim();

    keyword = clean.split(" ")[0] || "";
  }

  // Fallback si mot-clé trop court
  if (!keyword || keyword.length < 3) {
    keyword = product.title.split(" ")[0];
  }

  // Construire maillage interne
  if (shopData && collection) {
    const colHandle = collection.handle;
    collectionUrl = `https://${process.env.SHOPIFY_SHOP_URL}/collections/${colHandle}`;

    // 2 produits liés
    const colData = shopData.collections[colHandle];
    if (colData) {
      relatedProducts = colData.products
        .filter(p => p.id !== product.id)
        .slice(0, 2);
    }

    // 1 article lié
    const blogs = Object.values(shopData.blogs);
    if (blogs.length > 0 && blogs[0].articles.length > 0) {
      relatedArticles.push(blogs[0].articles[0]);
    }
  }

  // Liens IA
  const internalLinks = {
    collection: collectionUrl,
    products: relatedProducts.map(p => ({
      title: p.title,
      url: `https://${process.env.SHOPIFY_SHOP_URL}/products/${p.handle}`
    })),
    articles: relatedArticles.map(a => ({
      title: a.title,
      url: `https://${process.env.SHOPIFY_SHOP_URL}/blogs/news/${a.handle}`
    }))
  };


  // PROMPT IA
  const prompt = `
Tu es un expert en SEO + copywriting e-commerce.
Optimise une fiche produit Shopify en HTML propre (sans markdown).

---

### DONNÉES SOURCE

Liens internes disponibles :
${JSON.stringify(internalLinks, null, 2)}

Titre actuel :
${product.title}

Description actuelle :
${product.body_html}

Collection : ${collectionName}
Handle : ${collectionHandle}
Mot-clé principal : ${keyword}

---

### RÈGLES SEO OBLIGATOIRES

1. Mot-clé principal en début de titre, meta description, H2/H3, 1er paragraphe et alt image.
2. Titre doit contenir un power word (Premium, Pro, Luxe…).
3. 600 mots minimum.
4. ALT image :
   <img src="#" alt="${keyword}">
5. Lien externe utile :
   https://fr.wikipedia.org/wiki/${keyword}
6. Maillage interne naturel :
   - Collection : ${internalLinks.collection}
   - Produits : utiliser internalLinks.products
   - Article : utiliser internalLinks.articles
7. HTML propre :
   - pas de markdown
   - pas de ##, ***, ----
8. Meta description max 155 caractères.
9. Handle optimisé court (< 75 caractères), format Shopify.

---

### FORMAT SORTIE JSON UNIQUEMENT

{
  "title": "...",
  "description_html": "...",
  "meta_description": "...",
  "handle": "..."
}

NE PAS ajouter de texte hors du JSON.
`;

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
    handle: data.handle,
    keyword: keyword
  };
}

module.exports = { optimizeProduct };
