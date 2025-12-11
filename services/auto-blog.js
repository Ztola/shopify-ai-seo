const fs = require("fs");
const path = require("path");
const cron = require("node-cron");
const fetch = require("node-fetch");

const {
    getAllCollections,
    getProductsByCollection,
    createBlogArticle
} = require("./shopify");

const { OpenAI } = require("openai");
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// 🔥 Chemin du fichier config auto-blog
const configPath = path.join(__dirname, "../auto-blog-config.json");

// -------------------------------------------------------------
// 1️⃣ Charger config ou créer fichier par défaut
// -------------------------------------------------------------
function loadConfig() {
    if (!fs.existsSync(configPath)) {
        const base = {
            enabled: false,
            time: "09:00",
            shopUrl: null,
            token: null,
            last_collection_index: 0,
            last_run: null
        };
        fs.writeFileSync(configPath, JSON.stringify(base, null, 2));
        return base;
    }
    return JSON.parse(fs.readFileSync(configPath));
}

// -------------------------------------------------------------
// 2️⃣ Sauvegarder config
// -------------------------------------------------------------
function saveConfig(data) {
    fs.writeFileSync(configPath, JSON.stringify(data, null, 2));
}

// -------------------------------------------------------------
// 3️⃣ Mettre jour boutique active (appel depuis /blogs/auto/start)
// -------------------------------------------------------------
async function setAutoBlogConfig(newConfig) {
    let config = loadConfig();
    config = { ...config, ...newConfig };
    saveConfig(config);
}

// -------------------------------------------------------------
// 4️⃣ Retourner statut à WordPress
// -------------------------------------------------------------
async function getAutoBlogStatus() {
    const config = loadConfig();
    return {
        enabled: config.enabled,
        time: config.time,
        last_run: config.last_run,
    };
}

let cronTask = null;

// -------------------------------------------------------------
// 5️⃣ Lancer le CRON (vérification chaque minute)
// -------------------------------------------------------------
function startAutoBlog() {
    let config = loadConfig();
    config.enabled = true;
    saveConfig(config);

    if (cronTask) cronTask.stop();

    cronTask = cron.schedule("* * * * *", async () => {
        const cfg = loadConfig();
        if (!cfg.enabled) return;

        const now = new Date();
        const hh = String(now.getHours()).padStart(2, "0");
        const mm = String(now.getMinutes()).padStart(2, "0");

        if (`${hh}:${mm}` === cfg.time) {
            console.log("⏰ Génération automatique d’un article…");
            await generateAutoBlogArticle();
        }
    });

    console.log("🟢 AutoBlog activé");
}

// -------------------------------------------------------------
// 6️⃣ Stopper le CRON
// -------------------------------------------------------------
function stopAutoBlog() {
    let config = loadConfig();
    config.enabled = false;
    saveConfig(config);

    if (cronTask) cronTask.stop();

    console.log("🔴 AutoBlog désactivé");
}

// -------------------------------------------------------------
// 7️⃣ Routine automatique → génération article
// -------------------------------------------------------------
async function generateAutoBlogArticle() {
    try {
        const cfg = loadConfig();

        if (!cfg.shopUrl || !cfg.token) {
            console.log("❌ Aucune boutique active définie pour AutoBlog.");
            return;
        }

        // Fake req headers → pour appeler les services Shopify dynamiques
        const req = {
            headers: {
                "x-shopify-url": cfg.shopUrl,
                "x-shopify-token": cfg.token
            }
        };

        // 1️⃣ Récup collections
        const collections = await getAllCollections(req);
        if (!collections.length) {
            console.log("❌ Aucune collection trouvée.");
            return;
        }

        // 2️⃣ Choisir collection selon rotation
        const index = cfg.last_collection_index % collections.length;
        const chosen = collections[index];

        cfg.last_collection_index = index + 1;
        saveConfig(cfg);

        console.log("🟣 Collection utilisée :", chosen.title);

        // 3️⃣ Produits
        const products = await getProductsByCollection(req, chosen.id);

        const showcase = `
            <div class="blog-products-auto">
                ${products.slice(0, 4).map(p => `
                    <div class="bp-card">
                        <img src="${p?.image?.src || ""}">
                        <h3>${p.title}</h3>
                        <a href="/products/${p.handle}">Voir →</a>
                    </div>
                `).join("")}
            </div>
        `;

        // 4️⃣ Prompt IA
        const prompt = `
Rédige un article SEO complet (900–1400 mots) sur la collection : "${chosen.title}".
Rédaction experte, HTML propre, sans emoji.

Ajoute ce bloc EXACT à la fin :
${showcase}

Réponds uniquement avec ce JSON :
{
  "title": "",
  "content_html": ""
}
`;

        const ai = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            temperature: 0.7,
            messages: [{ role: "user", content: prompt }]
        });

        const clean = ai.choices[0].message.content.replace(/```json|```/g, "");
        const json = JSON.parse(clean);

        // 5️⃣ Trouver un blog où publier
        const blogsRes = await fetch(
            `${process.env.SERVER_URL}/api/blogs`,
            {
                headers: {
                    "x-shopify-url": cfg.shopUrl,
                    "x-shopify-token": cfg.token
                }
            }
        );

        const blogsJson = await blogsRes.json();
        const blogId = blogsJson.blogs[0].id; // premier blog Shopify

        // 6️⃣ Publier article
        const article = await createBlogArticle(req, blogId, {
            title: json.title,
            body_html: json.content_html
        });

        cfg.last_run = new Date().toISOString();
        saveConfig(cfg);

        console.log("✔ Article automatique publié :", article.title);

        return article;

    } catch (err) {
        console.log("❌ ERREUR AutoBlog:", err.message);
    }
}

// -------------------------------------------------------------
// EXPORTS
// -------------------------------------------------------------
module.exports = {
    startAutoBlog,
    stopAutoBlog,
    getAutoBlogStatus,
    setAutoBlogConfig,
    generateAutoBlogArticle
};
