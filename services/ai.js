const axios = require("axios");

async function optimizeProduct(product, collection = null) {
  let collectionName = "";
  let keyword = "";

  if (collection) {
    collectionName = collection.title;

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
Tu dois optimiser un produit Shopify pour obtenir un **excellent score SEO** tout en gardant un style vendeur et professionnel.

---

### 🎯 DONNÉES SOURCE

Titre : ${product.title}

Description actuelle :
${product.body_html}

Collection : ${collectionName}
Mot-clé principal : ${keyword}

---

### 🚀 OBJECTIFS SEO À RESPECTER ABSOLUMENT

1. Ajouter le mot-clé principal au **début du titre optimisé**
2. Ajouter un **power word** dans le titre (ex : Premium, Luxe, Officiel, Pro, Ultime…)
3. 600 mots minimum
4. Utiliser le mot clé :
   - dans le 1er paragraphe
   - dans tout le contenu (densité ≈ 1%)
   - dans les H2 / H3
   - dans un ALT d’image (balise <img alt="mot clé">)
5. Ajouter un lien externe utile (ex : Wikipédia, Doctolib, Ameli)
6. Ajouter un maillage interne (collection)
7. Aucun markdown (pas de ###, pas de ***, pas de —)
8. Format final **en HTML propre**
9. Fournir la **meta description SEO** (155 caractères)
10. Générer une URL optimisée (handle) courte < 75 caractères

---

### 📝 FORMAT DE SORTIE (OBLIGATOIRE EN JSON)

{
  "title": "...",
  "description_html": "...",
  "meta_description": "...",
  "handle": "..."
}

GÉNÈRE UNIQUEMENT LE JSON SANS TEXTE AUTOUR.
  `;

  const response = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-4.1",
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

  // Shopify n’accepte pas meta_description directement, mais on peut l’utiliser plus tard
  return {
    title: data.title,
    body_html: data.description_html
  };
}

module.exports = { optimizeProduct };
