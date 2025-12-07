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

  const prompt = `
Tu es un expert en copywriting e-commerce et SEO.  
Réécris ce produit Shopify de façon PRO, CLAIRE et CONVERTISSANTE.

---

### 🔍 INFORMATIONS SOURCE

Titre : ${product.title}

Description actuelle (HTML) :
${product.body_html}

Collection : ${collectionName}
Mot-clé principal : ${keyword}

---

### 🎯 OBJECTIF FINAL

Produire :

1. **Un titre optimisé SEO** (mais court, vendeur, sans répétitions)
2. **Une description HTML propre**, structurée avec :
   - <h2>
   - <h3>
   - paragraphes
   - listes à puces si utile
   - **jamais de markdown**, jamais de "##"
3. Aucune mention technique comme "meta description", pas de sections inutiles.
4. Un style professionnel, vendeur, clair.
5. Ajouter un paragraphe final avec un maillage interne élégant :
   "Découvrez plus dans notre collection ${collectionName}"  
   avec le lien :
   /collections/${collection?.handle ?? ""}
6. Génère aussi une **meta description SEO propre (155 caractères max)** séparément.

---

### 📝 FORMAT DE LA RÉPONSE (OBLIGATOIRE)

Répond UNIQUEMENT en JSON :

{
  "title": "...",
  "description_html": "...",
  "meta_description": "..."
}
`;

  const response = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-4.1-mini",
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
    body_html: data.description_html
  };
}

module.exports = { optimizeProduct };
