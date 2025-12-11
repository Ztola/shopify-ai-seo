const express = require("express");
const router = express.Router();
const cron = require("node-cron");

const {
  getAllBlogs,
  getAllCollections,
  getProductsByCollection,
  createBlogArticle
} = require("../services/shopify");

// =================================================================
// 🧠  Global Auto-Blog State
// =================================================================
let AUTOMATION_ENABLED = false;
let AUTOMATION_TIME = "09:00";
let LAST_RUN = null;

// =================================================================
// 🧪 Test route (à garder pour debug)
// =================================================================
router.get("/auto-blog-test", (req, res) => {
  res.json({
    success: true,
    message: "Auto-blog route OK — Render détecte bien le fichier."
  });
});

// =================================================================
// 🔥 AUTO-BLOG MAIN FUNCTION
// =================================================================
async function runAutoBlog(req) {
  try {
    console.log("🚀 AUTO-BLOG — DÉMARRAGE");

    const blogs = await getAllBlogs(req);
    if (!blogs.length) return console.log("❌ Aucun blog trouvé");

    const collections = await getAllCollections(req);
    if (!collections.length) return console.log("❌ Aucune collection trouvée");

    // 🎯 Choisir une collection au hasard
    const col = collections[Math.floor(Math.random() * collections.length)];
    const products = await getProductsByCollection(req, col.id);

    if (!products.length) {
      console.log("⚠️ Collection vide, passage…");
      return;
    }

    const product = products[0];

    // → Génération automatique d’un article avec bannière produit
    const article = await createBlogArticle({
      title: `Nouveautés : ${col.title}`,
      prompt: "",
      brand: "",
      collectionUrl: `/collections/${col.handle}`,
      productUrl: `/products/${product.handle}`,
      productImage: product?.image?.src || "",
      productName: product.title,
      productPrice: product?.variants?.[0]?.price || ""
    });

    // → Publication sur Shopify
    await req.shopifyClient.post(`/blogs/${blogs[0].id}/articles.json`, {
      article: {
        title: article.title,
        body_html: article.html
      }
    });

    LAST_RUN = new Date().toISOString();
    console.log("✔ AUTO-BLOG — Article publié");

  } catch (err) {
    console.log("❌ Erreur Auto-Blog:", err.message);
  }
}

// =================================================================
// 🟢 ROUTE : STATUS
// =================================================================
router.get("/auto-blog/status", (req, res) => {
  res.json({
    success: true,
    enabled: AUTOMATION_ENABLED,
    time: AUTOMATION_TIME,
    last_run: LAST_RUN
  });
});

// =================================================================
// 🟩 ROUTE : START AUTOMATION
// =================================================================
router.post("/auto-blog/start", (req, res) => {
  const { time } = req.body;

  if (!time) return res.json({ success: false, error: "Missing time" });

  AUTOMATION_ENABLED = true;
  AUTOMATION_TIME = time;

  console.log("⏱ Auto-Blog programmé à :", time);

  res.json({ success: true });
});

// =================================================================
// 🟥 ROUTE : STOP AUTOMATION
// =================================================================
router.post("/auto-blog/stop", (req, res) => {
  AUTOMATION_ENABLED = false;

  console.log("⛔ Auto-Blog arrêté");

  res.json({ success: true });
});

// =================================================================
// 🔄 TÂCHE CRON (toutes les minutes)
// =================================================================
cron.schedule("* * * * *", async () => {
  if (!AUTOMATION_ENABLED) return;

  const now = new Date();
  const h = String(now.getHours()).padStart(2, "0");
  const m = String(now.getMinutes()).padStart(2, "0");
  const currentTime = `${h}:${m}`;

  if (currentTime === AUTOMATION_TIME) {
    console.log("⏳ HEURE ATTEINTE → Lancement Auto-Blog");

    // On simule un req minimal pour Shopify
    const fakeReq = { headers: {} };

    await runAutoBlog(fakeReq);
  }
});

module.exports = router;
