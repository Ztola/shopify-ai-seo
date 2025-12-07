const axios = require("axios");

async function optimizeProduct(product, collection = null) {
  let collectionName = "";
  let collectionHandle = "";
  let keyword = "";

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

  const prompt = `
Tu es un expert en SEO + copywriting e-commerce.  
Objectif : optimiser un produit Shopify pour un excellent score SEO + un style vendeur premium.

---

### 🎯 INFORMATIONS SOURCE

Titre actuel :
${product.title}

Description actuelle (HTML) :
${product.body_html}

Collection : ${collectionName}
Handle : ${collectionHandle}
Mot-clé principal : ${keyword}

---

### 🚀 RÈGLES SEO OBLIGATOIRES

1. Le **mot-clé principal** doit apparaître :
   - au début du titre
   - dans la meta description
   - dans le premier paragraphe
   - dans les H2 et H3
   - dans tout le contenu (densité ≈ 1%)
   - dans le ALT d’une image

2. Le titre doit contenir un **power word** (Premium, Luxe, Officiel, Pro, Ultime…).

3. Le contenu doit faire **minimum 600 mots**.

4. Générer un ALT image SEO avec :
   <img src="#" alt="${keyword}">

5. Ajouter un lien externe utile vers :
   https://fr.wikipedia.org/wiki/${keyword}

6. Ajouter un **maillage interne propre** vers la collection :
   <a href="/collections/${collectionHandle}">Découvrir la collection ${collectionName}</a>

   ❗ STRICT :
   - Aucun lien admin
   - Aucun lien interne type https://admin.shopify.com
   - Uniquement des URL front-office

7. HTML propre obligatoire, pas de markdown :
   - Pas de ##
   - Pas de ***
   - Pas de long traits ——

8. 155 caractères max pour la **meta description SEO**.

9. Générer un handle optimisé, court (< 75 caractères), sans espace, format Shopify :
   "mot-cle-produit-optimise"

---

### 📝 FORMAT SORTIE OBLIGATOIRE (JSON UNIQUEMENT)

{
  "title": "...",
  "description_html": "...",
  "meta_description": "...",
  "handle": "..."
}

NE JAMAIS ajouter de texte autour.
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
    handle: data.handle
  };
}

module.exports = { optimizeProduct };
