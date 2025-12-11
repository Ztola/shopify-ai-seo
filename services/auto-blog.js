// ======================================================================
// 🔥 AUTO-BLOG SERVICE — Compatible Multi-Boutiques (Cron + IA + Shopify)
// ======================================================================

const cron = require("node-cron");
const fetch = require("node-fetch");

let ACTIVE_SHOP_URL = null;
let ACTIVE_SHOP_TOKEN = null;

// Les tâches cron actives
let cronTask = null;

/* -------------------------------------------------------------
   🔥 Fonction : mettre à jour la boutique active pour le Cron
-------------------------------------------------------------- */
function updateActiveShopForCron(url, token) {
  ACTIVE_SHOP_URL = url;
  ACTIVE_SHOP_TOKEN = token;
  console.log("🔄 AutoBlog → Boutique active mise à jour :", url);
}

/* -------------------------------------------------------------
   🔥 Fonction : exécuter la création automatique d’un article
-------------------------------------------------------------- */
async function generateAutoBlogArticle() {
  try {
    if (!ACTIVE_SHOP_URL || !ACTIVE_SHOP_TOKEN) {
      console.log("⚠️ AutoBlog ignoré : aucune boutique active.");
      return;
    }

    console.log("📝 AutoBlog : génération en cours…");

    // 1️⃣ Récupérer les blogs de la boutique active
    const blogsRes = await fetch(`${process.env.SERVER_URL}/api/blogs`, {
      headers: {
        "x-shopify-url": ACTIVE_SHOP_URL,
        "x-shopify-token": ACTIVE_SHOP_TOKEN
      }
    });

    const blogsJSON = await blogsRes.json();
    const blogs = blogsJSON.blogs;

    if (!blogs || blogs.length === 0) {
      console.log("❌ Aucun blog trouvé sur Shopify.");
      return;
    }

    const blogId = blogs[0].id;

    // 2️⃣ Récupérer les collections de la boutique active
    const colRes = await fetch(`${process.env.SERVER_URL}/api/shop-data`, {
      headers: {
        "x-shopify-url": ACTIVE_SHOP_URL,
        "x-shopify-token": ACTIVE_SHOP_TOKEN
      }
    });

    const colJSON = await colRes.json();
    const collections = colJSON.data.collections;

    if (!collections.length) {
      console.log("❌ Pas de collection trouvée.");
      return;
    }

    // 3️⃣ Choisir une collection aléatoire
    const randomCol = collections[Math.floor(Math.random() * collections.length)];

    // 4️⃣ Envoyer la création auto de l’article
    await fetch(`${process.env.SERVER_URL}/api/blogs/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-shopify-url": ACTIVE_SHOP_URL,
        "x-shopify-token": ACTIVE_SHOP_TOKEN
      },
      body: JSON.stringify({
        blogId: blogId,
        topic: randomCol.title,
        scheduleDate: null
      })
    });

    console.log("✔ Article généré automatiquement :", randomCol.title);

  } catch (error) {
    console.log("❌ AutoBlog Error :", error.message);
  }
}

/* -------------------------------------------------------------
   🔥 Fonction : démarrer la tâche automatique
-------------------------------------------------------------- */
function startAutoBlog(time = "09:00") {
  if (cronTask) cronTask.destroy();

  const [hour, min] = time.split(":");

  cronTask = cron.schedule(`${min} ${hour} * * *`, () => {
    generateAutoBlogArticle();
  });

  console.log(`⏱ AutoBlog → Programmé chaque jour à ${time}`);
}

/* -------------------------------------------------------------
   🔥 Fonction : arrêter la tâche automatique
-------------------------------------------------------------- */
function stopAutoBlog() {
  if (cronTask) cronTask.destroy();
  console.log("⛔ AutoBlog arrêté.");
}

module.exports = {
  updateActiveShopForCron,
  startAutoBlog,
  stopAutoBlog
};
